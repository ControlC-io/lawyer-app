# Start dossier in local dev mode (backend + frontend directly on host, DB+MinIO via Docker)
# Usage: .\scripts\dev-local.ps1

$NODE = "C:\nvm4w\nodejs\node.exe"
$NPM_CLI = "C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js"
$ROOT = Split-Path $PSScriptRoot -Parent

# Kill any leftover processes on common ports
foreach ($port in @(3000, 3001)) {
    $pid_using = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($pid_using) {
        Stop-Process -Id $pid_using -Force -ErrorAction SilentlyContinue
        Write-Host "Killed process on port $port"
    }
}

# Run Prisma generate first
Write-Host "Generating Prisma client..."
Push-Location "$ROOT\backend"
& $NODE "$ROOT\node_modules\.bin\prisma" generate --schema=.\prisma\schema.prisma 2>&1 | Out-Null
Pop-Location

# Start backend
Write-Host "Starting backend on :3001..."
$backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
`$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/dossier_app_db'
`$env:MINIO_ENDPOINT='localhost'
Set-Location '$ROOT\backend'
& '$NODE' 'C:\nvm4w\nodejs\node_modules\ts-node\dist\bin.js' --transpile-only src/index.ts
"@ -PassThru

Start-Sleep -Seconds 5

# Start frontend
Write-Host "Starting frontend (will pick an available port >= 3000)..."
$frontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
`$env:VITE_API_URL='http://127.0.0.1:3001'
Set-Location '$ROOT'
& '$NODE' '$NPM_CLI' run dev -w frontend
"@ -PassThru

Write-Host ""
Write-Host "Backend:  http://localhost:3001"
Write-Host "Frontend: http://localhost:3000 (or next available port)"
Write-Host ""
Write-Host "Press Ctrl+C to stop or close the spawned windows."
