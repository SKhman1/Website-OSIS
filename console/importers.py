"""Bounded import of public rundown rows; never evaluates formulas or macros."""
import csv
import io
import re
import warnings
import zipfile
import hashlib
import posixpath
from datetime import time, datetime, date
from pathlib import Path
from PIL import Image, ImageOps

MAX_ROWS = 200
HEADERS = {"mulai": "start", "selesai": "end", "agenda": "agenda", "lokasi": "location"}

def clock(value):
    if isinstance(value, (datetime, time)):
        return value.strftime("%H:%M")
    text = str(value or "").strip().replace(".", ":")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", text):
        raise ValueError("Jam harus HH:MM, misalnya 07:30.")
    return text

MONTHS = {name: i+1 for i, name in enumerate(("januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"))}
PRESET_HEADERS = ("no", "waktu", "kegiatan", "tempat", "narasumber", "penanggung jawab")

def minutes(value):
    return int(value[:2])*60+int(value[3:])

def rundown_bounds(rows):
    if not rows: raise ValueError("Belum ada baris agenda.")
    start = min(row["start"] for row in rows)
    ends = []
    previous = ""
    for row in rows:
        row["start"] = clock(row["start"])
        row["end"] = clock(row["end"]) if row.get("end") else ""
        if row["start"] < previous: raise ValueError("Urutkan sesi berdasarkan jam mulai.")
        previous = row["start"]
        finish = minutes(row["end"])+(1440 if row.get("endNextDay") else 0) if row["end"] else minutes(row["start"])
        if row["end"] and (finish <= minutes(row["start"]) or finish-minutes(row["start"])>1440): raise ValueError("Durasi sesi tidak valid. Centang esok hari jika melewati tengah malam.")
        if not row["end"] and row.get("endNextDay"): raise ValueError("Penanda waktu tidak memiliki jam selesai esok hari.")
        if not row.get("agenda") or len(row["agenda"])>300 or any(len(row.get(key, ""))>200 for key in ("location", "speaker", "coordinator")): raise ValueError("Isi agenda/lokasi/narasumber/penanggung jawab terlalu panjang atau kosong.")
        ends.append(finish)
    end = max(ends)
    if end<=minutes(start) or end-minutes(start)>1440: raise ValueError("Acara harus memiliki durasi positif dan maksimal 24 jam.")
    return {"start":start,"end":f"{end%1440//60:02d}:{end%60:02d}","endNextDay":end>=1440}

def _simple(rows):
    labels = [str(v or "").strip().lower() for v in rows[0]]
    while labels and not labels[-1]: labels.pop()
    if len(labels)!=4 or set(labels)!=set(HEADERS): return None
    result=[]
    for row in rows[1:]:
        if not any(v is not None and str(v).strip() for v in row): continue
        if len(result)>=MAX_ROWS or len(row)>4 and any(row[4:]): raise ValueError("Maksimal 200 baris dan 4 kolom untuk format sederhana.")
        item={HEADERS[label]:row[i] if i<len(row) else "" for i,label in enumerate(labels)}
        item["start"],item["end"]=clock(item["start"]),clock(item["end"])
        item["agenda"],item["location"]=str(item["agenda"] or "").strip(),str(item["location"] or "").strip()
        if item["start"]>=item["end"] or result and item["start"]<result[-1]["end"]: raise ValueError("Jam format sederhana harus berurutan tanpa bertumpuk.")
        result.append(item)
    return {"title":"","date":"","rundown":result,"warnings":[],**rundown_bounds(result)}

