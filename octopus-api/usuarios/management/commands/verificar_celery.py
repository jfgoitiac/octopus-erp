"""
Comprobación de salud de Redis, el worker de Celery y Beat — solo lectura.

No reinicia ni modifica nada: usa el cliente Python de Redis para un PING,
`celery control inspect ping` (un broadcast que no interrumpe tareas en
curso) para confirmar que hay al menos un worker vivo, y consulta la tabla
de django_celery_beat para confirmar que hay tareas periódicas habilitadas
(proxy de que Beat tiene algo que programar; la liveness del *proceso* de
Beat solo puede verificarse desde el servidor con systemctl/journalctl —
ver ARRANQUE_CELERY.md).

Uso:
    python manage.py verificar_celery

Salida: 0 si Redis y el worker responden; 1 si alguno falla (útil para
un chequeo post-deploy sin necesidad de reiniciar nada).
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Verifica (solo lectura) que Redis responde, que hay al menos un '
        'worker de Celery activo y que existen tareas periódicas '
        'habilitadas para Beat. No reinicia ni interrumpe procesos.'
    )

    def handle(self, *args, **options):
        ok = True

        ok &= self._verificar_redis()
        ok &= self._verificar_worker()
        self._verificar_beat()

        if ok:
            self.stdout.write(self.style.SUCCESS('OK: Redis y el worker de Celery responden.'))
        else:
            self.stdout.write(self.style.ERROR(
                'FALLO: revisa el detalle arriba. En el servidor, comprobar sin reiniciar con:\n'
                '  redis-cli ping\n'
                '  systemctl is-active octopus-celery-worker octopus-celery-beat\n'
                '  systemctl status --no-pager octopus-celery-worker octopus-celery-beat\n'
                '  journalctl -u octopus-celery-worker -n 50 --no-pager\n'
                '  journalctl -u octopus-celery-beat -n 50 --no-pager'
            ))
            raise SystemExit(1)

    def _verificar_redis(self):
        from django.conf import settings

        try:
            import redis
        except ImportError:
            self.stdout.write(self.style.ERROR('El paquete "redis" no está instalado en este entorno.'))
            return False

        broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://localhost:6379/0')
        try:
            cliente = redis.from_url(broker_url, socket_connect_timeout=3, socket_timeout=3)
            if cliente.ping():
                self.stdout.write(self.style.SUCCESS(f'Redis OK ({broker_url})'))
                return True
            self.stdout.write(self.style.ERROR(f'Redis no respondió PING ({broker_url})'))
            return False
        except redis.RedisError as exc:
            self.stdout.write(self.style.ERROR(f'No se pudo conectar a Redis ({broker_url}): {exc}'))
            return False

    def _verificar_worker(self):
        from config.celery import app as celery_app

        try:
            respuestas = celery_app.control.inspect(timeout=3).ping() or {}
        except Exception as exc:  # errores de conexión al broker, no específicos de Celery
            self.stdout.write(self.style.ERROR(f'No se pudo consultar al worker de Celery: {exc}'))
            return False

        if not respuestas:
            self.stdout.write(self.style.ERROR('Ningún worker de Celery respondió al ping.'))
            return False

        for nombre in respuestas:
            self.stdout.write(self.style.SUCCESS(f'Worker activo: {nombre}'))
        return True

    def _verificar_beat(self):
        try:
            from django_celery_beat.models import PeriodicTask
        except ImportError:
            self.stdout.write(self.style.WARNING('django_celery_beat no está instalado; no se puede verificar Beat.'))
            return

        habilitadas = PeriodicTask.objects.filter(enabled=True).count()
        if habilitadas:
            self.stdout.write(self.style.SUCCESS(
                f'Beat: {habilitadas} tarea(s) periódica(s) habilitada(s) en la base de datos.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                'Beat: no hay tareas periódicas habilitadas (revisar CELERY_BEAT_SCHEDULE / migraciones).'
            ))
        self.stdout.write(
            'Nota: esto confirma la configuración, no que el proceso de Beat esté vivo. '
            'Verificar liveness del proceso en el servidor con: '
            'systemctl is-active octopus-celery-beat'
        )
