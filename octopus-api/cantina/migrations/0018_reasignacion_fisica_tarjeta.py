from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cantina', '0017_historialcodigotarjeta_serial_anterior'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tarjetaprepago',
            name='estado',
            field=models.CharField(
                choices=[
                    ('sin_asignar', 'Sin asignar'),
                    ('activa', 'Activa'),
                    ('bloqueada', 'Bloqueada'),
                    ('extraviada', 'Extraviada'),
                    ('retirada', 'Retirada'),
                ],
                default='sin_asignar',
                max_length=15,
            ),
        ),
        migrations.AddField(
            model_name='historialcodigotarjeta',
            name='codigo_nuevo',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='historialcodigotarjeta',
            name='serial_nuevo',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='historialcodigotarjeta',
            name='tarjeta_reemplazo',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='reposiciones_como_reemplazo',
                to='cantina.tarjetaprepago',
            ),
        ),
    ]
