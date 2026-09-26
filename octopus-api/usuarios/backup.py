"""
Generación del volcado de base de datos (SQLite en dev, PostgreSQL en
producción). Extraído de authentication/views.py::UserManagementViewSet.backup
para poder reusarlo también desde la tarea automática diaria (ver
usuarios/tasks.py::respaldo_diario_automatico) sin duplicar la lógica.
"""
import os
import hashlib
import json
import logging
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

MIB = 1024 * 1024


def generar_backup_bd(backup_dir=None):
    """
    Genera un volcado SQL de la base de datos activa y devuelve
    (file_path, filename). Lanza RuntimeError si el motor no está soportado
    o si falta el binario pg_dump en producción.
    """
    db_config = settings.DATABASES['default']
    engine = db_config['ENGINE']
    backup_dir = backup_dir or os.path.join(settings.MEDIA_ROOT, 'backups')

    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir, exist_ok=True)

    fecha_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"backup_{fecha_str}.sql"
    file_path = os.path.join(backup_dir, filename)

    if 'sqlite3' in engine:
        # Volcado con el módulo estándar sqlite3: no depende de ningún binario externo.
        db_path = str(db_config['NAME'])
        source_conn = sqlite3.connect(db_path)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                for line in source_conn.iterdump():
                    f.write(f'{line}\n')
        finally:
            source_conn.close()

    elif 'postgresql' in engine:
        # pg_dump debe estar instalado en el servidor (paquete postgresql-client).
        if not shutil.which('pg_dump'):
            raise RuntimeError(
                "pg_dump no está instalado en el servidor. "
                "Instala el paquete 'postgresql-client' para habilitar el respaldo."
            )

        env = os.environ.copy()
        if db_config.get('PASSWORD'):
            env['PGPASSWORD'] = db_config['PASSWORD']

        cmd = [
            'pg_dump',
            '--no-owner',
            '--no-privileges',
            '-h', db_config.get('HOST') or 'localhost',
            '-p', str(db_config.get('PORT') or '5432'),
            '-U', db_config.get('USER') or '',
            '-d', db_config['NAME'],
            '-f', file_path,
        ]
        subprocess.run(cmd, check=True, shell=False, env=env)

    else:
        raise RuntimeError(f"Motor de base de datos no soportado para respaldo: {engine}")

    return file_path, filename


def rotar_backups_antiguos(backup_dir=None, dias_a_conservar=14):
    """
    Borra volcados y archivos completos de respaldo más viejos que
    `dias_a_conservar` en
    `backup_dir`. Sin esto, la tarea diaria acumula un .sql nuevo cada día
    para siempre hasta llenar el disco del servidor.
    """
    backup_dir = backup_dir or os.path.join(settings.MEDIA_ROOT, 'backups')
    if not os.path.isdir(backup_dir):
        return []

    limite = datetime.now().timestamp() - dias_a_conservar * 86400
    borrados = []
    for nombre in os.listdir(backup_dir):
        es_dump_heredado = nombre.startswith('backup_') and nombre.endswith('.sql')
        es_respaldo_completo = (
            nombre.startswith('octopus_backup_') and nombre.endswith('.tar.gz')
        )
        if not (es_dump_heredado or es_respaldo_completo):
            continue
        ruta = os.path.join(backup_dir, nombre)
        if os.path.isfile(ruta) and os.path.getmtime(ruta) < limite:
            os.remove(ruta)
            borrados.append(nombre)
    return borrados


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as archivo:
        for bloque in iter(lambda: archivo.read(MIB), b''):
            digest.update(bloque)
    return digest.hexdigest()


def _agregar_media(archivo_tar, media_root, backup_dir):
    """Agrega MEDIA_ROOT sin incluir los respaldos locales ni enlaces."""
    cantidad = 0
    tamano = 0
    media_root = Path(media_root).resolve()
    backup_dir = Path(backup_dir).resolve()

    for directorio, subdirectorios, archivos in os.walk(media_root, followlinks=False):
        actual = Path(directorio).resolve()
        subdirectorios[:] = [
            nombre for nombre in subdirectorios
            if (actual / nombre).resolve() != backup_dir
        ]
        if actual == backup_dir:
            continue
        for nombre in archivos:
            origen = actual / nombre
            if origen.is_symlink() or not origen.is_file():
                continue
            relativo = origen.relative_to(media_root)
            archivo_tar.add(origen, arcname=str(Path('media') / relativo), recursive=False)
            cantidad += 1
            tamano += origen.stat().st_size
    return cantidad, tamano


