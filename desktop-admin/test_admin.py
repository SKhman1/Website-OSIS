import copy
import io
import json
import os
import tempfile
import unittest
import threading
import time
from pathlib import Path
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PySide6.QtWidgets import QApplication
from PIL import Image
from client import Client
from importers import import_rundown, prepare_photo
from main import Window, Editor, STYLE
from provision import encode_password
from gui_async import start_job
from PySide6.QtCore import QEventLoop, QTimer

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([]); cls.app.setStyleSheet(STYLE)
        cls.root = Path(__file__).resolve().parent.parent
        cls.seed = json.loads((cls.root / "dist-pages/content-seed.json").read_text(encoding="utf-8"))
    def test_credentials_not_persisted_or_redirected(self):
        for url in ["http://example.com", "https://user:password@example.com", "https://example.com?token=secret"]:
            with self.assertRaises(ValueError): Client(url)
        self.assertEqual(Client("https://example.com").token, "")
    def test_csv_rundown_and_invalid_overlap(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "rundown.csv"; p.write_text("Mulai,Selesai,Agenda,Lokasi\n07:00,07:30,Registrasi,Aula\n07:30,08:00,Pembukaan,Aula\n", encoding="utf-8")
            self.assertEqual(len(import_rundown(p)), 2)
            p.write_text("Mulai,Selesai,Agenda,Lokasi\n07:00,08:00,A,Aula\n07:30,08:30,B,Aula\n", encoding="utf-8")
            with self.assertRaises(ValueError): import_rundown(p)
    def test_xlsx_values_import_and_formula_rejected(self):
        # Synthetic importer fixture, never a user workbook.
        from openpyxl import Workbook
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "rundown.xlsx"; workbook = Workbook(); sheet = workbook.active
            sheet.append(["Mulai", "Selesai", "Agenda", "Lokasi"]); sheet.append(["07:00", "07:30", "Registrasi", "Aula"]); workbook.save(p)
            self.assertEqual(import_rundown(p)[0]['agenda'], 'Registrasi')
            sheet['C2'] = '=1+1'; workbook.save(p)
            with self.assertRaisesRegex(ValueError, 'formula'): import_rundown(p)
    def test_photo_reencoded_without_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "photo.png"; Image.new("RGB", (320, 240), "orange").save(p)
            data = prepare_photo(p); self.assertEqual(data[8:12], b"WEBP")
            self.assertLess(len(data), 1024 * 1024)
    def test_password_verifier_matches_node_parameters(self):
        encoded = encode_password("A sufficiently long test password", bytes.fromhex("00" * 16))
        self.assertTrue(encoded.startswith("$scrypt$32768$8$3$")); self.assertEqual(len(encoded.split("$")[-1]), 64)
    def test_forms_preserve_results_and_all_core_fields(self):
        for kind in ("people", "departments", "programs"):
            original = copy.deepcopy(self.seed[kind][0]); editor = Editor(kind, original, lambda *_: None)
            self.assertEqual(editor.value(), original)
    def test_reload_and_navigation_do_not_overwrite_new_server_data(self):
        window = Window(self.root, "http://127.0.0.1:8791"); window.client = Client("http://127.0.0.1:8791"); window.client.user = {"username": "qa", "role": "owner"}
        window.loaded({"content": copy.deepcopy(self.seed), "version": 0, "publishedVersion": 0})
        window.editor.fields["vision"][0].setPlainText("Stale local form")
        newer = copy.deepcopy(self.seed); newer["vision"] = "Newer server version"
        window.loaded({"content": newer, "version": 1, "publishedVersion": 0})
        self.assertEqual(window.content["vision"], "Newer server version")
        window.navigate(1); window.editor.fields["name"][0].setText("A changed advisor")
        window.mark_dirty(); window.select_item(1)
        self.assertEqual(window.content["people"][0]["name"], "A changed advisor")
        window.dirty = window.form_dirty = False; window.close()
    def test_lock_drops_session_and_hidden_editor_data(self):
        window = Window(self.root); window.client = Client('https://example.com'); window.client.user = {'username': 'qa', 'role': 'owner'}; window.client.token = 'private'
        window.loaded({'content': copy.deepcopy(self.seed), 'version': 0, 'publishedVersion': 0}); window.lock()
        self.assertIsNone(window.content); self.assertEqual(window.client.token, ''); self.assertIsNone(window.editor); self.assertEqual(window.items.count(), 0)
        self.assertEqual(window.scroll.widget().findChildren(type(window.password)), []); window.close()
    def test_worker_success_and_failure_arrive_on_gui_thread(self):
        window = Window(self.root); gui_thread = threading.get_ident()
        for raises in (False, True):
            loop = QEventLoop(); received = []; worker_threads = []
            def work():
                worker_threads.append(threading.get_ident()); time.sleep(.02)
                if raises: raise ValueError('Disposable test failure')
                return 'result'
            def success(value): received.append(('success', value, threading.get_ident())); loop.quit()
            def failure(exc): received.append(('failure', type(exc).__name__, threading.get_ident())); loop.quit()
            start_job(window, work, success, failure)
            timeout = QTimer(); timeout.setSingleShot(True); timeout.timeout.connect(loop.quit); timeout.start(2000); loop.exec(); timeout.stop()
            self.assertEqual(received, [('failure' if raises else 'success', 'ValueError' if raises else 'result', gui_thread)])
            self.assertNotEqual(worker_threads[0], gui_thread); self.assertEqual(len(window._jobs), 0)
        window.close()

if __name__ == "__main__": unittest.main()
