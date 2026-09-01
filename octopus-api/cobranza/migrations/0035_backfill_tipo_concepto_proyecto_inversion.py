from decimal import Decimal

from django.db import migrations


NOMBRE_SEMILLA = "Proyecto de Inversión"


def crear_semilla_y_backfill(apps, schema_editor):
    TipoCargoEspecial = apps.get_model('cobranza', 'TipoCargoEspecial')
    CuotaProyectoInversion = apps.get_model('cobranza', 'CuotaProyectoInversion')
    HistoricalCuotaProyectoInversion = apps.get_model('cobranza', 'HistoricalCuotaProyectoInversion')
    ParametroGlobal = apps.get_model('cobranza', 'ParametroGlobal')

    param = ParametroGlobal.objects.filter(clave="MONTO_PROYECTO_INVERSION_DEFECTO").first()
    try:
        monto_defecto = Decimal(param.valor) if param and param.valor else Decimal('0.00')
    except Exception:
        monto_defecto = Decimal('0.00')

    semilla, _ = TipoCargoEspecial.objects.get_or_create(
        nombre=NOMBRE_SEMILLA,
        defaults={
            'monto_defecto_usd': monto_defecto,
            'periodicidad': 'unico',
            'numero_cuotas': 1,
            'bloquea_inscripcion': True,
            'alcance': 'todos',
            'activo': True,
        },
    )

    CuotaProyectoInversion.objects.filter(tipo_concepto__isnull=True).update(tipo_concepto_id=semilla.id)
    HistoricalCuotaProyectoInversion.objects.filter(tipo_concepto__isnull=True).update(tipo_concepto_id=semilla.id)


def revertir(apps, schema_editor):
    # No se elimina la semilla ni se limpia tipo_concepto: la migración
    # inversa dejaría filas con tipo_concepto NOT NULL apuntando a nada,
    # y la migración siguiente (AlterField a null=False) ya haría inválido
    # cualquier intento de dejarlo en NULL de nuevo.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0034_agregar_tipocargoespecial_y_campos'),
    ]

    operations = [
        migrations.RunPython(crear_semilla_y_backfill, revertir),
    ]
