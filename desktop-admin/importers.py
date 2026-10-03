"""Bounded import of public rundown rows; never evaluates formulas or macros."""
import csv
import io
import re
import warnings
import zipfile
from datetime import time, datetime
from pathlib import Path
from PIL import Image, ImageOps

MAX_ROWS = 200
HEADERS = {"mulai": "start", "selesai": "end", "agenda": "agenda", "lokasi": "location"}

def clock(value):
    if isinstance(value, (datetime, time)):
        return value.strftime("%H:%M")
    text = str(value or "").strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", text):
        raise ValueError("Jam harus HH:MM, misalnya 07:30.")
    return text

def import_rundown(path):
    path = Path(path)
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Ukuran rundown maksimal 2 MB.")
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.reader(stream))
    elif path.suffix.lower() == ".xlsx":
        with zipfile.ZipFile(path) as archive:
            info = archive.infolist()
            if len(info) > 200 or sum(i.file_size for i in info) > 20 * 1024 * 1024:
                raise ValueError("Excel terlalu besar setelah diekstrak.")
            if any("vba" in i.filename.lower() or "externallinks" in i.filename.lower() or i.flag_bits & 1 for i in info):
                raise ValueError("Excel dengan macro, tautan eksternal, atau enkripsi tidak didukung.")
        from openpyxl import load_workbook
        workbook = load_workbook(path, read_only=True, data_only=False, keep_links=False)
        try:
            if len(workbook.worksheets) != 1:
                raise ValueError("Gunakan satu sheet khusus rundown.")
            sheet = workbook.worksheets[0]
            rows = []
            # Do not trust forged worksheet dimensions; bound actual iteration.
            for index, row in enumerate(sheet.iter_rows(max_col=5)):
                if index > MAX_ROWS:
                    raise ValueError("Rundown maksimal 200 baris.")
                if any(cell.data_type == "f" for cell in row):
                    raise ValueError("Rundown harus nilai biasa, tanpa formula.")
                rows.append([cell.value for cell in row])
        finally:
            workbook.close()
    else:
        raise ValueError("Gunakan .xlsx atau CSV UTF-8.")
    if not rows:
        raise ValueError("File rundown kosong.")
    labels = [str(v or "").strip().lower() for v in rows[0]]
    while labels and not labels[-1]:
        labels.pop()
    if len(labels) != 4 or set(labels) != set(HEADERS):
        raise ValueError("Kolom harus Mulai, Selesai, Agenda, Lokasi (tanpa kolom tambahan).")
    result = []
    for row in rows[1:]:
        if not any(v is not None and str(v).strip() for v in row):
            continue
        if len(result) >= MAX_ROWS or len(row) > 4 and any(row[4:]):
            raise ValueError("Maksimal 200 baris dan 4 kolom.")
        item = {HEADERS[label]: row[i] if i < len(row) else "" for i, label in enumerate(labels)}
        item["start"], item["end"] = clock(item["start"]), clock(item["end"])
        item["agenda"], item["location"] = str(item["agenda"] or "").strip(), str(item["location"] or "").strip()
        if not item["agenda"] or len(item["agenda"]) > 300 or len(item["location"]) > 200:
            raise ValueError("Isi agenda/lokasi tidak valid.")
        if item["start"] >= item["end"] or result and item["start"] < result[-1]["end"]:
            raise ValueError("Jam rundown harus berurutan dan tidak bertumpuk.")
        result.append(item)
    if not result:
        raise ValueError("Belum ada baris agenda.")
    return result

def prepare_photo(path):
    path = Path(path)
    if path.stat().st_size > 15 * 1024 * 1024 or path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        raise ValueError("Foto harus JPG/PNG/WebP, maksimal 15 MB.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(path) as original:
            if original.width * original.height > 24_000_000:
                raise ValueError("Resolusi foto maksimal 24 megapiksel.")
            image = ImageOps.exif_transpose(original).convert("RGBA" if "A" in original.getbands() else "RGB")
            image.thumbnail((1600, 1600))
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=85, method=4)
    data = output.getvalue()
    if len(data) > 1024 * 1024:
        raise ValueError("Hasil foto masih terlalu besar.")
    return data
