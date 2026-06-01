from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('secretaria', '0007_alumno_sede')]

    operations = [
        migrations.AddField(
            model_name='configuracionsistema',
            name='color_primario',
            field=models.CharField(default='#0fa3b1', max_length=7, help_text='Color hex, ej: #0fa3b1'),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='color_secundario',
            field=models.CharField(default='#1f3864', max_length=7, help_text='Color hex secundario'),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='logo_url',
            field=models.URLField(blank=True, default='', help_text='URL del logo del colegio (externo)'),
        ),
    ]