def _preset(sheet, merges):
    rows=list(sheet.iter_rows(min_row=1,max_row=2001,max_col=6))
    if len(rows)>2000 and any(c.value is not None for c in rows[2000]): raise ValueError("Sheet rundown maksimal 2000 baris fisik.")
    if any(c.data_type=="f" for row in rows for c in row): raise ValueError("Sheet rundown harus nilai biasa, tanpa formula.")
    values=[[c.value for c in row] for row in rows[:2000]]
    # Fill only actual merged credit cells. An ordinary blank is never inherited.
    for first_col,first_row,last_col,last_row in merges:
        if first_col==last_col and first_col in (5,6):
            credit=values[first_row-1][first_col-1]
            for r in range(first_row,last_row+1): values[r-1][first_col-1]=credit
    headers=[i for i,row in enumerate(values) if tuple(str(v or "").strip().lower() for v in row)==PRESET_HEADERS]
    blocks=[]
    for position,header in enumerate(headers):
        before=values[max(0,header-10):header]
        marker=max((i for i,row in enumerate(before) if str(row[0] or "").strip().upper()=="RUNDOWN KEGIATAN"),default=-1)
        context=before[marker+1:]
        title=str(context[0][0] or "").strip() if marker>=0 and context else ""
        dates=[]
        for row in context:
            if isinstance(row[0],(date,datetime)): dates.append(row[0].strftime("%Y-%m-%d"));continue
            found=re.search(r"\b(\d{1,2})\s+("+"|".join(MONTHS)+r")\s+(\d{4})\b",str(row[0] or ""),re.I)
            if found: dates.append(date(int(found[3]),MONTHS[found[2].lower()],int(found[1])).isoformat())
        if not title or not dates or len(set(dates))!=1: raise ValueError(f"{sheet.title}, baris {header+1}: judul dan tanggal lengkap setiap blok harus tersedia dan cocok.")
        result=[];warnings=[]
        stop=headers[position+1] if position+1<len(headers) else len(values)
        for offset in range(header+1,stop):
            row=values[offset]
            if not isinstance(row[0],(int,float)) or isinstance(row[0],bool): continue
            if len(result)>=MAX_ROWS: raise ValueError("Maksimal 200 sesi per hari.")
            period=row[1];parts=re.split(r"\s*[-–—]\s*",period.strip()) if isinstance(period,str) else [period]
            if len(parts)>2: raise ValueError(f"{sheet.title}, baris {offset+1}: waktu tidak valid.")
            a=clock(parts[0]);b=clock(parts[1]) if len(parts)==2 else ""
            item={"start":a,"end":b,"endNextDay":bool(b and b<a),"agenda":str(row[2] or "").strip(),"location":str(row[3] or "").strip(),"speaker":str(row[4] or "").strip(),"coordinator":str(row[5] or "").strip()}
            for key in ("location","speaker","coordinator"):
                if item[key]=="-": item[key]=""
            # Flag unusual same-location daytime overlaps for human review; never repair source data silently.
            if result:
                last=result[-1]
                if last["end"] and not last["endNextDay"] and last["end"]>a and last["location"]==item["location"]:
                    warnings.append(f"{sheet.title}, baris {offset}: {last['agenda'].splitlines()[0]} ({last['start']}–{last['end']}) bertumpuk dengan sesi berikutnya. Periksa jam sebelum publikasi.")
            result.append(item)
        blocks.append({"title":title,"date":dates[0],"rundown":result,"warnings":warnings,"source":sheet.title,**rundown_bounds(result)})
    return blocks

