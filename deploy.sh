#!/bin/bash
set -e

# Parametrizable para reusar este mismo script en un ambiente de staging:
#   REPO=/var/www/octopus-staging SERVICE=octopus-staging BRANCH=mi-rama ./deploy.sh
# Sin overrides, se comporta exactamente igual que antes (producción: rama
# main, REPO/SERVICE de producción). Ver STAGING.md para el diseño completo
# de aislamiento (BD, Redis, media, dominio, systemd, SMTP/Drive de prueba).
PROD_REPO_DEFAULT="/var/www/octopus"
PROD_SERVICE_DEFAULT="octopus"
REPO="${REPO:-$PROD_REPO_DEFAULT}"
SERVICE="${SERVICE:-$PROD_SERVICE_DEFAULT}"
BRANCH="${BRANCH:-main}"
BACKEND="$REPO/octopus-api"
FRONTEND="$REPO/octopus-frontend"
SITIO="$REPO/octopus-sitio"
VENV="$BACKEND/venv/bin"

# ── Guardas de aislamiento staging/producción ─────────────────────
# Evita el error clásico de "olvidé pasar una de las dos variables" que
# terminaría reiniciando el servicio de producción con el checkout de
# staging, o viceversa. REPO y SERVICE deben estar de acuerdo: los dos
# apuntando a staging, o los dos a producción — nunca uno de cada uno.
repo_es_staging=false
service_es_staging=false
case "$REPO" in *staging*) repo_es_staging=true ;; esac
case "$SERVICE" in *staging*) service_es_staging=true ;; esac
if [ "$repo_es_staging" != "$service_es_staging" ]; then
    echo "✗ ERROR: REPO ($REPO) y SERVICE ($SERVICE) no coinciden en ambiente."
    echo "  Deben ser ambos de staging (contener 'staging') o ambos de producción."
    exit 1
fi
# Desplegar una rama distinta de main SOLO está permitido contra un destino
# identificado explícitamente como staging. No basta con que REPO/SERVICE no
# sean los valores por defecto: un nombre alternativo de producción no debe
# convertirse en escape accidental de esta guarda.
if [ "$BRANCH" != "main" ] && [ "$repo_es_staging" != true ]; then
    echo "✗ ERROR: BRANCH=$BRANCH solo puede desplegarse con REPO/SERVICE de staging."
    echo "  Usa nombres que contengan 'staging', p. ej. REPO=/var/www/octopus-staging SERVICE=octopus-staging."
    exit 1
fi

verificar_servicio_activo() {
    local servicio="$1"
    local etiqueta="$2"
    if sudo systemctl is-active --quiet "$servicio"; then
        echo "   ✓ $etiqueta activo"
    else
        echo "   ✗ ERROR: $etiqueta no arrancó" >&2
        exit 1
    fi
}

echo "═══════════════════════════════════════"
echo "  OCTOPUS — Deploy $(date '+%Y-%m-%d %H:%M:%S') [$SERVICE] rama:$BRANCH"
echo "═══════════════════════════════════════"

# ── 1. Git pull ──────────────────────────────────────────────────
echo ""
echo "▶ Actualizando código (rama $BRANCH)..."
cd "$REPO"
git pull origin "$BRANCH"

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
verificar_servicio_activo "$SERVICE" "Backend"

# ── 3b. Reiniciar Celery Worker y Beat ────────────────────────────
# Unidades systemd: ${SERVICE}-celery-worker y ${SERVICE}-celery-beat
# (ver octopus-api/ARRANQUE_CELERY.md para crearlas si aún no existen).
echo ""
echo "▶ Reiniciando Celery Worker ($SERVICE-celery-worker.service)..."
sudo systemctl restart "$SERVICE-celery-worker"
verificar_servicio_activo "$SERVICE-celery-worker" "Celery Worker"

echo "▶ Reiniciando Celery Beat ($SERVICE-celery-beat.service)..."
sudo systemctl restart "$SERVICE-celery-beat"
verificar_servicio_activo "$SERVICE-celery-beat" "Celery Beat"

echo "▶ Verificando Redis, Worker y Beat (solo lectura, no reinicia nada)..."
"$VENV/python" "$BACKEND/manage.py" verificar_celery

# ── 4. Frontend — build ──────────────────────────────────────────
echo ""
echo "▶ Instalando dependencias Node..."
cd "$FRONTEND"
npm ci --silent

echo "▶ Compilando frontend..."
npm run build

echo "▶ Recargando Nginx..."
sudo systemctl reload nginx
verificar_servicio_activo nginx "Nginx"

# ── 5. Sitio institucional (octopus-sitio) — build estático ─────
echo ""
echo "▶ Instalando dependencias Node (sitio institucional)..."
cd "$SITIO"
npm ci --silent

echo "▶ Compilando sitio institucional..."
npm run build

echo ""
echo "═══════════════════════════════════════"
echo "  Deploy completado ✓"
echo "═══════════════════════════════════════"
