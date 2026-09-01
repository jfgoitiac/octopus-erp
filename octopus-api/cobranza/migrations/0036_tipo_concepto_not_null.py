import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Cierra la transición iniciada en 0034/0035: ya todas las filas viven con
    tipo_concepto asignado a la semilla "Proyecto de Inversión", así que se
    puede exigir NOT NULL en la tabla viva. A partir de aquí,
    unique_together=(representante, periodo_escolar, tipo_concepto,
    numero_cuota) (ya aplicado en 0034) sí colisiona correctamente sobre
    estas filas: los 7 puntos de escritura que insertan/actualizan
    CuotaProyectoInversion (ver secretaria/views.py,
    secretaria/serializers.py,
    cobranza/management/commands/generar_cuotas_inscripcion.py) deben incluir
    tipo_concepto y numero_cuota en la clave desde este mismo despliegue —
    de lo contrario Postgres no aplica unicidad sobre NULL y empiezan a
    insertarse duplicados.

    El campo espejo en HistoricalCuotaProyectoInversion se deja tal cual
    (blank/null=True): así lo genera simple_history por defecto para FKs
    históricas, y no se toca — no hay riesgo de duplicados ahí porque la
    tabla histórica no tiene unique_together.
    """

    dependencies = [
        ('cobranza', '0035_backfill_tipo_concepto_proyecto_inversion'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cuotaproyectoinversion',
            name='tipo_concepto',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cuotas', to='cobranza.tipocargoespecial',
            ),
        ),
    ]
