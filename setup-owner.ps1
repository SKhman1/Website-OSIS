param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9_-]{1,100}$')]
    [string]$Database,
    [ValidatePattern('^[a-z0-9][a-z0-9_.-]{2,63}$')]
    [string]$Username,
    [ValidateSet('bootstrap', 'authorize-mfa')]
    [string]$Mode = 'bootstrap',
    [string]$Url = 'https://vnd-smkdipo1.pages.dev'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Setup owner VND Console - hanya untuk pemilik Cloudflare.'
Write-Host 'Password diketik di terminal ini. QR akan muncul setelah verifikasi server.'
try {
    if (-not $Username) {
        $osisPrompt = if ($Mode -eq 'bootstrap') { 'Username owner baru' } else { 'Username owner yang sudah ada' }
        $Username = Read-Host $osisPrompt
    }
    & (Join-Path $PSScriptRoot 'console\.venv\Scripts\python.exe') (Join-Path $PSScriptRoot 'console\tools\cms-owner.py') $Mode --database $Database --username $Username --url $Url --enroll
    if ($LASTEXITCODE -ne 0) { throw 'Setup belum selesai. Periksa pesan di atas.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    [void](Read-Host 'Tekan Enter untuk menutup')
    exit 1
}
