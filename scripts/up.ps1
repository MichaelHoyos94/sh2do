# Levanta Sh2do en Docker: servicios, esperas de salud y migraciones pendientes.
# Docker escribe su progreso en stderr: no se trata como error; se revisa $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Se creó .env desde .env.example (valores solo para desarrollo local).' -ForegroundColor Yellow
}

docker compose up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'docker compose up falló.' }

docker compose exec -T api npm run db:deploy -w backend
if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy falló.' }

Write-Host ''
Write-Host 'Sh2do está en marcha:' -ForegroundColor Green
Write-Host '  Web:     http://localhost:5173'
Write-Host '  API:     http://localhost:3000  (salud: /health)'
Write-Host '  Mailpit: http://localhost:8025'
