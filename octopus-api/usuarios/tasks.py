import logging

from celery import shared_task

from .backup import generar_backup_bd, rotar_backups_antiguos

logger = logging.getLogger(__name__)


@shared_task
def respaldo_diario_automatico():
    """
    Genera un volcado de la BD todos los días (ver CELERY_BEAT_SCHEDULE en
    config/settings.py) y rota los más viejos que 14 días, para no depender
    de que alguien dispare el respaldo a mano desde /admin/usuarios/backup/.

    Se guarda en el servidor (MEDIA_ROOT/backups/, mismo directorio que ya
    usa la descarga manual) — sin subir a ningún servicio externo. El
    directorio destino se puede apuntar a un segundo disco/punto de montaje
    del propio servidor vía BACKUP_DIR en el .env si se quiere separar del
    disco de datos; sigue siendo un backup local, no reemplaza sacar una
    copia fuera del servidor de vez en cuando (ver RESTAURACION_EMERGENCIA.md).
    """
    import os
    backup_dir = os.environ.get('BACKUP_DIR') or None

    try:
        file_path, filename = generar_backup_bd(backup_dir)
        logger.info(f'Respaldo automático generado: {filename}')
    except Exception as e:
        logger.error(f'Falló el respaldo automático diario: {e}')
        return

    try:
        borrados = rotar_backups_antiguos(backup_dir)
        if borrados:
            logger.info(f'Respaldo automático: {len(borrados)} volcado(s) antiguo(s) eliminado(s).')
    except Exception as e:
        logger.warning(f'No se pudo rotar respaldos antiguos: {e}')
