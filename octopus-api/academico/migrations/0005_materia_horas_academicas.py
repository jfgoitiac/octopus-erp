from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academico', '0004_alter_historicalasistencia_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='materia',
            name='horas_academicas',
            field=models.PositiveSmallIntegerField(default=4),
        ),
    ]
