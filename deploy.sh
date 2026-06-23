#!/bin/bash
set -e

REPO="/var/www/octopus"
BACKEND="$REPO/octopus-api"
FRONTEND="$REPO/octopus-frontend"
VENV="$BACKEND/venv/bin"

echo "═══════════════════════════════════════"
echo "  OCTOPUS — Deploy $(date '+%Y-%m-%d %H:%M:%S')"
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

echo "▶ Aplicando migraciones..."
"$VENV/python" "$BACKEND/manage.py" migrate --noinput

echo "▶ Recolectando archivos estáticos..."
"$VENV/python" "$BACKEND/manage.py" collectstatic --noinput --quiet

# ── 3. Reiniciar backend ─────────────────────────────────────────
echo ""
echo "▶ Reiniciando backend (octopus.service)..."
sudo systemctl restart octopus
sudo systemctl is-active --quiet octopus && echo "   ✓ Backend activo" || echo "   ✗ ERROR: Backend no arrancó"

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

echo ""
echo "═══════════════════════════════════════"
echo "  Deploy completado ✓"
echo "═══════════════════════════════════════"
