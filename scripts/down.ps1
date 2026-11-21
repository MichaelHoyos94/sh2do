# Detiene Sh2do. Con -Volumes también borra los datos (MySQL y node_modules), previa confirmación.
param([switch]$Volumes)
# Docker escribe su progreso en stderr: no se trata como error; se revisa $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

if ($Volumes) {
  $answer = Read-Host 'Esto borra TODOS los datos locales. Escribe "si" para continuar'
  if ($answer -ne 'si') { Write-Host 'Cancelado.'; exit 0 }
  docker compose down --volumes
} else {
  docker compose down
}
