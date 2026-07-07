"""
Revierte DOS pasos de promoción de grado (ej. si un alumno quedó en
"4to Año" por un doble-click / doble corrida accidental de la promoción de
período, este comando lo regresa a "2do Año").

Usa el mismo MAPA_GRADOS de PromocionAlumnosView, invertido, aplicado dos
veces sobre el grado actual de cada alumno activo. La sección (ej. " - A")
se conserva tal cual.

Por seguridad, corre en modo solo-lectura (dry-run) por defecto. Para
aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py revertir_doble_promocion                # solo reporta
    python manage.py revertir_doble_promocion --confirm       # aplica el cambio real
    python manage.py revertir_doble_promocion --grado "4to Año" --confirm
        # limita la reversión solo a alumnos que están hoy en ese grado
"""
from django.core.management.base import BaseCommand

from secretaria.models import Alumno
from secretaria.views import PromocionAlumnosView


class Command(BaseCommand):
    help = (
        "Retrocede dos pasos de promoción de grado (ej. 4to Año -> 2do Año) "
        "para los alumnos activos afectados por una doble promoción accidental."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--grado',
            help='Limita la reversión a alumnos actualmente en este grado '
                 '(ej. "4to Año"). Sin esta bandera, revierte a todos los '
                 'alumnos activos cuyo grado tenga los dos pasos anteriores mapeados.',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica el cambio de verdad. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']
        grado_filtro = options['grado']

        # Invertir el mapa de promoción: destino -> origen
        mapa_inverso = {destino: origen for origen, destino in PromocionAlumnosView.MAPA_GRADOS.items()}

        alumnos = Alumno.objects.filter(activo=True).exclude(grado_seccion=None)

        a_revertir = []
        sin_mapeo = []
        for alumno in alumnos:
            grado_actual = alumno.grado_seccion or ''
            partes = grado_actual.split(' - ')
            nombre_grado = partes[0].strip()
            seccion = f" - {partes[1].strip()}" if len(partes) > 1 else ''

            if grado_filtro and nombre_grado != grado_filtro:
                continue

            # Retroceder un paso, luego otro
            paso1 = mapa_inverso.get(nombre_grado)
            paso2 = mapa_inverso.get(paso1) if paso1 else None

            if not paso2:
                sin_mapeo.append({
                    "alumno_id": alumno.id,
                    "nombre": f"{alumno.nombre} {alumno.apellido}",
                    "grado": grado_actual,
                })
                continue

            nuevo_grado_seccion = f"{paso2}{seccion}"
            if nuevo_grado_seccion != grado_actual:
                alumno.grado_seccion = nuevo_grado_seccion
                a_revertir.append(alumno)

        self.stdout.write(
            f"Alumnos activos evaluados: {alumnos.count()} | "
            f"A revertir: {len(a_revertir)} | Sin mapeo (se omiten): {len(sin_mapeo)}"
        )
        for item in sin_mapeo:
            self.stdout.write(self.style.WARNING(
                f"  - Omitido: {item['nombre']} (id={item['alumno_id']}) en '{item['grado']}' "
                f"no tiene dos pasos de reversión disponibles."
            ))

        if not a_revertir:
            self.stdout.write(self.style.SUCCESS("No hay alumnos que revertir."))
            return

        for alumno in a_revertir[:20]:
            self.stdout.write(f"  {alumno.nombre} {alumno.apellido} (id={alumno.id}) -> {alumno.grado_seccion}")
        if len(a_revertir) > 20:
            self.stdout.write(f"  ... y {len(a_revertir) - 20} más.")

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se escribió nada. Vuelve a correr con --confirm para aplicar el cambio."
            ))
            return

        Alumno.objects.bulk_update(a_revertir, ['grado_seccion'], batch_size=500)

        from usuarios.models import LogAuditoria
        LogAuditoria.objects.create(
            usuario=None,
            accion="REVERSION_DOBLE_PROMOCION",
            modulo="SISTEMAS",
            detalles={
                "total_revertidos": len(a_revertir),
                "alumnos_ids": [a.id for a in a_revertir],
                "sin_mapeo": len(sin_mapeo),
                "grado_filtro": grado_filtro,
            }
        )

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(a_revertir)} alumnos revertidos dos grados hacia atrás."
        ))
        self.stdout.write(
            "Nota: este comando NO toca ConfiguracionSistema.periodo_escolar_activo ni las "
            "CuotaInscripcion generadas por la promoción; revíselas manualmente si también "
            "corresponde deshacerlas."
        )
