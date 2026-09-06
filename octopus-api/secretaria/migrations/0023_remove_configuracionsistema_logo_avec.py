from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0022_migrar_logo_avec_a_afiliacion'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='configuracionsistema',
            name='logo_avec',
        ),
    ]
