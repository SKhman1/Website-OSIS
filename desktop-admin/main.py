"""VND Console: native Qt Widgets, no HTML renderer and no embedded browser."""
import argparse
import copy
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from PySide6.QtCore import Qt, Signal, QSettings, QTimer, QLocale
from PySide6.QtGui import QFont, QCloseEvent, QPixmap, QIntValidator
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QPlainTextEdit, QFormLayout, QListWidget, QStackedWidget, QScrollArea, QComboBox, QCheckBox,
    QDialog, QDialogButtonBox, QMessageBox, QFileDialog, QTableWidget, QTableWidgetItem, QHeaderView, QFrame)
from client import Client, ApiError
from importers import import_rundown, prepare_photo
from provision import provision_account
from gui_async import start_job

BASE_URL = "https://vnd-smkdipo1.pages.dev"
STYLE = """
QWidget { background: #fbfaf7; color: #232924; font-size: 14px; }
QMainWindow { background: #fbfaf7; }
QLabel#title { font-size: 28px; font-weight: 700; }
QLabel#subtle { color: #667166; }
QFrame#sidebar { background: #f1f0eb; border-right: 1px solid #dedfd7; }
QListWidget { background: white; border: 1px solid #dedfd7; border-radius: 10px; padding: 5px; }
QListWidget::item { padding: 12px; border-radius: 7px; }
QListWidget::item:selected { color: #703500; background: #ffe7cd; }
QLineEdit, QPlainTextEdit, QComboBox { background: white; border: 1px solid #d5d9d0; border-radius: 7px; padding: 9px; selection-background-color: #ffe0ba; }
QLineEdit:focus, QPlainTextEdit:focus, QComboBox:focus { border: 2px solid #a84508; }
QPushButton { background: #fff; border: 1px solid #d5d9d0; border-radius: 8px; padding: 10px 16px; font-weight: 600; }
QPushButton:hover { background: #fff0df; }
QPushButton:disabled { color: #869081; background: #eeeee9; }
QPushButton#primary { background: #ff9f43; color: #232924; border: 1px solid #ff9f43; }
QPushButton#primary:hover { background: #ffb76c; }
QTableWidget { background: white; border: 1px solid #dedfd7; gridline-color: #e9e9e1; }
QHeaderView::section { background: #f1f0eb; padding: 8px; border: 0; font-weight: 600; }
QScrollArea { border: 0; }
QCheckBox { padding: 5px 0; }
"""

def label(text, style=None):
    item = QLabel(text)
    item.setTextFormat(Qt.TextFormat.PlainText)
    item.setWordWrap(True)
    if style: item.setObjectName(style)
    return item

def button(text, callback, primary=False):
    item = QPushButton(text)
    item.setCursor(Qt.CursorShape.PointingHandCursor)
    if primary: item.setObjectName("primary")
    item.clicked.connect(callback)
    return item

def message(parent, title, text, question=False):
    box = QMessageBox(parent)
    box.setWindowTitle(title)
    box.setTextFormat(Qt.TextFormat.PlainText)
    box.setText(text)
    box.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No if question else QMessageBox.StandardButton.Ok)
    box.setDefaultButton(QMessageBox.StandardButton.No if question else QMessageBox.StandardButton.Ok)
    return box.exec() == QMessageBox.StandardButton.Yes

class RowsEditor(QWidget):
    changed = Signal()
    def __init__(self, columns, values=None, parent=None):
        super().__init__(parent); self.columns = columns
        layout = QVBoxLayout(self); layout.setContentsMargins(0, 0, 0, 0)
        self.table = QTableWidget(0, len(columns))
        self.table.setHorizontalHeaderLabels([caption for key, caption in columns])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setMinimumHeight(180)
        layout.addWidget(self.table)
        actions = QHBoxLayout(); actions.addWidget(button("Tambah baris", self.add_row)); actions.addWidget(button("Hapus baris terpilih", self.remove_row)); actions.addStretch()
        layout.addLayout(actions)
        self.set_values(values or [])
        self.table.itemChanged.connect(lambda _: self.changed.emit())
    def set_values(self, values):
        self.table.blockSignals(True); self.table.setRowCount(0)
        for value in values:
            row = self.table.rowCount(); self.table.insertRow(row)
            for col, (key, _) in enumerate(self.columns): self.table.setItem(row, col, QTableWidgetItem(str(value.get(key, ""))))
        self.table.blockSignals(False)
    def values(self):
        output = []
        for row in range(self.table.rowCount()):
            value = {key: (self.table.item(row, col).text().strip() if self.table.item(row, col) else "") for col, (key, _) in enumerate(self.columns)}
            if any(value.values()):
                if "photo" in value and not value["photo"]:
                    value.pop("photo"); value.pop("photoAlt", None)
                output.append(value)
        return output
    def add_row(self):
        self.table.insertRow(self.table.rowCount()); self.changed.emit()
    def remove_row(self):
        row = self.table.currentRow()
        if row >= 0: self.table.removeRow(row); self.changed.emit()

