$ErrorActionPreference = 'Stop'
$osisProject = Split-Path -Parent $PSScriptRoot
$osisExe = Join-Path $PSScriptRoot 'dist-members\VND-Console\VND-Console.exe'
if (-not (Test-Path -LiteralPath $osisExe)) { throw 'Build VND Console first with desktop-admin/build.ps1.' }
Start-Process -FilePath $osisExe -ArgumentList @('--project', ('"' + $osisProject + '"'))
