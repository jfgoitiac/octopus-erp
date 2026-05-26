# Script para ejecutar comandos de Django de forma simplificada
# Ubicación: C:\Octopus\octopus-api\run_django.ps1
# Uso: .\run_django.ps1 -Action migrate

param(
    [string]$Action = "migrate"
)

$ErrorActionPreference = "Stop"

# Obtener la ruta del directorio actual del script
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = $PWD.Path
}

# Activar virtualenv si existe
$venvPath = Join-Path (Split-Path $scriptDir -Parent) "venv\Scripts\python.exe"
if (-not (Test-Path $venvPath)) {
    $venvPath = Join-Path (Split-Path $scriptDir -Parent) ".venv\Scripts\python.exe"
}

if (-not (Test-Path $venvPath)) {
    $venvPath = "python"
}

# Ejecutar el comando desde el directorio del script
Push-Location $scriptDir
try {
    switch ($Action) {
        "migrate" {
            & $venvPath manage.py migrate
        }
        "makemigrations" {
            & $venvPath manage.py makemigrations
        }
        "runserver" {
            & $venvPath manage.py runserver
        }
        default {
            Write-Host "Acción no reconocida. Usa: migrate, makemigrations, o runserver"
            exit 1
        }
    }
}
finally {
    Pop-Location
}