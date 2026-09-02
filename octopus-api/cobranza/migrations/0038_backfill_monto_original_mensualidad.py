"""
Backfill de Mensualidad.monto_original_usd para filas creadas antes de este
campo. No hay forma de reconstruir con certeza si esas filas ya traían un
descuento de beca aplicado (el código anterior aplicaba el % de
Alumno.porcentaje_beca sin dejar rastro de cuál era el monto base) — se
asume monto_original_usd = monto_usd para no inventar un valor, y se anota
en NOTAS_TECNICAS.md como límite conocido del reporte de costo de becas
para el histórico previo a este cambio. porcentaje_beca_aplicado queda en
su default (0) por el mismo motivo.
"""
from django.db import migrations
from django.db.models import F


def backfill_monto_original(apps, schema_editor):
    Mensualidad = apps.get_model('cobranza', 'Mensualidad')
    Mensualidad.objects.filter(monto_original_usd__isnull=True).update(
        monto_original_usd=F('monto_usd')
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0037_mensualidad_beca_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_monto_original, noop_reverse),
    ]