def xlsx_metadata(path):
    """Reject oversized/active packages before any workbook reader allocation."""
    if Path(path).stat().st_size > 2 * 1024 * 1024: raise ValueError("Ukuran rundown maksimal 2 MB.")
    with zipfile.ZipFile(path) as archive:
        info = archive.infolist()
        if len(info) > 200 or sum(i.file_size for i in info) > 20 * 1024 * 1024:
            raise ValueError("Excel terlalu besar setelah diekstrak.")
        if any("vba" in i.filename.lower() or "externallinks" in i.filename.lower() or i.flag_bits & 1 for i in info):
            raise ValueError("Excel dengan macro, tautan eksternal, atau enkripsi tidak didukung.")
        # Bound physical cell records before openpyxl allocates styles/merges.
        from defusedxml.ElementTree import fromstring
        from openpyxl.utils.cell import range_boundaries, coordinate_from_string, column_index_from_string
        cells=0;merges_by_file={}
        for entry in info:
            if entry.filename.startswith("xl/worksheets/") and entry.filename.endswith(".xml"):
                xml=fromstring(archive.read(entry))
                merges_by_file[entry.filename]=[]
                for e in xml.iter():
                    if e.tag.endswith("}c"):
                        cells+=1
                        col,row=coordinate_from_string(e.attrib["r"])
                        if row>2000 or column_index_from_string(col)>64: raise ValueError("Excel maksimal 2000 baris fisik dan 64 kolom per sheet.")
                    elif e.tag.endswith("}mergeCell"):
                        bounds=range_boundaries(e.attrib["ref"]);_,_,last_col,last_row=bounds
                        if last_col>64 or last_row>2000: raise ValueError("Area gabungan sel Excel terlalu besar.")
                        merges_by_file[entry.filename].append(bounds)
                if cells>100000: raise ValueError("Excel maksimal 100.000 sel tersimpan.")
        relations=fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets={e.attrib['Id']:posixpath.normpath(e.attrib['Target'].lstrip('/') if e.attrib['Target'].startswith('/') else 'xl/'+e.attrib['Target']) for e in relations}
        structure=fromstring(archive.read('xl/workbook.xml'))
        sheet_merges={e.attrib['name']:merges_by_file.get(targets.get(e.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'),''),[]) for e in structure.iter() if e.tag.endswith('}sheet')}
    return sheet_merges

def import_agenda(path):
    """Read the supplied multi-day preset or the existing four-column format.

    Only dated rundown tables are imported. Committee, phone and logistics sheets
    are neither returned nor uploaded. Formulas are never evaluated.
    """
    path = Path(path)
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Ukuran rundown maksimal 2 MB.")
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as stream:
            rows = []
            for row in csv.reader(stream):
                if len(rows)>MAX_ROWS: raise ValueError("CSV maksimal 200 sesi.")
                rows.append(row)
        block=_simple(rows) if rows else None
        if not block: raise ValueError("CSV harus memiliki kolom Mulai, Selesai, Agenda, Lokasi.")
        return [block]
    elif path.suffix.lower() == ".xlsx":
        sheet_merges=xlsx_metadata(path)
        from openpyxl import load_workbook
        # Streaming mode skips embedded drawings/images and unrelated rich objects.
        workbook = load_workbook(path, read_only=True, data_only=False, keep_links=False)
        try:
            if len(workbook.worksheets)>20: raise ValueError("Excel maksimal 20 sheet.")
            blocks=[]
            for sheet in workbook:
                if sheet.sheet_state!="visible": continue
                first_rows=list(sheet.iter_rows(max_row=10,max_col=6))
                first=[c.value for c in first_rows[0]]
                labels=[str(v or "").strip().lower() for v in first]
                if labels[:4] and set(labels[:4])==set(HEADERS):
                    rows=[]
                    for row in sheet.iter_rows(max_row=min(2001,sheet.max_row),max_col=min(64,max(sheet.max_column,5))):
                        if any(c.data_type=="f" for c in row): raise ValueError("Rundown harus nilai biasa, tanpa formula.")
                        rows.append([c.value for c in row])
                    block=_simple(rows)
                    if block: blocks.append(block)
                elif any(str(row[0].value or "").strip().upper()=="RUNDOWN KEGIATAN" for row in first_rows):
                    blocks.extend(_preset(sheet,sheet_merges.get(sheet.title,[])))
            if not blocks: raise ValueError("Tidak ada rundown. Gunakan preset NO, WAKTU, KEGIATAN, TEMPAT, NARASUMBER, PENANGGUNG JAWAB atau empat kolom sederhana.")
            if len(blocks)>100: raise ValueError("Maksimal 100 hari kegiatan.")
            dated=[(b["title"],b["date"]) for b in blocks if b["date"]]
            if len(set(dated))!=len(dated): raise ValueError("Ada judul dan tanggal rundown yang duplikat.")
            for block in blocks:
                if block["date"]:block["dayNumber"]=sorted(b["date"] for b in blocks if b["title"]==block["title"]).index(block["date"])+1
            return blocks
        finally:
            workbook.close()
    else:
        raise ValueError("Gunakan .xlsx atau CSV UTF-8.")

def import_rundown(path):
    blocks=import_agenda(path)
    if len(blocks)!=1: raise ValueError("File memuat beberapa hari. Pilih hari di preview import agenda.")
    return blocks[0]["rundown"]

def agenda_events(blocks):
    """Stable identity lets repeated imports update a day instead of duplicating it."""
    output=[]
    for block in blocks:
        if not block["date"]: raise ValueError("Import beberapa hari memerlukan tanggal setiap blok.")
        dated=sorted(b["date"] for b in blocks if b["title"]==block["title"])
        ordinal=block.get("dayNumber",dated.index(block["date"])+1)
        title=block["title"].title()+f" · Hari {ordinal}"
        identifier="rundown-"+hashlib.sha256((block["title"].casefold()+"|"+block["date"]).encode()).hexdigest()[:16]
        output.append({"id":identifier,"title":title,"date":block["date"],"description":"Jadwal kegiatan mengikuti rundown panitia. Waktu yang ditampilkan menggunakan WIB.","location":"Lokasi tercantum pada setiap sesi.","notify":False,"rundown":block["rundown"],**rundown_bounds(block["rundown"])})
    return output

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

def prepare_favicon(path):
    """Reuse image limits, strip metadata and fit a transparent 256px square."""
    data=prepare_photo(path)
    with Image.open(io.BytesIO(data)) as source:
        image=source.convert("RGBA");box=image.getchannel("A").getbbox()
        if box:image=image.crop(box)
        else:raise ValueError("Ikon tidak boleh sepenuhnya transparan.")
        image=ImageOps.contain(image,(256,256),Image.Resampling.LANCZOS);canvas=Image.new("RGBA",(256,256));canvas.alpha_composite(image,((256-image.width)//2,(256-image.height)//2))
        output=io.BytesIO();canvas.save(output,format="WEBP",quality=90,method=4)
    return output.getvalue()
