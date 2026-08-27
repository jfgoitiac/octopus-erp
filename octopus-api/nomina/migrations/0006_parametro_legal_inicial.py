from decimal import Decimal
from datetime import date
from django.db import migrations


def crear_parametro_inicial(apps, schema_editor):
    ParametroLegalNomina = apps.get_model('nomina', 'ParametroLegalNomina')
    ParametroLegalNomina.objects.get_or_create(
        vigente_desde=date(1970, 1, 1),
        defaults={
            'porcentaje_sso': Decimal('0.04'),
            'porcentaje_lph': Decimal('0.01'),
            'descripcion': 'Parámetro inicial; ajustar según normativa vigente.',
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ('nomina', '0005_alter_registronomina_porcentaje_lph_aplicado_and_more'),
    ]

    operations = [
        migrations.RunPython(crear_parametro_inicial, migrations.RunPython.noop),
    ]
