"""
Backfill idempotente: crea el registro Docente para cada Usuario cuyo
PerfilUsuario.rol == 'docente' y, si es posible, lo enlaza a su
rrhh.Empleado (tipo_personal='docente') por email o por username/cédula.

Nunca sobrescribe un Docente ya existente ni el enlace a empleado que
ya tuviera.

Uso:
    python manage.py sincronizar_docentes
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from academico.models import Docente
from rrhh.models import Empleado

Usuario = get_user_model()


class Command(BaseCommand):
    help = (
        "Crea el registro Docente para cada usuario con rol 'docente' que "
        "todavía no lo tenga, e intenta enlazarlo con su rrhh.Empleado."
    )

    def handle(self, *args, **options):
        usuarios_docentes = Usuario.objects.filter(perfil__rol='docente')

        creados = []
        enlazados = []
        sin_enlazar = []

        for user in usuarios_docentes:
            docente, fue_creado = Docente.objects.get_or_create(user=user)

            if not fue_creado:
                continue

            creados.append(user.username)

            empleado = None
            if user.email:
                empleado = Empleado.objects.filter(
                    tipo_personal='docente', correo=user.email
                ).first()
            if empleado is None:
                empleado = Empleado.objects.filter(
                    tipo_personal='docente', cedula=user.username
                ).first()

            if empleado is not None:
                docente.empleado = empleado
                docente.save(update_fields=['empleado'])
                enlazados.append((user.username, empleado.cedula))
            else:
                sin_enlazar.append(user.username)

        self.stdout.write(self.style.SUCCESS(f"Docentes creados: {len(creados)}"))
        for username in creados:
            self.stdout.write(f"  + {username}")

        self.stdout.write(self.style.SUCCESS(f"Enlazados a Empleado: {len(enlazados)}"))
        for username, cedula in enlazados:
            self.stdout.write(f"  ~ {username} -> Empleado(cedula={cedula})")

        self.stdout.write(self.style.WARNING(f"Sin enlazar: {len(sin_enlazar)}"))
        for username in sin_enlazar:
            self.stdout.write(f"  ? {username}")
