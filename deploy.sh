#!/bin/bash
set -e

# Parametrizable para reusar este mismo script en un ambiente de staging:
#   REPO=/var/www/octopus-staging SERVICE=octopus-staging ./deploy.sh
# Sin overrides, se comporta exactamente igual que antes (producción).
REPO="${REPO:-/var/www/octopus}"
SERVICE="${SERVICE:-octopus}"
BACKEND="$REPO/octopus-api"
FRONTEND="$REPO/octopus-frontend"
SITIO="$REPO/octopus-sitio"
VENV="$BACKEND/venv/bin"

echo "═══════════════════════════════════════"
echo "  OCTOPUS — Deploy $(date '+%Y-%m-%d %H:%M:%S') [$SERVICE]"
echo "═══════════════════════════════════════"

# ── 1. Git pull ──────────────────────────────────────────────────
echo ""
echo "▶ Actualizando código..."
cd "$REPO"
git pull origin main

# ── 2. Backend — dependencias y migraciones ──────────────────────
echo ""
echo "▶ Instalando dependencias Python..."
"$VENV/pip" install -r "$BACKEND/requirements.txt" --quiet

echo "▶ Verificando postgresql-client (pg_dump, requerido para el respaldo de BD)..."
if ! command -v pg_dump &> /dev/null; then
    sudo apt-get install -y postgresql-client
fi

echo "▶ Aplicando migraciones..."
"$VENV/python" "$BACKEND/manage.py" migrate --noinput

echo "▶ Recolectando archivos estáticos..."
"$VENV/python" "$BACKEND/manage.py" collectstatic --noinput -v 0

# ── 3. Reiniciar backend ─────────────────────────────────────────
echo ""
echo "▶ Reiniciando backend ($SERVICE.service)..."
sudo systemctl restart "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE" && echo "   ✓ Backend activo" || echo "   ✗ ERROR: Backend no arrancó"

# ── 4. Frontend — build ──────────────────────────────────────────
echo ""
echo "▶ Instalando dependencias Node..."
cd "$FRONTEND"
npm install --silent

echo "▶ Compilando frontend..."
npm run build

echo "▶ Recargando Nginx..."
sudo systemctl reload nginx
sudo systemctl is-active --quiet nginx && echo "   ✓ Nginx activo" || echo "   ✗ ERROR: Nginx no respondió"

# ── 5. Sitio institucional (octopus-sitio) — build estático ─────
echo ""
echo "▶ Instalando dependencias Node (sitio institucional)..."
cd "$SITIO"
npm install --silent

echo "▶ Compilando sitio institucional..."
npm run build

echo ""
echo "═══════════════════════════════════════"
echo "  Deploy completado ✓"
echo "═══════════════════════════════════════"