FIELDS = {
    "settings": [("cabinetName", "Nama angkatan OSIS", "text"), ("term", "Tahun ajaran (contoh: 2026/2027)", "text"), ("logo", "Logo angkatan (logo OSIS resmi tetap)", "photo"), ("logoAlt", "Deskripsi logo", "text")],
    "statistics": [("members", "Jumlah anggota OSIS", "count"), ("programs", "Jumlah program kerja", "count"), ("activities", "Jumlah kegiatan", "count")],
    "people": [("id", "ID profil", "id"), ("group", "Kelompok", "group"), ("role", "Peran", "text"), ("name", "Nama", "nullable"), ("classLabel", "Kelas", "text"), ("introduction", "Perkenalan", "long"), ("photo", "Foto", "photo"), ("photoAlt", "Deskripsi foto", "text"), ("photoIsPlaceholder", "Foto masih contoh", "bool"), ("programIds", "Program kerja (satu ID per baris)", "lines"), ("results", "Hasil kerja", "results")],
    "departments": [("id", "ID bidang", "id"), ("number", "Nomor bidang", "text"), ("name", "Nama bidang", "text"), ("description", "Deskripsi", "long"), ("photo", "Foto", "photo"), ("photoAlt", "Deskripsi foto", "text"), ("photoIsPlaceholder", "Foto masih contoh", "bool"), ("memberIds", "Anggota (satu ID profil per baris)", "lines"), ("programIds", "Program kerja (satu ID per baris)", "lines"), ("results", "Hasil kerja", "results")],
    "programs": [("id", "ID program", "id"), ("title", "Judul", "text"), ("frequency", "Frekuensi", "text"), ("description", "Deskripsi", "long"), ("details", "Pelaksanaan (satu langkah per baris)", "lines"), ("goals", "Tujuan (satu tujuan per baris)", "lines")],
    "events": [("id", "ID acara", "id"), ("title", "Nama acara", "text"), ("description", "Deskripsi", "long"), ("date", "Tanggal (YYYY-MM-DD)", "text"), ("location", "Lokasi acara", "text"), ("start", "Mulai (HH:MM WIB)", "text"), ("end", "Selesai (HH:MM WIB)", "text"), ("notify", "Notifikasi selama acara berlangsung", "bool"), ("rundown", "Rundown", "rundown")],
    "identity": [("vision", "Visi", "long"), ("missions", "Misi (satu poin per baris)", "lines")],
}

