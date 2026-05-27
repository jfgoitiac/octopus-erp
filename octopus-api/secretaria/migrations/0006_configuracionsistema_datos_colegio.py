from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0005_normalizar_grados_seccion_unica'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracionsistema',
            name='nombre_colegio',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='rif',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='direccion_colegio',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='telefono_colegio',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='correo_colegio',
            field=models.EmailField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='municipio',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='estado_colegio',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
