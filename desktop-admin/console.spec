# PyInstaller specification: Qt Widgets only, no browser runtime.
import sys
a = Analysis(['main.py'], pathex=[], binaries=[], datas=[], hiddenimports=[],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=['PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets'], noarchive=False)
if sys.platform == 'win32':
    # Qt 6.11 uses the OS ICU API. Other tools on PATH can expose an incompatible
    # versioned ICU under the same filename. Windows supplies this DLL itself.
    a.binaries = [item for item in a.binaries if item[0].lower() != 'icuuc.dll']
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='VND-Console',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    console=False, disable_windowed_traceback=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='VND-Console')
