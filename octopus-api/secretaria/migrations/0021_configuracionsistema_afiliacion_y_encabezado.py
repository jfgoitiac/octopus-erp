from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0020_configuracionsistema_adelantos_requieren_usd'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracionsistema',
            name='afiliacion_nombre',
            field=models.CharField(blank=True, default='', help_text='Texto que se muestra como "AFILIADO A {valor}" en recibos (ej. "AVEC" o "LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA"). Vacío si el colegio no está afiliado a nada.', max_length=150),
        ),
        migrations.AddField(
            model_name='configuracionsistema',
            name='encabezado_personalizado',
            field=models.ImageField(blank=True, help_text='Banner PNG (2200x410px, fondo transparente opcional) que reemplaza el bloque logo+texto en recibos y boletines. Si está vacío, se usa el encabezado estructurado por defecto.', null=True, upload_to='configuracion/logos/'),
        ),
        migrations.AlterField(
            model_name='configuracionsistema',
            name='logo_colegio',
            field=models.ImageField(blank=True, help_text='Logo del colegio. Se usa para recibos, favicon/ícono de la app, páginas de login y el logo lateral junto al nombre del colegio.', null=True, upload_to='configuracion/logos/'),
        ),
        migrations.AlterField(
            model_name='configuracionsistema',
            name='favicon_url',
            field=models.URLField(blank=True, default='', help_text='URL de un ícono externo distinto al logo del colegio (opcional). Si está vacío, se usa logo_colegio.'),
        ),
        migrations.RemoveField(
            model_name='configuracionsistema',
            name='favicon',
        ),
    ]
