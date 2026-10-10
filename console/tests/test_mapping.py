import sys
from pathlib import Path
sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parents[1] / "tools")]
import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import io,tempfile,unittest
from pathlib import Path
from PIL import Image
from openpyxl import Workbook
from PySide6.QtWidgets import QApplication
from agenda_mapping import read_grid,detect_plans,mapped_blocks,ai_payload
from agenda_ui import FlexibleAgendaDialog
from main import Editor
from importers import prepare_favicon

class MappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.app=QApplication.instance() or QApplication([])
    def fixture(self,path):
        book=Workbook();s=book.active;s.title='Jadwal';s['B2']='Trip observasi';s['B3']='14 Oktober 2026'
        s.append([]);s.append(['PIC','Agenda','Jam mulai','Jam selesai','Tempat']);s.append(['Mentor','Registrasi','7.00','08.00','Aula']);s.append(['Mentor','Istirahat','21:30','04:00','Rumah']);
        private=book.create_sheet('Kontak');private['A1']='081234567890';private['B1']='=HYPERLINK("https://example.test")';book.save(path);return book
    def test_reordered_aliases_original_text_and_private_sheet_exclusion(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'test.xlsx';self.fixture(path);grid=read_grid(path,'Jadwal','A1:E7');plan=detect_plans(grid);rows=mapped_blocks(grid,plan)
            self.assertEqual(rows[0]['date'],'2026-10-14');self.assertEqual(rows[0]['title'],'Trip observasi');self.assertEqual(rows[0]['rundown'][0]['start'],'07:00');self.assertEqual(rows[0]['rundown'][0]['agenda'],'Registrasi');self.assertTrue(rows[0]['rundown'][1]['endNextDay']);self.assertNotIn('081234567890',str(grid));self.assertEqual(len(rows[0]['sourceRows']),2)
    def test_formula_selected_rejected_and_ai_coordinates_not_trusted(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'test.xlsx';self.fixture(path)
            with self.assertRaises(ValueError):read_grid(path,'Kontak','A1:B1')
            grid=read_grid(path,'Jadwal','A1:E7');plan=detect_plans(grid)
            plan['blocks'][0]['dateCell']='A100'
            with self.assertRaises(ValueError):mapped_blocks(grid,plan)
            for area in ('A1:Z7','A1:E201','A0:E7'):
                with self.assertRaises(ValueError):read_grid(path,'Jadwal',area)
    def test_ai_budget_redaction_and_missing_dates_stay_empty(self):
        grid={'sheet':'Jadwal','range':'A1:C4','cells':[{'ref':'A1','value':'Jam'},{'ref':'B1','value':'Kegiatan'},{'ref':'A2','value':'07:00-08:00'},{'ref':'B2','value':'Contact 081234567890 contact@example.test'}]}
        self.assertNotIn('081234567890',str(ai_payload(grid)));self.assertNotIn('contact@example.test',str(ai_payload(grid)))
        result=mapped_blocks(grid,detect_plans(grid));self.assertEqual(result[0]['date'],'')
        grid['cells'][0]['value']='x'*501
        with self.assertRaises(ValueError):ai_payload(grid)
    def test_native_mapping_review_and_favicon_follow_controls(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'test.xlsx';self.fixture(path);dialog=FlexibleAgendaDialog(None,None,path)
            dialog.area.setText('A1:E7');dialog.load_area();self.assertEqual(dialog.first.value(),6);dialog.finish();self.assertEqual(len(dialog.output[0]['rundown']),2);dialog.close()
            editor=Editor('settings',dict(cabinetName='Cabinet',term='2026/2027',logo='/images/brand/cabinet-default.webp',logoAlt='Logo'),lambda *args:None)
            self.assertIsNone(editor.value()['favicon']);editor.fields['favicon'][0].setText('/api/media/22222222-2222-4222-8222-222222222222.webp');self.assertTrue(editor.value()['favicon'].endswith('.webp'));editor.close()
    def test_favicon_stretches_visible_logo_without_padding_or_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'logo.png';image=Image.new('RGBA',(400,800));image.paste((255,159,67,255),(50,200,350,600));image.save(path)
            with Image.open(io.BytesIO(prepare_favicon(path))) as icon:
                self.assertEqual(icon.size,(256,256));self.assertEqual(icon.convert('RGBA').getchannel('A').getbbox(),(0,0,256,256));self.assertNotIn('exif',icon.info)

if __name__=='__main__':unittest.main()
