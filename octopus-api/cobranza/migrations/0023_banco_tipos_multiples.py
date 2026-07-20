from django.db import migrations, models


def tipo_a_tipos(apps, schema_editor):
    BancoInstitucional = apps.get_model('cobranza', 'BancoInstitucional')
    metodos_reales = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle']
    for banco in BancoInstitucional.objects.all():
        if banco.tipo == 'general':
            banco.tipos = metodos_reales
        elif banco.tipo:
            banco.tipos = [banco.tipo]
        else:
            banco.tipos = []
        banco.save(update_fields=['tipos'])


def tipos_a_tipo(apps, schema_editor):
    BancoInstitucional = apps.get_model('cobranza', 'BancoInstitucional')
    for banco in BancoInstitucional.objects.all():
        banco.tipo = banco.tipos[0] if banco.tipos else 'general'
        banco.save(update_fields=['tipo'])


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0022_solvenciarepresentante'),
    ]

    operations = [
        migrations.AddField(
            model_name='bancoinstitucional',
            name='tipos',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(tipo_a_tipos, tipos_a_tipo),
        migrations.RemoveField(
            model_name='bancoinstitucional',
            name='tipo',
        ),
    ]
