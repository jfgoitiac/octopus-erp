from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rrhh', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='TipoCargo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100, unique=True)),
                ('descripcion', models.CharField(blank=True, default='', max_length=255)),
                ('activo', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'Tipo de Cargo',
                'verbose_name_plural': 'Tipos de Cargo',
                'ordering': ['nombre'],
            },
        ),
    ]
