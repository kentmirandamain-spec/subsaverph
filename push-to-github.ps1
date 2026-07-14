# Push SubSaverPH to GitHub (then connect Render)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1 -GitHubUser YOUR_USERNAME

param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubUser,
  [string]$RepoName = "subsaverph"
)

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Set-Location $PSScriptRoot

if (-not (Test-Path .git)) {
  git init
  git add -A
  git commit -m "SubSaverPH for Render"
}

git branch -M main

$remote = "https://github.com/$GitHubUser/$RepoName.git"
$existing = git remote 2>$null
if ($existing -match "origin") {
  git remote set-url origin $remote
} else {
  git remote add origin $remote
}

Write-Host ""
Write-Host "Pushing to $remote" -ForegroundColor Cyan
Write-Host "Create the empty repo first at: https://github.com/new" -ForegroundColor Yellow
Write-Host "Name it: $RepoName (Public, no README)" -ForegroundColor Yellow
Write-Host ""

git push -u origin main

Write-Host ""
Write-Host "Done. Next:" -ForegroundColor Green
Write-Host "1. Open https://dashboard.render.com/select-repo?type=web"
Write-Host "2. Connect repo $RepoName"
Write-Host "3. Use free plan + start command from DEPLOY-RENDER.md"
Write-Host "4. Your URL will be https://$RepoName.onrender.com"
