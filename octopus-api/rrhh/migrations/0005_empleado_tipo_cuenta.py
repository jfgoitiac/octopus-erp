from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rrhh', '0004_add_banconimina_and_optional_sueldo'),
    ]

    operations = [
        migrations.AddField(
            model_name='empleado',
            name='tipo_cuenta',
            field=models.CharField(
                blank=True,
                choices=[('CTE', 'Corriente'), ('AHO', 'Ahorro')],
                default='',
                max_length=3,
            ),
        ),
    ]