class Editor(QWidget):
    changed = Signal()
    def __init__(self, kind, data, upload, existing=True, preview_photo=None):
        super().__init__(); self.kind = kind; self.original = copy.deepcopy(data); self.fields = {}
        layout = QFormLayout(self); layout.setSpacing(15); layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)
        layout.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapAllRows)
        for key, caption, mode in FIELDS[kind]:
            value = data.get(key)
            if mode in ("long", "lines"):
                widget = QPlainTextEdit("\n".join(value or []) if mode == "lines" else str(value or "")); widget.setMinimumHeight(90); widget.setMaximumHeight(160); widget.textChanged.connect(self.changed.emit)
            elif mode == "bool":
                widget = QCheckBox(); widget.setChecked(bool(value)); widget.toggled.connect(self.changed.emit)
            elif mode == "group":
                widget = QComboBox(); widget.addItems(["core", "advisor", "member"]); widget.setCurrentText(value or "member"); widget.setEnabled(not existing); widget.currentTextChanged.connect(self.changed.emit)
            elif mode in ("rundown", "results"):
                columns = [("start", "Mulai"), ("end", "Selesai"), ("agenda", "Agenda"), ("location", "Lokasi")] if mode == "rundown" else [("id", "ID hasil"), ("title", "Judul"), ("description", "Deskripsi"), ("date", "Tanggal"), ("photo", "Foto (opsional)"), ("photoAlt", "Deskripsi foto")]
                widget = RowsEditor(columns, value or []); widget.changed.connect(self.changed.emit)
            else:
                widget = QLineEdit("" if value is None else str(value)); widget.setReadOnly(mode == "id" and existing); widget.textEdited.connect(self.changed.emit)
                if kind == "departments" and key == "number": widget.setReadOnly(True)
                if mode == "count":
                    validator = QIntValidator(0, 99999, widget); locale = QLocale.c(); locale.setNumberOptions(QLocale.NumberOption.RejectGroupSeparator); validator.setLocale(locale); widget.setValidator(validator); widget.setPlaceholderText("Kosong = belum dikonfirmasi; 0 = tidak ada")
            self.fields[key] = (widget, mode)
            if mode == "photo":
                container = QWidget(); row = QHBoxLayout(container); row.setContentsMargins(0, 0, 0, 0); row.addWidget(widget)
                row.addWidget(button("Pilih foto…", lambda checked=False, w=widget: upload(w, self)))
                layout.addRow(caption, container)
                if preview_photo: layout.addRow("", button("Preview foto", lambda checked=False, w=widget: preview_photo(w.text())))
            else: layout.addRow(caption, widget)
        if kind == "events":
            layout.addRow("", button("Import rundown Excel / CSV…", self.import_rows))
        if kind in ("people", "departments"):
            layout.addRow("", button("Foto untuk hasil kerja terpilih…", lambda: self.upload_result(upload)))
    def upload_result(self, upload):
        table = self.fields["results"][0].table
        if table.currentRow() < 0:
            message(self, "Pilih hasil kerja", "Pilih baris hasil kerja terlebih dahulu."); return
        dummy = QLineEdit(self)
        row = table.currentRow()
        dummy.textChanged.connect(lambda value: table.setItem(row, 4, QTableWidgetItem(value)))
        upload(dummy, None)
    def import_rows(self):
        path, _ = QFileDialog.getOpenFileName(self, "Pilih rundown", "", "Rundown (*.xlsx *.csv)")
        if not path: return
        try:
            rows = import_rundown(path)
            dialog = QDialog(self); dialog.setWindowTitle("Preview rundown"); dialog.resize(780, 480)
            layout = QVBoxLayout(dialog); layout.addWidget(label("Periksa urutan waktu sebelum mengganti rundown acara."))
            preview = RowsEditor(self.fields["rundown"][0].columns, rows); layout.addWidget(preview)
            actions = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
            actions.accepted.connect(dialog.accept); actions.rejected.connect(dialog.reject); layout.addWidget(actions)
            if dialog.exec() == QDialog.DialogCode.Accepted:
                rows = preview.values(); self.fields["rundown"][0].set_values(rows)
                if rows:
                    self.fields["start"][0].setText(rows[0]["start"]); self.fields["end"][0].setText(rows[-1]["end"])
                self.changed.emit()
        except Exception as exc: message(self, "Import gagal", str(exc))
    def value(self):
        data = copy.deepcopy(self.original)
        for key, (widget, mode) in self.fields.items():
            if mode in ("rundown", "results"): value = widget.values()
            elif mode == "bool": value = widget.isChecked()
            elif mode == "group": value = widget.currentText()
            elif mode in ("long", "lines"):
                value = widget.toPlainText().strip()
                if mode == "lines": value = [line.strip() for line in value.splitlines() if line.strip()]
            else: value = widget.text().strip()
            if mode == "nullable" and not value: value = None
            if mode == "count": value = int(value) if value else None
            data[key] = value
        return data

