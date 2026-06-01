from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('multisede', '0001_initial'),
        ('academico', '0002_historical_nota_asistencia'),
    ]

    operations = [
        migrations.AddField(
            model_name='materia',
            name='sede',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='materias',
                to='multisede.sede',
                verbose_name='Sede',
            ),
        ),
    ]
