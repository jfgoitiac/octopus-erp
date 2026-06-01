from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('multisede', '0001_initial'),
        ('secretaria', '0006_configuracionsistema_datos_colegio'),
    ]

    operations = [
        migrations.AddField(
            model_name='alumno',
            name='sede',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='alumnos',
                to='multisede.sede',
                verbose_name='Sede',
            ),
        ),
    ]
