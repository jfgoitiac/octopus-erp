"""Ejecuta el respaldo externo de forma manual y controlada."""
from django.core.management.base import BaseCommand, CommandError

from usuarios.backup import ejecutar_respaldo_externo


class Command(BaseCommand):
    help = 'Genera PostgreSQL+media, rota copias locales, sube a Drive y alerta por correo.'

    def handle(self, *args, **options):
        try:
            nombre = ejecutar_respaldo_externo()
        except Exception as exc:
            raise CommandError('El respaldo externo falló; revisar el journal sin exponer credenciales.') from exc
        self.stdout.write(self.style.SUCCESS(f'Respaldo externo completado: {nombre}'))
