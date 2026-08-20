"""
Generación del volcado de base de datos (SQLite en dev, PostgreSQL en
producción). Extraído de authentication/views.py::UserManagementViewSet.backup
para poder reusarlo también desde la tarea automática diaria (ver
usuarios/tasks.py::respaldo_diario_automatico) sin duplicar la lógica.
"""
import os
import shutil
import sqlite3
import subprocess
from datetime import datetime

from django.conf import settings


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
    Borra volcados (backup_*.sql) más viejos que `dias_a_conservar` en
    `backup_dir`. Sin esto, la tarea diaria acumula un .sql nuevo cada día
    para siempre hasta llenar el disco del servidor.
    """
    backup_dir = backup_dir or os.path.join(settings.MEDIA_ROOT, 'backups')
    if not os.path.isdir(backup_dir):
        return []

    limite = datetime.now().timestamp() - dias_a_conservar * 86400
    borrados = []
    for nombre in os.listdir(backup_dir):
        if not (nombre.startswith('backup_') and nombre.endswith('.sql')):
            continue
        ruta = os.path.join(backup_dir, nombre)
        if os.path.isfile(ruta) and os.path.getmtime(ruta) < limite:
            os.remove(ruta)
            borrados.append(nombre)
    return borrados
