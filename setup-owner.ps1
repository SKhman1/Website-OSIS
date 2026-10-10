param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9_-]{1,100}$')]
    [string]$Database,
    [ValidatePattern('^[a-z0-9][a-z0-9_.-]{2,63}$')]
    [string]$Username,
    [string]$Url = 'https://vnd-smkdipo1.pages.dev'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Setup owner VND Console - hanya untuk pemilik Cloudflare.'
Write-Host 'Password diketik di terminal ini. QR akan muncul setelah verifikasi server.'
try {
    if (-not $Username) { $Username = Read-Host 'Username owner yang sudah ada' }
    & (Join-Path $PSScriptRoot 'desktop-admin\.venv\Scripts\python.exe') (Join-Path $PSScriptRoot 'scripts\cms-owner.py') authorize-mfa --database $Database --username $Username --url $Url --enroll
    if ($LASTEXITCODE -ne 0) { throw 'Setup belum selesai. Periksa pesan di atas.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    [void](Read-Host 'Tekan Enter untuk menutup')
    exit 1
}
