from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0054_meta_banco'),
    ]

    operations = [
        migrations.AddField(
            model_name='metabanco',
            name='periodicidad',
            field=models.CharField(choices=[('mensual', 'Mensual'), ('trimestral', 'Trimestral'), ('personalizado', 'Personalizado')], default='personalizado', max_length=15),
        ),
    ]