class SetupDialog(QDialog):
    def __init__(self, parent, project, local=False):
        super().__init__(parent); self.setWindowTitle("Setup akun · komputer pemilik"); self.resize(580, 390)
        layout = QVBoxLayout(self); layout.addWidget(label("Buat atau reset akun", "title")); layout.addWidget(label("Memerlukan otorisasi Wrangler di komputer ini. Reset mencabut seluruh sesi akun tersebut.", "subtle"))
        form = QFormLayout(); self.project = QLineEdit(str(project)); self.username = QLineEdit(); self.password = QLineEdit(); self.password.setEchoMode(QLineEdit.EchoMode.Password); self.confirm = QLineEdit(); self.confirm.setEchoMode(QLineEdit.EchoMode.Password)
        self.role = QComboBox(); self.role.addItems(["owner", "editor"]); self.local = QCheckBox("Database lokal untuk pengujian"); self.local.setChecked(local)
        for caption, widget in [("Folder proyek", self.project), ("Username", self.username), ("Password (minimal 15 karakter)", self.password), ("Ulangi password", self.confirm), ("Izin akun", self.role), ("", self.local)]: form.addRow(caption, widget)
        form.addRow("", button("Pilih folder proyek…", self.choose_project))
        layout.addLayout(form)
        self.status = label(""); layout.addWidget(self.status)
        self.submit = button("Siapkan akun", self.submit_account, True); layout.addWidget(self.submit)
    def choose_project(self):
        path = QFileDialog.getExistingDirectory(self, "Folder Website-OSIS", self.project.text())
        if path: self.project.setText(path)
    def submit_account(self):
        if self.password.text() != self.confirm.text(): message(self, "Password", "Kedua password belum cocok."); return
        if not message(self, "Setup akun", f"Buat/reset akun {self.username.text()} sebagai {self.role.currentText()} pada database {'lokal' if self.local.isChecked() else 'Cloudflare'}?", True): return
        project, username, password, role, local = self.project.text(), self.username.text().strip(), self.password.text(), self.role.currentText(), self.local.isChecked()
        self.submit.setEnabled(False); self.password.clear(); self.confirm.clear(); self.status.setText("Menyiapkan akun…")
        start_job(self, lambda: provision_account(project, username, password, role, local),
            lambda _: (self.status.setText("Akun siap. Tutup dialog ini lalu login."), self.submit.setEnabled(True)),
            lambda exc: (self.status.setText(str(exc)), self.submit.setEnabled(True)))
    def reject(self):
        if not getattr(self, '_jobs', None): super().reject()
    def closeEvent(self, event):
        if getattr(self, '_jobs', None): event.ignore()
        else: super().closeEvent(event)

