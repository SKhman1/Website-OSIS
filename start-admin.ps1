$ErrorActionPreference = 'Stop'
$osisExe = Join-Path $PSScriptRoot 'VND-Console.exe'
if (-not (Test-Path -LiteralPath $osisExe -PathType Leaf)) {
    throw 'Build VND Console first with desktop-admin/build.ps1.'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '_internal') -PathType Container)) {
    throw 'VND Console requires the _internal folder beside VND-Console.exe.'
}
Start-Process -FilePath $osisExe -WorkingDirectory $PSScriptRoot -ArgumentList @('--project', ('"' + $PSScriptRoot + '"')) -WindowStyle Hidden
