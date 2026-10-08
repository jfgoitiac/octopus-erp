from django.conf import settings
from django.core.management.base import BaseCommand

OK, MAL, AVISO = '✔', '✘', '!'


class Command(BaseCommand):
    help = 'Revisa por qué no salen las notificaciones (push/email) y dice qué corregir.'

    def linea(self, estado, texto, accion=''):
        self.stdout.write(f' {estado} {texto}')
        if accion:
            self.stdout.write(f'     → {accion}')

    def handle(self, *args, **opts):
        self.stdout.write('Diagnóstico de notificaciones\n')

        # 1. Librerías
        try:
            import pywebpush, py_vapid  # noqa: F401
            self.linea(OK, 'Librerías de push instaladas (pywebpush, py-vapid)')
        except ImportError as e:
            self.linea(MAL, f'Falta una librería de push: {e}', 'pip install -r requirements.txt (ver deploy.sh)')

        # 2. VAPID
        pub, priv = settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY
        if pub and priv:
            self.linea(OK, 'Claves VAPID configuradas')
        else:
            self.linea(MAL, 'Faltan las claves VAPID (el push queda apagado)',
                       'python manage.py generar_vapid y reiniciar el servicio')

        # 3. Cómo se despachan los avisos
        if settings.CELERY_TASK_ALWAYS_EAGER:
            self.linea(OK, 'Avisos en modo directo (CELERY_TASK_ALWAYS_EAGER=True): no necesitan worker')
        else:
            self._revisar_celery()

        # 4. Suscripciones
        from notificaciones.models import NotificacionLog, SuscripcionPush, SuscripcionPushUsuario
        reps = SuscripcionPush.objects.filter(activa=True).count()
        staff = SuscripcionPushUsuario.objects.filter(activa=True).count()
        if reps or staff:
            self.linea(OK, f'Suscripciones push activas: {reps} representantes, {staff} usuarios del panel')
        else:
            self.linea(MAL, 'No hay ninguna suscripción push activa',
                       'Cada usuario debe abrir el sitio por HTTPS, pulsar la campana y aceptar el permiso del navegador')

        # 5. Últimos intentos
        ultimos = NotificacionLog.objects.filter(canal='push').order_by('-fecha_envio')[:5]
        if not ultimos:
            self.linea(AVISO, 'Todavía no se ha intentado enviar ningún push')
        for n in ultimos:
            marca = OK if n.estado == 'enviado' else MAL
            self.linea(marca, f'{n.fecha_envio:%d/%m %H:%M} push {n.tipo}: {n.estado} {n.error_detalle[:120]}')

    def _revisar_celery(self):
        try:
            from config.celery import app
            if not app.control.ping(timeout=2):
                raise RuntimeError('sin workers activos')
            self.linea(OK, 'Worker de Celery activo')
        except Exception as e:
            self.linea(
                MAL, f'No hay worker de Celery respondiendo ({str(e)[:80]})',
                'Sin worker los avisos nunca salen. Opción simple: CELERY_TASK_ALWAYS_EAGER=True en .env y reiniciar; '
                'o levantar Redis + worker (octopus-api/ARRANQUE_CELERY.md)')