def generar_respaldo_completo(backup_dir=None):
    """Crea atómicamente un .tar.gz con PostgreSQL, media y un manifiesto."""
    if 'postgresql' not in settings.DATABASES['default']['ENGINE']:
        raise RuntimeError('El respaldo externo diario requiere PostgreSQL configurado.')

    destino = Path(backup_dir or os.environ.get('BACKUP_DIR') or Path(settings.MEDIA_ROOT) / 'backups')
    destino.mkdir(parents=True, exist_ok=True)
    sello = datetime.now().strftime('%Y%m%d_%H%M%S')
    nombre = f'octopus_backup_{sello}.tar.gz'
    final = destino / nombre
    parcial = destino / f'.{nombre}.part'
    temporal = Path(tempfile.mkdtemp(prefix='.octopus_backup_', dir=destino))

    try:
        dump_path, _ = generar_backup_bd(str(temporal))
        dump_path = Path(dump_path)
        manifest_path = temporal / 'manifest.json'
        with tarfile.open(parcial, 'w:gz') as archivo_tar:
            cantidad_media, bytes_media = _agregar_media(
                archivo_tar, settings.MEDIA_ROOT, destino,
            )
            manifiesto = {
                'formato': 1,
                'creado_en': datetime.now().astimezone().isoformat(),
                'base_de_datos': {'archivo': 'database.sql', 'sha256': _sha256(dump_path)},
                'media': {
                    'directorio': 'media/', 'archivos': cantidad_media,
                    'bytes': bytes_media, 'excluye': 'backups locales',
                },
            }
            manifest_path.write_text(json.dumps(manifiesto, indent=2), encoding='utf-8')
            archivo_tar.add(dump_path, arcname='database.sql', recursive=False)
            archivo_tar.add(manifest_path, arcname='manifest.json', recursive=False)
        os.replace(parcial, final)
    except Exception:
        parcial.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(temporal, ignore_errors=True)

    return str(final), nombre


def _configuracion_drive():
    token_file = os.environ.get('GOOGLE_DRIVE_TOKEN_FILE', '').strip()
    carpeta = os.environ.get('GOOGLE_DRIVE_BACKUP_FOLDER_ID', '').strip()
    if not token_file or not carpeta:
        raise RuntimeError('Faltan variables de configuración de Google Drive para el respaldo.')
    if not Path(token_file).is_file():
        raise RuntimeError('No se encuentra el archivo de token OAuth de Google Drive.')
    return token_file, carpeta


def subir_respaldo_a_google_drive(ruta, nombre):
    """
    Carga reanudable con credenciales OAuth de un usuario (no cuenta de
    servicio): las cuentas de servicio no tienen cuota de almacenamiento en
    Drive personal, así que el archivo queda en el Drive del usuario dueño
    del token. No registra contenido, credenciales ni ID remoto.
    """
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError as exc:
        raise RuntimeError('Faltan dependencias de Google Drive en el entorno.') from exc

    token_file, carpeta = _configuracion_drive()
    credenciales = Credentials.from_authorized_user_file(
        token_file,
        scopes=['https://www.googleapis.com/auth/drive.file'],
    )
    if credenciales.expired and credenciales.refresh_token:
        credenciales.refresh(Request())
        Path(token_file).write_text(credenciales.to_json(), encoding='utf-8')

    servicio = build('drive', 'v3', credentials=credenciales, cache_discovery=False)
    media = MediaFileUpload(ruta, mimetype='application/gzip', resumable=True, chunksize=8 * MIB)
    respuesta = servicio.files().create(
        body={'name': nombre, 'parents': [carpeta]}, media_body=media,
        fields='id, name, md5Checksum, size',
    ).execute(num_retries=3)
    if not respuesta.get('id'):
        raise RuntimeError('Google Drive no confirmó la carga del respaldo.')
    return respuesta


def _destinatarios_alerta():
    return [correo.strip() for correo in os.environ.get('BACKUP_ALERT_EMAILS', '').split(',') if correo.strip()]


def enviar_alerta_respaldo(exito, nombre=None):
    destinatarios = _destinatarios_alerta()
    if not destinatarios:
        logger.warning('No hay destinatarios configurados para alertas de respaldo.')
        return

    asunto = 'Octopus: respaldo externo completado' if exito else 'Octopus: FALLÓ el respaldo externo'
    mensaje = (
        f'Se completó el respaldo externo diario: {nombre}. '
        'El archivo se conserva localmente y fue enviado a Google Drive.'
        if exito else
        'Falló el respaldo externo diario. Revisar el journal de Celery y verificar '
        'PostgreSQL, almacenamiento local y acceso de la cuenta de servicio a Google Drive.'
    )
    try:
        send_mail(asunto, mensaje, settings.DEFAULT_FROM_EMAIL, destinatarios, fail_silently=False)
    except Exception:
        logger.exception('No se pudo enviar la alerta de respaldo.')


def ejecutar_respaldo_externo():
    """Genera, rota, sube y notifica; las fallas siguen visibles para Celery."""
    nombre = None
    try:
        ruta, nombre = generar_respaldo_completo()
        dias = int(os.environ.get('BACKUP_RETENTION_DAYS', '14'))
        rotar_backups_antiguos(dias_a_conservar=dias)
        subir_respaldo_a_google_drive(ruta, nombre)
    except Exception:
        logger.exception('Falló el respaldo externo diario.')
        enviar_alerta_respaldo(False)
        raise

    enviar_alerta_respaldo(True, nombre)
    logger.info('Respaldo externo diario completado: %s', nombre)
    return nombre
