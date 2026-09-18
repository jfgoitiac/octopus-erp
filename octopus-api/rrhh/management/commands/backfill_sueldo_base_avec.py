"""
Backfill de sueldo_base para docentes AVEC tras retirar la tabla global de
sueldos por categoría del modal "Configuración de Cesta Ticket" (Pagos).

Antes, el sueldo base de un docente en convenio AVEC no vivía en su ficha:
se recalculaba en cada nómina como
    (categorias[categoria_docente].sueldo_mensual / horas_sem_referencia) * horas_semanales
usando la config global guardada en ParametroGlobal(clave='NOMINA_CONFIG_JSON').
Ahora el cálculo lee directamente Empleado.sueldo_base, que para estos
docentes está vacío porque el formulario nunca lo pedía. Este comando congela
esa fórmula una sola vez para completar el campo con el valor que el docente
ya tenía "de facto" antes del cambio.

Por defecto solo LISTA los docentes AVEC con sueldo_base vacío y el valor que
se les asignaría (dry-run). Con --aplicar escribe Empleado.sueldo_base (lo
que dispara la sincronización automática a nomina.Empleado.sueldo_base_ves
vía Empleado.save()). No borra ni modifica ningún otro campo.

Uso:
    python manage.py backfill_sueldo_base_avec
    python manage.py backfill_sueldo_base_avec --aplicar
"""
import json

from django.core.management.base import BaseCommand

from rrhh.models import Empleado


class Command(BaseCommand):
    help = (
        "Lista (o con --aplicar, completa) el sueldo_base de docentes AVEC que "
        "hoy lo tienen vacío, usando la fórmula histórica basada en la tabla "
        "de categorías que se retira del modal de Cesta Ticket."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--aplicar',
            action='store_true',
            help='Escribe los valores calculados en Empleado.sueldo_base. Sin esta bandera solo se listan.',
        )

    def handle(self, *args, **options):
        aplicar = options['aplicar']

        categorias, horas_sem_referencia = self._cargar_config()
        if categorias is None:
            self.stdout.write(self.style.WARNING(
                "No hay configuración NOMINA_CONFIG_JSON guardada (o no tiene 'categorias'). "
                "Nada que migrar."
            ))
            return

        candidatos = Empleado.objects.filter(
            tipo_personal='docente',
        ).exclude(categoria_docente='').filter(sueldo_base__isnull=True) | Empleado.objects.filter(
            tipo_personal='docente',
        ).exclude(categoria_docente='').filter(sueldo_base=0)
        candidatos = candidatos.distinct().order_by('apellido', 'nombre')

        if not candidatos:
            self.stdout.write(self.style.SUCCESS('No hay docentes AVEC con sueldo_base vacío. Nada que migrar.'))
            return

        migrables = []
        sin_datos = []
        for emp in candidatos:
            sb = self._calcular_sueldo_base(emp, categorias, horas_sem_referencia)
            if sb is None:
                sin_datos.append(emp)
            else:
                migrables.append((emp, sb))

        self.stdout.write(self.style.WARNING(f'Docentes AVEC con sueldo_base vacío: {candidatos.count()}'))
        self.stdout.write('')
        header = f"{'id':<6}{'apellido, nombre':<35}{'categoría':<12}{'h/sem':<8}{'sueldo_base calculado':<22}"
        self.stdout.write(header)
        self.stdout.write('-' * len(header))
        for emp, sb in migrables:
            nombre = f"{emp.apellido}, {emp.nombre}"
            self.stdout.write(f"{emp.id:<6}{nombre:<35}{emp.categoria_docente:<12}{(emp.horas_semanales or ''):<8}{sb:<22}")

        if sin_datos:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(f'Sin datos suficientes para calcular (revisar a mano): {len(sin_datos)}'))
            for emp in sin_datos:
                nombre = f"{emp.apellido}, {emp.nombre}"
                self.stdout.write(f"  ? id={emp.id} {nombre} — categoria_docente={emp.categoria_docente!r} horas_semanales={emp.horas_semanales!r}")

        if not aplicar:
            self.stdout.write('')
            self.stdout.write('Dry-run: no se modificó nada. Repetir con --aplicar para escribir estos valores.')
            return

        actualizados = []
        for emp, sb in migrables:
            emp.sueldo_base = sb
            emp.save(update_fields=['sueldo_base'])
            actualizados.append(emp)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'sueldo_base actualizado en {len(actualizados)} docente(s) AVEC.'))

    def _cargar_config(self):
        from cobranza.models import ParametroGlobal

        param = ParametroGlobal.objects.filter(clave='NOMINA_CONFIG_JSON').first()
        if not param or not param.valor:
            return None, None
        try:
            data = json.loads(param.valor)
        except (TypeError, ValueError):
            return None, None
        categorias = data.get('categorias')
        if not categorias:
            return None, None
        horas_sem_referencia = float(data.get('horas_sem_referencia') or 44)
        return categorias, horas_sem_referencia

    def _calcular_sueldo_base(self, emp, categorias, horas_sem_referencia):
        cat_cfg = categorias.get(emp.categoria_docente) or {}
        sueldo_mensual = cat_cfg.get('sueldo_mensual')
        horas_semanales = emp.horas_semanales

        try:
            sueldo_mensual = float(sueldo_mensual) if sueldo_mensual not in (None, '') else 0
        except (TypeError, ValueError):
            sueldo_mensual = 0
        if sueldo_mensual <= 0 or not horas_semanales:
            return None

        costo_hora = sueldo_mensual / horas_sem_referencia
        sb = round(costo_hora * float(horas_semanales), 2)
        return sb if sb > 0 else None
