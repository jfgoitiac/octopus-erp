import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

# SEGURIDAD: SECRET_KEY debe estar definida en la variable de entorno DJANGO_SECRET_KEY.
# El fallback inseguro solo se tolera en desarrollo local; en producción la ausencia
# de la variable lanzará un error explícito (ver bloque de validación al final).
_SECRET_KEY_DEFAULT = 'django-insecure-octopus-master-key-v1-SOLO-DESARROLLO'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', _SECRET_KEY_DEFAULT)

# SEGURIDAD: el default es False para que un deploy sin configurar no quede en DEBUG.
DEBUG = os.environ.get('DJANGO_DEBUG', 'False') == 'True'
# En desarrollo (DEBUG=True, HTTP puro) la cookie NO puede ser Secure o el navegador
# la descarta y se pierde el refresh token. En producción (DEBUG=False, HTTPS) default True.
# Siempre se puede forzar con la variable de entorno AUTH_COOKIE_SECURE.
AUTH_COOKIE_SECURE = os.environ.get('AUTH_COOKIE_SECURE', 'False' if DEBUG else 'True') == 'True'

# Permite manejar listas separadas por espacios o comas desde variables de entorno
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost 127.0.0.1 [::1]').replace(',', ' ').split()

# Definición de Aplicaciones
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Librerías de terceros
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt',
    'simple_history',
    'django_filters',

    # Aplicaciones locales
    'usuarios.apps.UsuariosConfig',
    'authentication',
    'secretaria',
    'cobranza',
    'nomina',
    'rrhh.apps.RrhhConfig', 
    'portal',
    'academico',
    'multisede.apps.MultisedeConfig',
    'notificaciones.apps.NotificacionesConfig',

]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Debe ir lo más arriba posible
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'simple_history.middleware.HistoryRequestMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'notificaciones' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Configuración de Base de Datos SQLite
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es-ve'
TIME_ZONE = 'America/Caracas'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# SEGURIDAD: MEDIA_URL debe tener barra inicial para evitar rutas relativas incorrectas.
# Los archivos en /media/ se sirven solo en DEBUG via static(); en producción usa nginx
# con internal redirect (X-Accel-Redirect) o S3 — nunca ejecutar scripts desde media/.
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Configuración de CORS para React + Vite
# En producción agrega el origen real mediante la variable DJANGO_CORS_ORIGINS,
# separado por espacios: DJANGO_CORS_ORIGINS="https://app.micolegio.edu.ve https://portal.micolegio.edu.ve"
_cors_extra = os.environ.get('DJANGO_CORS_ORIGINS', '').split()
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
] + [o for o in _cors_extra if o]

# Requerido para que el navegador envie la cookie HttpOnly del refresh token
CORS_ALLOW_CREDENTIALS = True

# Configuración de CSRF necesaria para permitir peticiones desde el frontend
_csrf_extra = os.environ.get('DJANGO_CSRF_ORIGINS', '').split()
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
] + [o for o in _csrf_extra if o]

# Configuración de DRF
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # SEGURIDAD: rechaza tokens de usuarios del portal (rol 'representante')
        # en los endpoints administrativos. Ver authentication/authentication.py.
        'authentication.authentication.AdminJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
        # SEGURIDAD: BasicAuthentication removido — enviaba credenciales en base64 (texto plano
        # sobre HTTP) y no es necesario para esta API JWT. SessionAuthentication se mantiene
        # para el panel admin de Django (/admin/).
    ],
    # Rate throttling para el login del portal (ver PortalLoginThrottle en portal/views.py)
    'DEFAULT_THROTTLE_RATES': {
        'portal_login': '5/min',
    },
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
}
AUTH_USER_MODEL = 'usuarios.Usuario'

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}
# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DEL PORTAL DE REPRESENTANTES
# ──────────────────────────────────────────────────────────────────────────────

# Email de origen para notificaciones del portal
PORTAL_EMAIL_FROM = os.environ.get('PORTAL_EMAIL_FROM', 'noreply@micolegio.edu.ve')

