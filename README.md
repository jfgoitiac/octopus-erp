# Octopus — Sistema de Gestión Escolar

SaaS para colegios privados en Latinoamérica. Gestión de inscripciones, cobranza, módulo académico y portal de representantes.

## Stack

- **Backend:** Django 6 + Django REST Framework + SimpleJWT + Celery
- **Frontend:** React 19 + Vite + Tailwind CSS v4
- **Base de datos:** SQLite (desarrollo) / PostgreSQL (producción)
- **Cola de tareas:** Celery + Redis
- **Pagos:** Comprobante manual (transferencia/pago móvil/etc.) con aprobación admin — sin pasarela en línea

## Requisitos previos

- Python 3.11+
- Node.js 18+
- Redis (para Celery)

## Instalación y arranque en desarrollo

### 1. Clonar y configurar entorno

```bash
cd octopus-api
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

pip install -r requirements.txt
```

### 2. Variables de entorno

```bash
# Backend
cp .env.example .env
# Editar .env con tus valores

# Frontend
cd octopus-frontend
cp .env.example .env
```

### 3. Migraciones y datos iniciales

```bash
cd octopus-api
python manage.py migrate
python manage.py createsuperuser
```

### 4. Arrancar servicios (4 terminales)

**Terminal 1 — Redis:**
```bash
redis-server
```

**Terminal 2 — Backend Django:**
```bash
cd octopus-api
python manage.py runserver
```

**Terminal 3 — Celery Worker:**
```bash
cd octopus-api
celery -A config worker -l info
```

**Terminal 4 — Celery Beat (scheduler):**
```bash
cd octopus-api
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

**Terminal 5 — Frontend:**
```bash
cd octopus-frontend
npm install
npm run dev
```

### 5. Acceso

| URL | Descripción |
|-----|-------------|
| http://localhost:5173 | Panel administrativo |
| http://localhost:5173/portal | Portal de representantes |
| http://localhost:8000/admin | Django Admin |
| http://localhost:8000/api/ | API REST |

## Módulos

| Módulo | Rutas | Roles |
|--------|-------|-------|
| Cobranza | /cobranza, /comprobantes | director, administrador, cobranza, cajero |
| Inscripciones | /inscripciones | director, secretaria |
| Académico | /notas, /asistencia, /horarios, /boletin | director, secretaria |
| Portal Representantes | /portal | representantes (JWT separado) |
| Multi-Sede | /multisede | directivo_red, director |

## Activar portal para representantes

```bash
# Activar todos los representantes existentes de una vez:
# POST http://localhost:8000/api/authentication/activar-portal-masivo/
# (requiere token de director o sistemas)

# O activar uno por uno:
# POST http://localhost:8000/api/portal/activar-representante/
# Body: { "representante_id": 1 }
```

## Variables de entorno importantes

Ver `.env.example` para la lista completa documentada.

## Producción

- Cambiar `DJANGO_DEBUG=False`
- Generar `DJANGO_SECRET_KEY` nueva con `python -c "import secrets; print(secrets.token_hex(50))"`
- Configurar PostgreSQL (`DB_ENGINE=postgresql` en `.env`, ver `.env.example`)
- Instalar el paquete de sistema `postgresql-client` en el VPS (provee `pg_dump`,
  usado por el botón "Respaldar base de datos" de Sistemas › Usuarios):
  `sudo apt-get install -y postgresql-client`
- Configurar SMTP real para emails
- Usar Redis externo (Redis Cloud, ElastiCache)
- Configurar nginx para servir archivos `media/`

### Cantina: lector móvil con cámara

El lector móvil del POS usa las APIs nativas del navegador (`getUserMedia` y
`BarcodeDetector`); no requiere dependencias nuevas de Python ni npm. Para que
pueda solicitar la cámara en producción:

- Servir el frontend por **HTTPS** con un certificado válido (no por HTTP ni
  certificados no confiables). La configuración versionada de nginx ya redirige
  HTTP a HTTPS; verificar el certificado del dominio antes de habilitar Cantina.
- Probar en un navegador móvil que soporte detección de códigos. El POS pide la
  cámara trasera cuando está disponible, lee QR solo para tarjetas prepago y
  códigos de barras solo para productos.
- Si el navegador no dispone de detector de códigos o se deniega el permiso,
  el cajero conserva el lector físico y la entrada manual como alternativas.
