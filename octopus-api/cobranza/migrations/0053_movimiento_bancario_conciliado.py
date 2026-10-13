"""
Una línea del estado de cuenta puede cubrir varias operaciones (pago conjunto
de hermanos). Se extrae la línea a MovimientoBancarioConciliado (único por
banco + referencia + fecha) y cada ConciliacionBancaria apunta a él.

Datos: cada conciliación existente ya consumía su propia línea (la
restricción anterior lo garantizaba), así que se crea un movimiento por
conciliación con los mismos montos.
"""
import django.db.models.deletion
from django.db import migrations, models


def crear_movimientos(apps, schema_editor):
    Conciliacion = apps.get_model('cobranza', 'ConciliacionBancaria')
    Movimiento = apps.get_model('cobranza', 'MovimientoBancarioConciliado')
    for c in Conciliacion.objects.all().iterator():
        mov = Movimiento.objects.create(
            banco_id=c.banco_id,
            referencia=c.referencia_banco,
            fecha=c.fecha_banco,
            monto_banco_ves=c.monto_banco_ves,
            monto_sistema_ves=c.monto_sistema_ves,
            diferencia_ves=c.diferencia_ves,
            tolerancia_aplicada_ves=c.tolerancia_aplicada_ves,
            fuera_tolerancia=c.fuera_tolerancia,
        )
        Conciliacion.objects.filter(pk=c.pk).update(
            movimiento_id=mov.pk, monto_operacion_ves=c.monto_sistema_ves,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0052_merge_20261013_0832'),
    ]

    operations = [
        migrations.CreateModel(
            name='MovimientoBancarioConciliado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('referencia', models.CharField(max_length=100)),
                ('fecha', models.DateField()),
                ('monto_banco_ves', models.DecimalField(decimal_places=2, max_digits=20)),
                ('monto_sistema_ves', models.DecimalField(decimal_places=2, default=0, max_digits=20)),
                ('diferencia_ves', models.DecimalField(decimal_places=2, default=0, max_digits=20)),
                ('tolerancia_aplicada_ves', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('fuera_tolerancia', models.BooleanField(default=False)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('banco', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='movimientos_conciliados', to='cobranza.bancoinstitucional',
                )),
            ],
            options={
                'ordering': ['-creado_en'],
                'constraints': [models.UniqueConstraint(
                    fields=('banco', 'referencia', 'fecha'), name='unico_movimiento_bancario_conciliado',
                )],
            },
        ),
        migrations.AddField(
            model_name='conciliacionbancaria',
            name='movimiento',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='conciliaciones', to='cobranza.movimientobancarioconciliado',
            ),
        ),
        migrations.AddField(
            model_name='conciliacionbancaria',
            name='monto_operacion_ves',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=20),
        ),
        migrations.RemoveConstraint(
            model_name='conciliacionbancaria',
            name='unica_linea_banco_conciliada',
        ),
        migrations.RunPython(crear_movimientos, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='conciliacionbancaria',
            name='movimiento',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='conciliaciones', to='cobranza.movimientobancarioconciliado',
            ),
        ),
    ]
