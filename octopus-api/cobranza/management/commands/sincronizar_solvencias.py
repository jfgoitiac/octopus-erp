"""
Salda la CuotaSolvencia del período indicado (monto_pagado = monto_usd) para
todo alumno activo que esté SOLVENTE o YA INSCRITO en ese período — sin
importar que su CuotaSolvencia hubiera quedado con deuda pendiente por datos
desactualizados de antes de que `CuotaSolvencia.save()` derivara `pagado`
automáticamente (ver cobranza/models.py).

"Solvente" aquí se calcula EXCLUYENDO la propia deuda de solvencia: se usa
`monto_adeudado` (mensualidad + inscripción) y `monto_proyecto_inversion_adeudado`
de `annotate_mora_detalle` (cobranza/mora.py), que ya separan la solvencia del
resto exactamente para este caso. Usar el criterio canónico completo de mora
(que SÍ incluye la solvencia impaga) sería circular: ningún alumno con
solvencia pendiente podría calificar nunca, y el comando sería un no-op.

Los alumnos con mora POR OTRA DEUDA (mensualidad, inscripción o proyecto de
inversión) quedan siempre excluidos, aunque tengan Inscripcion para el
período: su deuda de solvencia no se toca. No es un "resetear_deudas": no
perdona deuda real, solo corrige el monto_pagado de quienes ya no deberían
deuda de solvencia.

Es idempotente: si se corre dos veces, la segunda vez no encuentra nada
pendiente que saldar.

Por seguridad, corre en modo de solo-lectura (dry-run) por defecto. Para
aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py sincronizar_solvencias                       # dry-run, período activo
    python manage.py sincronizar_solvencias --confirm              # aplica, período activo
    python manage.py sincronizar_solvencias --periodo 2025-2026 --confirm
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F, Q

from cobranza.mora import annotate_mora_detalle
from cobranza.models import CuotaSolvencia
from secretaria.models import Alumno, Inscripcion


class Command(BaseCommand):
    help = (
        "Salda la CuotaSolvencia del período dado para alumnos solventes o ya "
        "inscritos, sin tocar a los que estén en mora por otra deuda."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--periodo',
            help="Período escolar, ej: 2025-2026. Por defecto usa el período activo de ConfiguracionSistema.",
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica el saldo real. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']
        periodo = (options['periodo'] or '').strip()

        if not periodo:
            from secretaria.models import ConfiguracionSistema
            config = ConfiguracionSistema.objects.first()
            periodo = config.periodo_escolar_activo if config else None

        if not periodo:
            raise CommandError(
                "No hay período escolar activo configurado en ConfiguracionSistema. "
                "Indique uno explícitamente con --periodo 2025-2026."
            )

        alumnos_activos = Alumno.objects.filter(activo=True)
        alumnos_anotados = annotate_mora_detalle(alumnos_activos)

        # Deuda ajena a la solvencia (mensualidad + inscripción, y proyecto de
        # inversión del representante). Deliberadamente NO se usa `en_mora`
        # (el campo completo) porque ese sí incluye la solvencia impaga y
        # volvería circular la definición de "solvente" para este comando.
        ids_bloqueados = set(
            alumnos_anotados.filter(
                Q(monto_adeudado__gt=0) | Q(monto_proyecto_inversion_adeudado__gt=0)
            ).values_list('pk', flat=True)
        )
        ids_solventes = set(
            alumnos_activos.exclude(pk__in=ids_bloqueados).values_list('pk', flat=True)
        )
        ids_inscritos = set(
            Inscripcion.objects.filter(alumno__in=alumnos_activos, periodo_escolar=periodo)
            .values_list('alumno_id', flat=True)
        )

        # Solventes O ya inscritos — pero jamás alguien bloqueado por otra
        # deuda real, aunque esté inscrito (ej. inscrito el año pasado y hoy
        # debe mensualidades).
        ids_elegibles = (ids_solventes | ids_inscritos) - ids_bloqueados

        cuotas_pendientes = CuotaSolvencia.objects.filter(
            alumno_id__in=ids_elegibles,
            periodo_escolar=periodo,
            monto_pagado__lt=F('monto_usd'),
        ).select_related('alumno')

        total = cuotas_pendientes.count()
        monto_total = sum((c.monto_usd - c.monto_pagado for c in cuotas_pendientes), start=0) if total else 0

        self.stdout.write(
            f"Período {periodo} | Alumnos elegibles (solventes o inscritos, sin otra deuda): {len(ids_elegibles)} | "
            f"Excluidos por mora en otra deuda: {len(ids_bloqueados)} | "
            f"CuotaSolvencia con saldo pendiente a saldar: {total} (${monto_total})"
        )

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se escribió nada. Vuelve a correr con --confirm para aplicar."
            ))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay nada que saldar."))
            return

        actualizadas = 0
        with transaction.atomic():
            for cuota in cuotas_pendientes:
                cuota.monto_pagado = cuota.monto_usd
                # fecha_pago se deriva sola en save() al quedar saldada.
                cuota.save()
                actualizadas += 1

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {actualizadas} CuotaSolvencia saldadas para el período {periodo}. "
            "Los alumnos en mora por otra deuda no fueron tocados."
        ))
