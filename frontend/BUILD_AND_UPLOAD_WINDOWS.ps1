# Little Genius Adventure AICS static preview — Windows PowerShell
# No AppDeploy calls, accounts, production deployment, secrets, or backend writes.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Little Genius AICS — browser-only evaluation build' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 LTS before running this script.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is missing. Install Node.js.' }
node --version
npm --version
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Nothing was deployed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Vite build failed. Do not upload. Share terminal errors in ChatGPT.' }
if (-not (Test-Path 'dist/index.html')) { throw 'dist/index.html missing. Do not upload.' }
$assets = Get-ChildItem 'dist' -Recurse -File
if (($assets | Measure-Object).Count -lt 3) { throw 'Build output unexpectedly small. Do not upload.' }
Write-Host 'Build generated successfully. Upload only the dist folder to Cloudflare Pages.' -ForegroundColor Green
Write-Host ((Resolve-Path 'dist').Path)
Write-Host 'Preview features: games + AICS Draft onboarding. No real accounts, licences or school backend.'
