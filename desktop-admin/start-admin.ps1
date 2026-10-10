$ErrorActionPreference = 'Stop'
$osisProject = Split-Path -Parent $PSScriptRoot
& (Join-Path $osisProject 'start-admin.ps1')
