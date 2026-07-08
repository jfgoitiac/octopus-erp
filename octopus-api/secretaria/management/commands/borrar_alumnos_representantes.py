"""
Borra por completo todos los Alumnos y Representantes de la base de datos,
junto con todo lo que depende de ellos (cobranza, académico y acceso al
portal). Pensado para limpiar datos de prueba/demo antes de pasar a
producción real. NO toca configuración del sistema, usuarios de staff,
bancos institucionales, tasas de cambio ni cierres de caja.

Borra, en este orden (por los PROTECT en Pago e Inscripcion):
    1. Pago
    2. Inscripcion
    3. Mensualidad, CuotaInscripcion, CuotaSolvencia
    4. Nota, Asistencia
    5. RepresentanteUser (y su User de Django asociado, login del portal)
    6. Alumno
    7. Representante

Por seguridad corre en modo solo-lectura (dry-run) por defecto.
Para aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py borrar_alumnos_representantes             # solo reporta
    python manage.py borrar_alumnos_representantes --confirm    # borra de verdad
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from secretaria.models import Alumno, Representante
from cobranza.models import Pago, Mensualidad, CuotaInscripcion, CuotaSolvencia
from secretaria.models import Inscripcion
from academico.models import Nota, Asistencia
from portal.models import RepresentanteUser


class Command(BaseCommand):
    help = (
        "Borra todos los Alumnos y Representantes y sus datos dependientes "
        "(cobranza, académico, acceso al portal). No toca configuración ni usuarios de staff."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica el borrado de verdad. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']

        n_pago = Pago.objects.count()
        n_inscripcion = Inscripcion.objects.count()
        n_mensualidad = Mensualidad.objects.count()
        n_cuota_inscripcion = CuotaInscripcion.objects.count()
        n_cuota_solvencia = CuotaSolvencia.objects.count()
        n_nota = Nota.objects.count()
        n_asistencia = Asistencia.objects.count()
        n_portal_user = RepresentanteUser.objects.count()
        n_alumno = Alumno.objects.count()
        n_representante = Representante.objects.count()

        self.stdout.write(
            "Se borrarían -> "
            f"Pago: {n_pago} | Inscripcion: {n_inscripcion} | "
            f"Mensualidad: {n_mensualidad} | CuotaInscripcion: {n_cuota_inscripcion} | "
            f"CuotaSolvencia: {n_cuota_solvencia} | Nota: {n_nota} | Asistencia: {n_asistencia} | "
            f"RepresentanteUser (+ su User de portal): {n_portal_user} | "
            f"Alumno: {n_alumno} | Representante: {n_representante}"
        )

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se borró nada. Vuelve a correr con --confirm para aplicar el borrado."
            ))
            return

        with transaction.atomic():
            Pago.objects.all().delete()
            Inscripcion.objects.all().delete()
            Mensualidad.objects.all().delete()
            CuotaInscripcion.objects.all().delete()
            CuotaSolvencia.objects.all().delete()
            Nota.objects.all().delete()
            Asistencia.objects.all().delete()

            # Borra también el User de Django que da acceso al portal a cada representante
            usuarios_portal_ids = list(RepresentanteUser.objects.values_list('user_id', flat=True))
            RepresentanteUser.objects.all().delete()
            if usuarios_portal_ids:
                from django.contrib.auth import get_user_model
                get_user_model().objects.filter(pk__in=usuarios_portal_ids).delete()

            Alumno.objects.all().delete()
            Representante.objects.all().delete()

        self.stdout.write(self.style.SUCCESS(
            "Listo. Se borraron todos los Alumnos, Representantes y sus datos dependientes "
            "(cobranza, académico, acceso al portal). Configuración, bancos, tasas de cambio "
            "y usuarios de staff quedaron intactos."
        ))
