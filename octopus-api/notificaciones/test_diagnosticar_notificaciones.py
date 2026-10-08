from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings


def correr():
    out = StringIO()
    call_command('diagnosticar_notificaciones', stdout=out)
    return out.getvalue()


class DiagnosticarNotificacionesTests(TestCase):
    @override_settings(VAPID_PUBLIC_KEY='', VAPID_PRIVATE_KEY='', CELERY_TASK_ALWAYS_EAGER=False)
    def test_detecta_vapid_faltante_y_sin_worker(self):
        with patch('config.celery.app.control.ping', return_value=[]):
            salida = correr()
        self.assertIn('✘ Faltan las claves VAPID', salida)
        self.assertIn('✘ No hay worker de Celery', salida)
        self.assertIn('CELERY_TASK_ALWAYS_EAGER=True', salida)
        self.assertIn('✘ No hay ninguna suscripción push activa', salida)

    @override_settings(VAPID_PUBLIC_KEY='p', VAPID_PRIVATE_KEY='k', CELERY_TASK_ALWAYS_EAGER=True)
    def test_modo_directo_no_pide_worker(self):
        salida = correr()
        self.assertIn('✔ Claves VAPID configuradas', salida)
        self.assertIn('modo directo', salida)
        self.assertNotIn('worker de Celery', salida)
