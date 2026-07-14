# SubSaverPH — Permanent custom domain setup (Cloudflare Named Tunnel)
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File .\setup-permanent-domain.ps1

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SubSaverPH Permanent Domain Setup"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check cloudflared
try {
  cloudflared --version | Out-Host
} catch {
  Write-Host "Installing cloudflared..." -ForegroundColor Yellow
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cfDir | Out-Null

# Step 1: Login
$cert = Join-Path $cfDir "cert.pem"
if (-not (Test-Path $cert)) {
  Write-Host ""
  Write-Host "STEP 1: Cloudflare login" -ForegroundColor Green
  Write-Host "A browser window will open. Log in to Cloudflare and authorize the tunnel." -ForegroundColor Yellow
  Write-Host "If you do not have an account: create a free one at https://dash.cloudflare.com/sign-up" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Press Enter to open login..." -ForegroundColor Cyan
  [void][System.Console]::ReadLine()
  cloudflared tunnel login
} else {
  Write-Host "Already logged in (cert.pem found)." -ForegroundColor Green
}

if (-not (Test-Path $cert)) {
  Write-Host "Login was not completed (no cert.pem). Run this script again after authorizing." -ForegroundColor Red
  exit 1
}

# Step 2: Domain
Write-Host ""
Write-Host "STEP 2: Your domain" -ForegroundColor Green
Write-Host "You need a domain you own, added to Cloudflare (free plan is fine)." -ForegroundColor Yellow
Write-Host "Examples: subsaverph.com  |  shop.yourname.com" -ForegroundColor Yellow
Write-Host ""
$domain = Read-Host "Enter your domain (e.g. subsaverph.com)"

if ([string]::IsNullOrWhiteSpace($domain)) {
  Write-Host "No domain entered. Exiting." -ForegroundColor Red
  exit 1
}
$domain = $domain.Trim().ToLower()

# Step 3: Create tunnel
$tunnelName = "subsaverph"
Write-Host ""
Write-Host "STEP 3: Create named tunnel '$tunnelName'" -ForegroundColor Green

$existing = cloudflared tunnel list 2>&1 | Out-String
if ($existing -match $tunnelName) {
  Write-Host "Tunnel already exists." -ForegroundColor Yellow
} else {
  cloudflared tunnel create $tunnelName
}

# Get tunnel ID from list
$listOut = cloudflared tunnel list 2>&1 | Out-String
$tunnelId = $null
foreach ($line in ($listOut -split "`n")) {
  if ($line -match $tunnelName) {
    if ($line -match "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})") {
      $tunnelId = $Matches[1]
      break
    }
  }
}

if (-not $tunnelId) {
  # try reading credential files
  $cred = Get-ChildItem $cfDir -Filter "*.json" | Where-Object { $_.Name -ne "cert.pem" } | Select-Object -First 1
  if ($cred) { $tunnelId = $cred.BaseName }
}

if (-not $tunnelId) {
  Write-Host "Could not detect tunnel ID. Run: cloudflared tunnel list" -ForegroundColor Red
  exit 1
}

Write-Host "Tunnel ID: $tunnelId" -ForegroundColor Green

# Step 4: DNS routes
Write-Host ""
Write-Host "STEP 4: DNS routes for $domain and www.$domain" -ForegroundColor Green
cloudflared tunnel route dns $tunnelName $domain
cloudflared tunnel route dns $tunnelName "www.$domain"

# Step 5: Config file
$configPath = Join-Path $cfDir "config.yml"
$credPath = Join-Path $cfDir "$tunnelId.json"
$config = @"
tunnel: $tunnelId
credentials-file: $credPath

ingress:
  - hostname: $domain
    service: http://127.0.0.1:8790
  - hostname: www.$domain
    service: http://127.0.0.1:8790
  - service: http_status:404
"@
Set-Content -Path $configPath -Value $config -Encoding UTF8
Write-Host "Wrote $configPath" -ForegroundColor Green

# Save domain info for the project
$info = @"
SubSaverPH Permanent Domain
===========================
Domain:  https://$domain
WWW:     https://www.$domain
Admin:   https://$domain/admin
Tunnel:  $tunnelName
ID:      $tunnelId

Start server:  python server.py
Start tunnel:  cloudflared tunnel run $tunnelName

Or use: start-permanent.bat
"@
Set-Content -Path (Join-Path $PSScriptRoot "PERMANENT-DOMAIN.txt") -Value $info -Encoding UTF8

# Create start script
$startBat = @"
@echo off
cd /d "%~dp0"
echo Starting SubSaverPH on https://$domain
start "SubSaverPH Server" cmd /c "python server.py"
timeout /t 3 /nobreak >nul
cloudflared tunnel run $tunnelName
"@
Set-Content -Path (Join-Path $PSScriptRoot "start-permanent.bat") -Value $startBat -Encoding ASCII

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE"
Write-Host "============================================" -ForegroundColor Green
Write-Host "  https://$domain"
Write-Host "  https://www.$domain"
Write-Host "  https://$domain/admin"
Write-Host ""
Write-Host "  1. Make sure the domain is on Cloudflare DNS"
Write-Host "  2. Run: start-permanent.bat"
Write-Host "  3. Wait 1-2 minutes for DNS"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Start the permanent tunnel now? (Y/N)" -ForegroundColor Cyan
$ans = Read-Host
if ($ans -match '^[Yy]') {
  Start-Process cmd -ArgumentList '/c', "cd /d `"$PSScriptRoot`" && python server.py" -WindowStyle Normal
  Start-Sleep -Seconds 3
  cloudflared tunnel run $tunnelName
}
