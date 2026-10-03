$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$osisBuildPath = $env:PATH
try {
    # Qt 6.11 uses Windows ICU. Do not collect an incompatible Poppler/Git ICU
    # from the developer's global PATH into the portable application.
    $env:PATH = (Join-Path $PSScriptRoot '.venv\Scripts') + ';' + (Join-Path $env:SystemRoot 'System32') + ';' + $env:SystemRoot
    & '.\.venv\Scripts\python.exe' -m PyInstaller --noconfirm --clean --distpath dist-portable --workpath build-portable console.spec
    if ($LASTEXITCODE -ne 0) { throw 'Build GUI failed.' }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $PSScriptRoot 'dist-portable\VND-Console\README.md')
} finally { $env:PATH = $osisBuildPath }