# Email del director para alertas de mora (día 15)
PORTAL_EMAIL_DIRECTOR = os.environ.get('PORTAL_EMAIL_DIRECTOR', '')

# ── WhatsApp ──────────────────────────────────────────────────────────────────
WHATSAPP_PROVIDER       = os.environ.get('WHATSAPP_PROVIDER', '')
TWILIO_ACCOUNT_SID      = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN       = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_WHATSAPP_FROM    = os.environ.get('TWILIO_WHATSAPP_FROM', '')
META_WHATSAPP_TOKEN     = os.environ.get('META_WHATSAPP_TOKEN', '')
META_WHATSAPP_PHONE_ID  = os.environ.get('META_WHATSAPP_PHONE_ID', '')
DIRECTOR_WHATSAPP       = os.environ.get('DIRECTOR_WHATSAPP', '')

# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend'  # default: consola en dev
)
EMAIL_HOST        = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT        = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS     = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER   = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('PORTAL_EMAIL_FROM', 'noreply@octopus.edu.ve')

# Advertir si director email no está configurado
if not PORTAL_EMAIL_DIRECTOR:
    import warnings
    warnings.warn('PORTAL_EMAIL_DIRECTOR no está configurado. La alerta de día 15 al director no se enviará.', RuntimeWarning)


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE AUDITORÍA — django-simple-history
# ──────────────────────────────────────────────────────────────────────────────

# Deshabilitar reversiones accidentales en producción
SIMPLE_HISTORY_REVERT_DISABLED = True

# Usar UUID como PK del historial para evitar colisiones entre modelos
SIMPLE_HISTORY_HISTORY_ID_USE_UUID = True


# ── Celery Beat ────────────────────────────────────────────────────────────────
from celery.schedules import crontab

INSTALLED_APPS += ['django_celery_beat']

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TIMEZONE = 'America/Caracas'
CELERY_BEAT_SCHEDULE = {
    # Revisar mensualidades vencidas cada día a las 8am y programar notificaciones pendientes
    'revisar-mensualidades-vencidas': {
        'task': 'portal.tasks.revisar_y_programar_notificaciones_pendientes',
        'schedule': crontab(hour=8, minute=0),  # cada día a las 8am
    },
    # Sincronizar tasa BCV cada 2 horas en horario bancario (lun-vie, 8am-6pm)
    'sincronizar-tasa-bcv': {
        'task': 'cobranza.tasks.actualizar_tasa_bcv_automatica',
        'schedule': crontab(minute=0, hour='8,10,12,14,16,18', day_of_week='1-5'),
    },
    # Marcar alumnos en mora / solventes según la mensualidad del mes actual
    'verificar-solvencia-diaria': {
        'task': 'cobranza.tasks.verificar_solvencia_estudiantil_automatica',
        'schedule': crontab(hour=0, minute=30),
    },
}
# ── Fin Celery Beat ────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────────
# VALIDACIÓN DE SEGURIDAD EN PRODUCCIÓN
# Si DEBUG=False y la SECRET_KEY es el valor de desarrollo, el arranque falla
# explícitamente para evitar un deploy inseguro accidental.
# ──────────────────────────────────────────────────────────────────────────────
if not DEBUG and SECRET_KEY == _SECRET_KEY_DEFAULT:
    raise ValueError(
        "ERROR DE SEGURIDAD: La variable de entorno DJANGO_SECRET_KEY no está configurada. "
        "No se puede iniciar el servidor en modo producción (DEBUG=False) con la clave por defecto."
    )

FRONTEND_URL           = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

# ── Validación de configuración crítica al arrancar ────────────────────────────
import warnings as _warnings

# Advertir si CELERY_BROKER_URL no está definida explícitamente en el entorno de producción
if not DEBUG and not os.environ.get('CELERY_BROKER_URL'):
    _warnings.warn(
        'CELERY_BROKER_URL no está definida en el entorno — usando redis://localhost:6379/0 por defecto.',
        RuntimeWarning
    )