class Window(QMainWindow):
    def __init__(self, project, base_url=BASE_URL):
        super().__init__(); self.project = project; self.setWindowTitle("VND Console · OSIS SMK Diponegoro 01"); self.resize(1180, 820); self.setMinimumSize(900, 600)
        self.settings = QSettings("VimsatiNattaDarsa", "Console")
        self.client = None; self.content = None; self.version = 0; self.dirty = False; self.form_dirty = False; self.busy = False; self.editor = None; self.kind = "identity"; self.index = -1
        self.root = QStackedWidget(); self.setCentralWidget(self.root)
        self.login_page = self.make_login(base_url); self.root.addWidget(self.login_page)
        self.workspace = self.make_workspace(); self.root.addWidget(self.workspace)
        self.lock_timer = QTimer(self); self.lock_timer.setSingleShot(True); self.lock_timer.setInterval(15 * 60 * 1000); self.lock_timer.timeout.connect(self.lock)
        QApplication.instance().installEventFilter(self)
    def eventFilter(self, obj, event):
        from PySide6.QtCore import QEvent
        if self.client and self.client.token and event.type() in (QEvent.Type.KeyPress, QEvent.Type.MouseButtonPress): self.lock_timer.start()
        return False
    def make_login(self, base_url):
        page = QWidget(); outer = QVBoxLayout(page); outer.setContentsMargins(80, 50, 80, 50); outer.addStretch()
        outer.addWidget(label("VIMSATI NATTA DARSA", "subtle")); outer.addWidget(label("VND Console", "title")); outer.addWidget(label("Kelola konten OSIS SMK Diponegoro 01 dari desktop.", "subtle"))
        form = QFormLayout(); form.setSpacing(16)
        self.url = QLineEdit(base_url if base_url != BASE_URL else self.settings.value("apiUrl", base_url)); self.username = QLineEdit(self.settings.value("username", "")); self.password = QLineEdit(); self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.password.returnPressed.connect(self.login)
        form.addRow("Alamat website", self.url); form.addRow("Username", self.username); form.addRow("Password", self.password)
        outer.addLayout(form); self.login_button = button("Masuk", self.login, True); outer.addWidget(self.login_button)
        outer.addWidget(button("Setup akun di komputer pemilik…", lambda: SetupDialog(self, self.project, self.url.text().startswith("http://127.0.0.1")).exec()))
        self.login_status = label("Password tidak disimpan. Sesi terkunci setelah 15 menit tanpa aktivitas.", "subtle"); outer.addWidget(self.login_status); outer.addStretch()
        return page
    def make_workspace(self):
        page = QWidget(); outer = QHBoxLayout(page); outer.setContentsMargins(0, 0, 0, 0)
        sidebar = QFrame(); sidebar.setObjectName("sidebar"); sidebar.setFixedWidth(240); side = QVBoxLayout(sidebar); side.setContentsMargins(20, 26, 20, 24)
        side.addWidget(label("VND Console", "title")); side.addWidget(label("OSIS SMK Diponegoro 01", "subtle"))
        self.user_label = label("", "subtle"); side.addWidget(self.user_label)
        self.nav = QListWidget(); self.nav.addItems(["Visi & misi", "Pengurus & pembina", "Seksi bidang", "Program kerja", "Kegiatan & rundown", "Identitas angkatan", "Statistik beranda", "Riwayat perubahan"]); self.nav.currentRowChanged.connect(self.navigate); side.addWidget(self.nav)
        self.nav.setWordWrap(True)
        side.addWidget(button("Ganti password…", self.change_password)); side.addWidget(button("Keluar", self.logout)); outer.addWidget(sidebar)
        body = QWidget(); layout = QVBoxLayout(body); layout.setContentsMargins(28, 24, 28, 24)
        header = QHBoxLayout(); self.heading = label("Visi & misi", "title"); header.addWidget(self.heading); header.addStretch(); self.refresh_button = button("Muat ulang", self.load_content); header.addWidget(self.refresh_button); layout.addLayout(header)
        self.status = label("", "subtle"); layout.addWidget(self.status)
        controls = QHBoxLayout(); self.save_button = button("Simpan draft ke server", self.save, True); self.preview_button = button("Preview publikasi", self.preview); self.publish_button = button("Publikasikan", self.publish)
        for widget in (self.save_button, self.preview_button, self.publish_button): controls.addWidget(widget)
        controls.addStretch(); layout.addLayout(controls)
        center = QHBoxLayout(); left = QVBoxLayout(); self.items = QListWidget(); self.items.setMinimumWidth(220); self.items.setMaximumWidth(290); self.items.currentRowChanged.connect(self.select_item); left.addWidget(self.items)
        self.items.setWordWrap(True)
        self.add_button = button("Tambah", self.add_item); self.delete_button = button("Hapus", self.delete_item); left.addWidget(self.add_button); left.addWidget(self.delete_button); center.addLayout(left)
        self.scroll = QScrollArea(); self.scroll.setWidgetResizable(True); center.addWidget(self.scroll, 1); layout.addLayout(center, 1)
        outer.addWidget(body, 1); return page
    def run(self, work, done):
        if self.busy: return
        self.busy = True; self.login_page.setEnabled(False); self.workspace.setEnabled(False)
        self.status.setText("Menghubungi server…"); self.login_status.setText("Menghubungi server…")
        def finished(result):
            self.busy = False; self.login_page.setEnabled(True); self.workspace.setEnabled(True)
            if self.client and self.client.user: self.publish_button.setEnabled(self.client.user["role"] == "owner")
            done(result)
        def failed(exc):
            self.busy = False; self.login_page.setEnabled(True); self.workspace.setEnabled(True)
            self.status.setText(str(exc)); self.login_status.setText(str(exc))
            if isinstance(exc, ApiError) and exc.status == 401 and self.root.currentIndex() == 1: self.lock()
            message(self, "Permintaan belum berhasil", str(exc))
        start_job(self, work, finished, failed)
    def login(self):
        if self.busy: return
        try: candidate = Client(self.url.text())
        except ValueError as exc: message(self, "Alamat API", str(exc)); return
        username, password = self.username.text().strip(), self.password.text(); self.password.clear()
        def work(): candidate.login(username, password); return candidate.request("GET", "/api/manage/content")
        def done(result):
            self.client = candidate; self.settings.setValue("apiUrl", candidate.base_url); self.settings.setValue("username", username)
            self.user_label.setText(f"{username} · {candidate.user['role']}"); self.root.setCurrentIndex(1); self.lock_timer.start(); self.loaded(result)
        self.run(work, done)
    def loaded(self, result):
        self.editor = None; self.index = -1
        self.content = result["content"]; self.version = result["version"]; self.dirty = self.form_dirty = False
        self.status.setText(f"Draft v{self.version} · versi terbit {result['publishedVersion']}")
        self.publish_button.setEnabled(self.client.user["role"] == "owner"); self.nav.blockSignals(True); self.nav.setCurrentRow(0); self.nav.blockSignals(False); self.navigate(0)
    def confirm_discard(self):
        return not (self.dirty or self.form_dirty) or message(self, "Perubahan belum disimpan", "Buang perubahan lokal yang belum disimpan ke server?", True)
    def load_content(self):
        if not self.confirm_discard(): return
        self.run(lambda: self.client.request("GET", "/api/manage/content"), self.loaded)
    def apply_form(self):
        if not self.editor: return
        value = self.editor.value()
        if self.kind == "identity": self.content.update(value)
        elif self.kind == "settings": self.content["identity"] = value
        elif self.kind == "statistics": self.content["statistics"] = value
        elif self.index >= 0: self.content[self.kind][self.index] = value
        if self.form_dirty: self.dirty = True
        self.form_dirty = False
    def navigate(self, row):
        if self.content is None: return
        self.apply_form(); self.index = -1; self.editor = None
        self.kind = ["identity", "people", "departments", "programs", "events", "settings", "statistics", "history"][row]
        self.heading.setText(self.nav.item(row).text()); self.refresh_items()
    def refresh_items(self):
        self.items.blockSignals(True); self.items.clear()
        self.items.setVisible(self.kind not in ("identity", "settings", "statistics")); self.add_button.setVisible(self.kind in ("people", "programs", "events")); self.delete_button.setVisible(self.kind in ("people", "programs", "events"))
        if self.kind == "identity": self.show_editor(self.content)
        elif self.kind == "settings": self.show_editor(self.content["identity"])
        elif self.kind == "statistics": self.show_editor(self.content["statistics"])
        elif self.kind == "history":
            self.scroll.setWidget(label("Pilih versi dari riwayat untuk mengembalikannya sebagai draft.")); self.run(lambda: self.client.request("GET", "/api/manage/history"), self.history_loaded)
        else:
            for item in self.content[self.kind]: self.items.addItem(f"{item.get('name') or item.get('title') or item.get('role') or item['id']}\n{item['id']}")
            if self.items.count(): self.items.setCurrentRow(0)
            else: self.scroll.setWidget(label("Belum ada item. Gunakan tombol Tambah."))
        self.items.blockSignals(False)
        if self.kind not in ("identity", "settings", "statistics", "history") and self.items.count(): self.select_item(0)
    def select_item(self, row):
        if self.kind == "history":
            if row >= 0: self.show_history(row)
            return
        self.apply_form(); self.index = row
        if row >= 0 and self.content and self.kind not in ("identity", "settings", "statistics"): self.show_editor(self.content[self.kind][row])
    def show_editor(self, item, existing=True):
        self.editor = Editor(self.kind, item, self.upload, existing, self.preview_photo); self.editor.changed.connect(self.mark_dirty); self.scroll.setWidget(self.editor)
    def mark_dirty(self):
        self.form_dirty = True; self.status.setText("Ada perubahan lokal · belum disimpan ke server")
    def add_item(self):
        self.apply_form()
        if self.kind == "people":
            sample = copy.deepcopy(self.content["people"][0]); sample.update(id=f"anggota-{len(self.content['people']) + 1}", group="member", role="Anggota", name=None, classLabel="", introduction="Perkenalan anggota.", programIds=[], results=[])
        elif self.kind == "programs": sample = dict(id=f"program-{len(self.content['programs']) + 1}", title="Program baru", description="Deskripsi program.", frequency="Berkala", details=[], goals=[])
        elif self.kind == "events": sample = dict(id=f"acara-{len(self.content['events']) + 1}", title="Acara baru", description="Deskripsi acara.", date=datetime.now().strftime("%Y-%m-%d"), location="Sekolah", start="07:00", end="08:00", notify=False, rundown=[])
        else: return
        existing = {item["id"] for item in self.content[self.kind]}
        while sample["id"] in existing: sample["id"] += "-baru"
        self.content[self.kind].append(sample); self.dirty = True; self.refresh_items(); self.items.setCurrentRow(len(self.content[self.kind])-1); self.show_editor(sample, False)
    def delete_item(self):
        self.apply_form()
        if self.index < 0: return
        item = self.content[self.kind][self.index]
        if self.kind == "people" and item["group"] == "core": message(self, "Peran tetap", "Keempat pengurus inti harus tetap tersedia."); return
        if not message(self, "Hapus dari draft", f"Hapus {item['id']}? Periksa referensi anggota/program sebelum menyimpan.", True): return
        self.content[self.kind].pop(self.index); self.index = -1; self.editor = None; self.dirty = True; self.refresh_items()
    def save(self):
        self.apply_form(); content = copy.deepcopy(self.content); version = self.version
        def done(result): self.version = result["version"]; self.dirty = False; self.status.setText(f"Draft v{self.version} tersimpan · belum dipublikasikan")
        self.run(lambda: self.client.request("PUT", "/api/manage/content", {"version": version, "content": content}), done)
    def preview(self):
        self.apply_form(); dialog = QDialog(self); dialog.setWindowTitle("Preview isi publikasi"); dialog.resize(900, 650); layout = QVBoxLayout(dialog)
        layout.addWidget(label("Periksa konten sebelum publikasi. Perubahan lokal perlu disimpan terlebih dahulu.", "subtle"))
        view = QPlainTextEdit(); view.setReadOnly(True)
        identity = self.content["identity"]; stats = self.content["statistics"]
        lines = ["IDENTITAS ANGKATAN", identity["cabinetName"], identity["term"], f"Logo: {identity['logo']}", "", "STATISTIK", *[f"{caption}: {stats[key] if stats[key] is not None else 'Belum dikonfirmasi (angka contoh)'}" for key, caption in [("members", "Anggota OSIS"), ("programs", "Program kerja"), ("activities", "Kegiatan")]], "", "VISI", self.content["vision"], "", "MISI", *self.content["missions"], "", "PENGURUS"]
        def result_lines(items):
            output = []
            for item in items: output.extend([f"Hasil: {item['title']} · {item['date']}", item['description'], f"Foto hasil: {item.get('photo') or 'Tanpa foto'}"])
            return output
        for item in self.content["people"]: lines.extend([f"{item['role']} · {item['name'] or 'Nama akan diumumkan'}", item['introduction'], f"Foto: {item['photo']}", "Program: " + ", ".join(item['programIds']), *result_lines(item['results']), ""])
        lines.append("SEKSI BIDANG")
        for item in self.content["departments"]: lines.extend([item['name'], item['description'], "Anggota: " + ", ".join(item['memberIds']), "Program: " + ", ".join(item['programIds']), *result_lines(item['results']), ""])
        lines.append("PROGRAM KERJA")
        for item in self.content["programs"]: lines.extend([f"{item['title']} · {item['frequency']}", item['description'], *item['details'], *item['goals'], ""])
        lines.append("KEGIATAN")
        for item in self.content["events"]:
            lines.extend([f"{item['title']} · {item['date']} · {item['start']}–{item['end']} WIB", item['description'], *[f"{r['start']}–{r['end']} · {r['agenda']} · {r['location']}" for r in item['rundown']], ""])
        view.setPlainText("\n".join(lines)); layout.addWidget(view); layout.addWidget(button("Tutup preview", dialog.accept)); dialog.exec()
    def publish(self):
        self.apply_form()
        if self.dirty: message(self, "Simpan dulu", "Simpan draft ke server sebelum menerbitkan."); return
        if not message(self, "Publikasikan", f"Terbitkan seluruh draft v{self.version} ke website siswa?", True): return
        def done(result): self.version = result["version"]; self.status.setText(f"Versi {self.version} sudah terbit · website memperbarui konten dalam sekitar 30 detik")
        self.run(lambda: self.client.request("POST", "/api/manage/publish", {"version": self.version}), done)
    def upload(self, target, editor):
        path, _ = QFileDialog.getOpenFileName(self, "Pilih foto", "", "Foto (*.jpg *.jpeg *.png *.webp)")
        if not path: return
        def done(result):
            target.setText(result["path"])
            if editor and "photoIsPlaceholder" in editor.fields: editor.fields["photoIsPlaceholder"][0].setChecked(False)
            self.mark_dirty(); self.status.setText("Foto siap · isi deskripsi foto, lalu simpan draft")
        self.run(lambda: self.client.request("POST", "/api/manage/media", photo=prepare_photo(path)), done)
    def preview_photo(self, path):
        def done(data):
            pixmap = QPixmap()
            if not pixmap.loadFromData(data): message(self, "Preview foto", "Foto tidak dapat dibaca."); return
            dialog = QDialog(self); dialog.setWindowTitle("Preview foto"); dialog.resize(650, 550); layout = QVBoxLayout(dialog)
            image = QLabel(); image.setAlignment(Qt.AlignmentFlag.AlignCenter); image.setPixmap(pixmap.scaled(600, 450, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)); layout.addWidget(image)
            layout.addWidget(button("Tutup", dialog.accept)); dialog.exec()
        self.run(lambda: self.client.photo(path), done)
    def history_loaded(self, result):
        self.history = result["items"]; self.items.blockSignals(True); self.items.clear()
        for item in self.history: self.items.addItem(f"v{item['version']} · {item['action']}\n{item.get('username') or 'Pemilik'} · {datetime.fromtimestamp(item['created_at']).strftime('%d/%m %H:%M')}")
        self.items.blockSignals(False); self.status.setText("Riwayat 50 perubahan terakhir")
    def show_history(self, row):
        item = self.history[row]; panel = QWidget(); layout = QVBoxLayout(panel); layout.addWidget(label(f"Versi {item['version']}", "title")); layout.addWidget(label("Versi lama dikembalikan sebagai draft. Periksa preview sebelum menerbitkan kembali.", "subtle"))
        action = button("Kembalikan sebagai draft", lambda: self.restore(item)); action.setEnabled(self.client.user["role"] == "owner"); layout.addWidget(action); layout.addStretch(); self.scroll.setWidget(panel)
    def restore(self, item):
        if not self.confirm_discard() or not message(self, "Kembalikan versi", f"Ganti draft dengan versi {item['version']}?", True): return
        self.run(lambda: self.client.request("POST", "/api/manage/restore", {"version": self.version, "revisionId": item['id']}), lambda _: self.run(lambda: self.client.request("GET", "/api/manage/content"), self.loaded))
    def change_password(self):
        dialog = QDialog(self); dialog.setWindowTitle("Ganti password"); layout = QFormLayout(dialog)
        current, new, confirm = QLineEdit(), QLineEdit(), QLineEdit()
        for caption, widget in [("Password saat ini", current), ("Password baru (minimal 15 karakter)", new), ("Ulangi password baru", confirm)]: widget.setEchoMode(QLineEdit.EchoMode.Password); layout.addRow(caption, widget)
        def submit():
            if new.text() != confirm.text(): message(dialog, "Password", "Password baru belum cocok."); return
            data = {"current": current.text(), "next": new.text()}; current.clear(); new.clear(); confirm.clear(); dialog.accept()
            self.run(lambda: self.client.request("POST", "/api/manage/password", data), lambda _: (self.lock(), message(self, "Password diperbarui", "Seluruh sesi sudah dicabut. Login kembali dengan password baru.")))
        layout.addRow(button("Ganti password", submit, True)); dialog.exec()
    def logout(self):
        if not self.confirm_discard(): return
        self.run(lambda: self.client.logout(), lambda _: self.lock())
    def lock(self):
        if self.busy: self.lock_timer.start(30_000); return
        if self.client: self.client.token, self.client.user = "", None
        self.index = -1
        self.content = None; self.editor = None; self.dirty = self.form_dirty = False; self.lock_timer.stop(); self.root.setCurrentIndex(0); self.password.clear(); self.login_status.setText("Sesi terkunci. Login kembali untuk melanjutkan.")
        self.items.blockSignals(True); self.items.clear(); self.items.blockSignals(False)
        self.history = []; self.user_label.clear(); self.scroll.setWidget(QWidget())
    def closeEvent(self, event: QCloseEvent):
        if self.busy or not self.confirm_discard(): event.ignore(); return
        if self.client: self.client.token = ""
        event.accept()

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--project", default=str(Path(__file__).resolve().parent.parent)); parser.add_argument("--url", default=BASE_URL); parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    app = QApplication(sys.argv[:1]); app.setApplicationName("VND Console"); app.setOrganizationName("VimsatiNattaDarsa"); app.setFont(QFont("Segoe UI" if sys.platform == "win32" else "Sans Serif", 10)); app.setStyleSheet(STYLE)
    window = Window(Path(args.project), args.url); window.show()
    if args.self_test:
        # Exercise packaged plugins, spreadsheet XML, SSL and password hashing;
        # no network requests, credentials, or public content changes.
        import tempfile
        from PIL import Image
        from openpyxl import Workbook
        from provision import encode_password
        with tempfile.TemporaryDirectory() as folder:
            photo = Path(folder) / 'test.png'; Image.new('RGB', (32, 32), 'orange').save(photo)
            assert prepare_photo(photo)[8:12] == b'WEBP'
            book = Workbook(); book.active.append(['Mulai', 'Selesai', 'Agenda', 'Lokasi']); book.active.append(['07:00', '07:30', 'Uji', 'Aula'])
            sheet = Path(folder) / 'test.xlsx'; book.save(sheet); assert len(import_rundown(sheet)) == 1
            assert encode_password('Only a temporary startup test password').startswith('$scrypt$')
            Client(BASE_URL)
        from login_check import begin_login_check
        state, cleanup = begin_login_check(app, window)
        try:
            result = app.exec()
            return result if state['passed'] else 1
        finally: cleanup()
    return app.exec()

if __name__ == "__main__": sys.exit(main())
