from django.db import migrations


def crear_categorias_iniciales(apps, schema_editor):
    CategoriaGasto = apps.get_model('finanzas', 'CategoriaGasto')
    arbol = {
        'Servicios básicos': ['Electricidad', 'Agua', 'Internet'],
        'Mantenimiento': ['Plomería', 'Electricidad', 'Reparaciones'],
        'Material didáctico': [],
        'Limpieza': [],
        'Nómina y honorarios': [],
        'Impuestos y tasas': [],
        'Tecnología': [],
        'Alimentación': [],
        'Otros': [],
    }
    for orden, (nombre, hijas) in enumerate(arbol.items(), start=1):
        padre, _ = CategoriaGasto.objects.get_or_create(nombre=nombre, padre=None, defaults={'orden': orden})
        for orden_hija, hija in enumerate(hijas, start=1):
            CategoriaGasto.objects.get_or_create(nombre=hija, padre=padre, defaults={'orden': orden_hija})


def revertir_categorias_iniciales(apps, schema_editor):
    # No se eliminan categorías: pueden haber sido usadas por datos posteriores.
    pass


class Migration(migrations.Migration):
    dependencies = [('finanzas', '0001_initial')]
    operations = [migrations.RunPython(crear_categorias_iniciales, revertir_categorias_iniciales)]
