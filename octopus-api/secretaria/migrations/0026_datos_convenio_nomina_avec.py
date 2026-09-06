# Fase B — Parametrización multi-colegio (ver NOTAS_TECNICAS.md).
# Los colegios ya en producción son todos afiliados a AVEC; el campo nuevo
# convenio_nomina default='generico' no debe cambiarles el comportamiento.
#
# Seguridad de esta migración: solo escribe en ConfiguracionSistema. El signal
# post_save que recalcula RegistroNomina (nomina/models.py:170) está registrado
# sobre nomina.Empleado, no sobre ConfiguracionSistema — esta migración no lo
# dispara, por lo que no hay riesgo de recálculo retroactivo sobre recibos ya
# emitidos.
from django.db import migrations


def fijar_avec_ve(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.update(convenio_nomina='avec_ve')


def revertir_a_generico(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.update(convenio_nomina='generico')


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0025_configuracionsistema_convenio_nomina'),
    ]

    operations = [
        migrations.RunPython(fijar_avec_ve, revertir_a_generico),
    ]
