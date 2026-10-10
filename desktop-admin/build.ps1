$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$osisProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$osisStage = Join-Path $PSScriptRoot 'build-portable\package'
$osisPackage = Join-Path $osisStage 'VND-Console'
$osisExe = Join-Path $osisProject 'VND-Console.exe'
$osisInternal = Join-Path $osisProject '_internal'
$osisRunning = Get-CimInstance Win32_Process -Filter "Name = 'VND-Console.exe'" | Where-Object { $_.ExecutablePath -eq $osisExe }
if ($osisRunning) { throw 'Close VND Console before rebuilding it.' }
$osisBuildPath = $env:PATH
try {
    # Qt 6.11 uses Windows ICU. Do not collect an incompatible Poppler/Git ICU
    # from the developer's global PATH into the portable application.
    $env:PATH = (Join-Path $PSScriptRoot '.venv\Scripts') + ';' + (Join-Path $env:SystemRoot 'System32') + ';' + $env:SystemRoot
    & '.\.venv\Scripts\python.exe' -m PyInstaller --noconfirm --clean --distpath $osisStage --workpath build-portable console.spec
    if ($LASTEXITCODE -ne 0) { throw 'Build GUI failed.' }
    $osisCheck = Start-Process -FilePath (Join-Path $osisPackage 'VND-Console.exe') -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
    if ($osisCheck.ExitCode -ne 0) { throw 'Packaged GUI self-test failed; existing build kept.' }
    # Only replace the runtime directory at this exact project-root location.
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($osisInternal))) -ne $osisProject) { throw 'Unsafe runtime output path.' }
    if (Test-Path -LiteralPath $osisInternal) {
        if ((Get-Item -LiteralPath $osisInternal).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime output cannot be a link.' }
        Remove-Item -LiteralPath $osisInternal -Recurse -Force
    }
    Move-Item -LiteralPath (Join-Path $osisPackage '_internal') -Destination $osisInternal
    Copy-Item -LiteralPath (Join-Path $osisPackage 'VND-Console.exe') -Destination $osisExe -Force
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($osisStage))) -ne (Join-Path $PSScriptRoot 'build-portable')) { throw 'Unsafe staging path.' }
    Remove-Item -LiteralPath $osisStage -Recurse -Force
    Write-Host "Control panel: $osisExe"
} finally { $env:PATH = $osisBuildPath }
