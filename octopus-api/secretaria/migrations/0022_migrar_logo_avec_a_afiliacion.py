from django.db import migrations


def seed_afiliacion_nombre(apps, schema_editor):
    """
    Hasta ahora todos los colegios en producción están afiliados a AVEC.
    El texto fijo "AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA"
    de los recibos pasa a salir de `afiliacion_nombre` (vacío por defecto), así
    que sin este seed esos colegios perderían esa línea en el despliegue de
    este cambio. Se usa `logo_avec` (a punto de eliminarse en la migración
    siguiente) como señal de "este colegio está afiliado a AVEC".
    """
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.exclude(logo_avec='').update(
        afiliacion_nombre='LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA'
    )


def revertir(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.filter(
        afiliacion_nombre='LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA'
    ).update(afiliacion_nombre='')


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0021_configuracionsistema_afiliacion_y_encabezado'),
    ]

    operations = [
        migrations.RunPython(seed_afiliacion_nombre, revertir),
    ]
