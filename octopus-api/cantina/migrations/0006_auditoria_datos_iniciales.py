"""
Datos iniciales de la Auditoría de Cantina:

1. D3 — Reclasifica como 'merma' los ajustes negativos cuyo motivo menciona
   merma (antes la merma se registraba como ajuste con cantidad negativa).
   La merma guarda cantidad positiva; stock_antes/stock_despues no cambian.
2. Crea la RevisionCierre 'pendiente' de cada cierre existente (los nuevos
   la reciben por signal).
"""
from django.db import migrations


def forward(apps, schema_editor):
    MovimientoInventario = apps.get_model('cantina', 'MovimientoInventario')
    CierreCajaCantina = apps.get_model('cantina', 'CierreCajaCantina')
    RevisionCierre = apps.get_model('cantina', 'RevisionCierre')

    for mov in MovimientoInventario.objects.filter(
        tipo='ajuste', cantidad__lt=0, motivo__icontains='merma',
    ):
        mov.tipo = 'merma'
        mov.cantidad = abs(mov.cantidad)
        mov.save(update_fields=['tipo', 'cantidad'])

    existentes = set(RevisionCierre.objects.values_list('cierre_id', flat=True))
    RevisionCierre.objects.bulk_create([
        RevisionCierre(cierre_id=cierre_id, estado='pendiente')
        for cierre_id in CierreCajaCantina.objects.values_list('id', flat=True)
        if cierre_id not in existentes
    ])


def backward(apps, schema_editor):
    MovimientoInventario = apps.get_model('cantina', 'MovimientoInventario')
    for mov in MovimientoInventario.objects.filter(tipo='merma'):
        mov.tipo = 'ajuste'
        mov.cantidad = -abs(mov.cantidad)
        mov.save(update_fields=['tipo', 'cantidad'])
    # Las revisiones se eliminan con la tabla al revertir 0005.


class Migration(migrations.Migration):
    dependencies = [('cantina', '0005_auditoria_cantina')]
    operations = [migrations.RunPython(forward, backward)]
