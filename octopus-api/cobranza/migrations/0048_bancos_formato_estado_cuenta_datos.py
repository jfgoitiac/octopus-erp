import unicodedata

from django.db import migrations

# (clave normalizada contenida en el nombre) -> (formato, color)
FORMATOS = (
    ('bancaribe', 'bancaribe', '#005baa'),
    ('banesco', 'banesco', '#c8102e'),
    ('tesoro', 'tesoro', '#1a3a5c'),
)

BDT_NOMBRE = 'Banco Digital de los Trabajadores'
BDT_COLOR = '#0b6e4f'


def _norm(texto):
    sin_tildes = unicodedata.normalize('NFD', texto or '')
    sin_tildes = ''.join(c for c in sin_tildes if unicodedata.category(c) != 'Mn')
    return sin_tildes.lower().strip()


def asignar_formatos(apps, schema_editor):
    Banco = apps.get_model('cobranza', 'BancoInstitucional')
    for banco in Banco.objects.all():
        nombre = _norm(banco.nombre)
        for clave, formato, color in FORMATOS:
            if clave in nombre:
                banco.formato_estado_cuenta = formato
                if not banco.color:
                    banco.color = color
                banco.save(update_fields=['formato_estado_cuenta', 'color'])
                break
        else:
            if 'digital de los trabajadores' in nombre or nombre == 'bdt':
                banco.formato_estado_cuenta = 'bdt'
                if not banco.color:
                    banco.color = BDT_COLOR
                banco.save(update_fields=['formato_estado_cuenta', 'color'])

    # El BDT nace inactivo para caja/portal (activo=False) y disponible solo
    # en el conciliador (activo_conciliador=True) hasta que el admin lo active.
    if not any(_norm(b.nombre) == _norm(BDT_NOMBRE) for b in Banco.objects.all()):
        Banco.objects.create(
            nombre=BDT_NOMBRE,
            activo=False,
            activo_conciliador=True,
            formato_estado_cuenta='bdt',
            color=BDT_COLOR,
            tipos=['transferencia', 'pago_movil'],
        )


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0047_bancoinstitucional_formato_estado_cuenta'),
    ]

    operations = [
        migrations.RunPython(asignar_formatos, migrations.RunPython.noop),
    ]
