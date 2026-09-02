"""
Script de solo lectura para verificar el backfill de tipo_concepto
(migraciones cobranza/0034-0036, ver cobranza/migrations/0035_backfill_
tipo_concepto_proyecto_inversion.py) contra un dump de PRODUCCIÓN RESTAURADO
— nunca contra la base de datos de producción en vivo.

No usa el ORM/modelos (para no depender de en qué punto exacto de la cadena
de migraciones está la BD restaurada): consulta directo con SQL de solo
lectura (SELECT) las columnas que existen en el esquema viejo Y en el nuevo
(id, monto_usd, monto_pagado, pagado), así que sirve tanto ANTES como
DESPUÉS de aplicar 0034-0036 sobre el mismo dump. No ejecuta ningún INSERT/
UPDATE/DELETE.

Uso típico (contra una base restaurada en una instancia de staging, NUNCA
contra producción en vivo):

    # 1. Restaurar el dump de producción (pre-migración) en una BD de staging.
    # 2. ANTES de correr `migrate`:
    python manage.py verificar_backfill_produccion --baseline --salida baseline.json

    # 3. Correr las migraciones normalmente:
    python manage.py migrate cobranza

    # 4. DESPUÉS de migrar, comparar contra el baseline:
    python manage.py verificar_backfill_produccion --comparar --entrada baseline.json

El modo --comparar además reporta (informativo, no se compara contra el
baseline porque esas columnas no existían antes de migrar):
  - filas con tipo_concepto NULL (debe ser 0 tras 0036).
  - conteo de filas por TipoCargoEspecial.
"""
import json
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


def _leer_filas_actuales():
    """[(id, monto_usd, monto_pagado, pagado), ...] vía SQL crudo, solo lectura."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, monto_usd, monto_pagado, pagado "
            "FROM cobranza_cuotaproyectoinversion ORDER BY id"
        )
        return cursor.fetchall()


def _columna_existe(nombre_columna):
    with connection.cursor() as cursor:
        try:
            cursor.execute(
                f"SELECT {nombre_columna} FROM cobranza_cuotaproyectoinversion LIMIT 1"
            )
            return True
        except Exception:
            return False


def _resumen(filas):
    total = len(filas)
    suma_monto_usd = sum((Decimal(str(f[1])) for f in filas), Decimal('0.00'))
    suma_monto_pagado = sum((Decimal(str(f[2])) for f in filas), Decimal('0.00'))
    total_pagadas = sum(1 for f in filas if f[3])
    estados = [[f[0], bool(f[3])] for f in filas]
    return {
        'total_filas': total,
        'suma_monto_usd': str(suma_monto_usd),
        'suma_monto_pagado': str(suma_monto_pagado),
        'total_pagadas': total_pagadas,
        'estados': estados,
    }


class Command(BaseCommand):
    help = (
        "Verificación de solo lectura del backfill de tipo_concepto en "
        "CuotaProyectoInversion, para correr contra un dump de producción "
        "restaurado (nunca contra producción en vivo). No escribe nada."
    )

    def add_arguments(self, parser):
        modo = parser.add_mutually_exclusive_group(required=True)
        modo.add_argument(
            '--baseline', action='store_true',
            help="Calcula y guarda el snapshot ANTES de migrar.",
        )
        modo.add_argument(
            '--comparar', action='store_true',
            help="Recalcula el snapshot DESPUÉS de migrar y lo compara contra --entrada.",
        )
        parser.add_argument('--salida', help="Archivo JSON donde guardar el baseline (con --baseline).")
        parser.add_argument('--entrada', help="Archivo JSON del baseline a comparar (con --comparar).")

    def handle(self, *args, **options):
        filas = _leer_filas_actuales()
        actual = _resumen(filas)

        if options['baseline']:
            if not options['salida']:
                raise CommandError("--baseline requiere --salida <archivo.json>.")
            with open(options['salida'], 'w', encoding='utf-8') as f:
                json.dump(actual, f, indent=2, ensure_ascii=False)
            self.stdout.write(self.style.SUCCESS(
                f"Baseline guardado en {options['salida']}: "
                f"{actual['total_filas']} filas, suma monto_usd={actual['suma_monto_usd']}, "
                f"suma monto_pagado={actual['suma_monto_pagado']}, pagadas={actual['total_pagadas']}."
            ))
            return

        # --comparar
        if not options['entrada']:
            raise CommandError("--comparar requiere --entrada <archivo.json>.")
        with open(options['entrada'], 'r', encoding='utf-8') as f:
            baseline = json.load(f)

        errores = []
        if actual['total_filas'] != baseline['total_filas']:
            errores.append(
                f"total_filas: baseline={baseline['total_filas']} actual={actual['total_filas']}"
            )
        if actual['suma_monto_usd'] != baseline['suma_monto_usd']:
            errores.append(
                f"suma_monto_usd: baseline={baseline['suma_monto_usd']} actual={actual['suma_monto_usd']}"
            )
        if actual['suma_monto_pagado'] != baseline['suma_monto_pagado']:
            errores.append(
                f"suma_monto_pagado: baseline={baseline['suma_monto_pagado']} actual={actual['suma_monto_pagado']}"
            )
        if actual['total_pagadas'] != baseline['total_pagadas']:
            errores.append(
                f"total_pagadas: baseline={baseline['total_pagadas']} actual={actual['total_pagadas']}"
            )
        if actual['estados'] != baseline['estados']:
            estados_baseline = dict(baseline['estados'])
            estados_actual = dict(actual['estados'])
            ids_agregados = sorted(set(estados_actual) - set(estados_baseline))
            ids_faltantes = sorted(set(estados_baseline) - set(estados_actual))
            ids_cambiados = sorted(
                i for i in (set(estados_actual) & set(estados_baseline))
                if estados_actual[i] != estados_baseline[i]
            )
            if ids_agregados:
                errores.append(f"filas nuevas que no estaban en el baseline: {ids_agregados}")
            if ids_faltantes:
                errores.append(f"filas del baseline que ya no existen: {ids_faltantes}")
            if ids_cambiados:
                errores.append(f"filas con `pagado` distinto al baseline: {ids_cambiados}")

        if errores:
            self.stdout.write(self.style.ERROR("FALLÓ la verificación del backfill:"))
            for e in errores:
                self.stdout.write(self.style.ERROR(f"  - {e}"))
            raise CommandError(f"{len(errores)} discrepancia(s) encontradas contra el baseline.")

        self.stdout.write(self.style.SUCCESS(
            f"OK: {actual['total_filas']} filas, suma monto_usd={actual['suma_monto_usd']}, "
            f"suma monto_pagado={actual['suma_monto_pagado']}, pagadas={actual['total_pagadas']} "
            "— idénticos al baseline pre-migración."
        ))

        # Informativo, no comparado contra el baseline (esquema viejo no tenía estas columnas).
        if _columna_existe('tipo_concepto_id'):
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM cobranza_cuotaproyectoinversion WHERE tipo_concepto_id IS NULL"
                )
                sin_tipo = cursor.fetchone()[0]
                cursor.execute(
                    "SELECT t.nombre, COUNT(*) FROM cobranza_cuotaproyectoinversion c "
                    "JOIN cobranza_tipocargoespecial t ON t.id = c.tipo_concepto_id "
                    "GROUP BY t.nombre ORDER BY t.nombre"
                )
                por_tipo = cursor.fetchall()
            self.stdout.write(f"Filas sin tipo_concepto asignado: {sin_tipo} (debe ser 0).")
            for nombre, count in por_tipo:
                self.stdout.write(f"  - {nombre}: {count} filas")
