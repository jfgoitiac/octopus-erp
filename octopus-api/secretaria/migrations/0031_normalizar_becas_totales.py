"""Convierte al esquema único de beca total los datos que seguían en la vía
heredada de Alumno.porcentaje_beca.

La operación es deliberadamente conservadora: solo toca el período escolar
activo y únicamente mensualidades impagas de ese período. Las cuotas ya
pagadas y la deuda de años anteriores se preservan intactas.
"""
from django.db import migrations
from django.db.models import Q


def normalizar_becas_totales(apps, schema_editor):
    Alumno = apps.get_model('secretaria', 'Alumno')
    Beca = apps.get_model('secretaria', 'Beca')
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')
    Mensualidad = apps.get_model('cobranza', 'Mensualidad')

    config = ConfiguracionSistema.objects.order_by('id').first()
    if not config or not config.periodo_escolar_activo:
        return

    inicio = (config.fecha_inicio_ano_escolar.year, config.fecha_inicio_ano_escolar.month)
    fin = (config.fecha_fin_ano_escolar.year, config.fecha_fin_ano_escolar.month)

    # Incluye becas creadas correctamente y alumnos que recibieron el 100%
    # mediante el campo heredado después del backfill inicial.
    alumno_ids = set(
        Beca.objects.filter(estado='activa', periodo_escolar=config.periodo_escolar_activo)
        .values_list('alumno_id', flat=True)
    )
    alumno_ids.update(
        Alumno.objects.filter(Q(porcentaje_beca__gt=0) | Q(estatus_financiero='becado'))
        .values_list('id', flat=True)
    )

    for alumno_id in alumno_ids:
        beca, _ = Beca.objects.get_or_create(
            alumno_id=alumno_id,
            periodo_escolar=config.periodo_escolar_activo,
            estado='activa',
            defaults={
                'tipo': 'otra',
                'porcentaje': 100,
                'fecha_desde': config.fecha_inicio_ano_escolar,
                'fecha_hasta': config.fecha_fin_ano_escolar,
                'motivo': 'Normalización a beca total',
            },
        )
        if not _:
            Beca.objects.filter(pk=beca.pk).update(
                tipo='otra', porcentaje=100,
                fecha_desde=config.fecha_inicio_ano_escolar,
                fecha_hasta=config.fecha_fin_ano_escolar,
            )

        Alumno.objects.filter(pk=alumno_id).update(
            porcentaje_beca=100, estatus_financiero='becado'
        )
        impagas = Mensualidad.objects.filter(alumno_id=alumno_id, pagado=False)
        ids = [
            mensualidad.pk for mensualidad in impagas.iterator()
            if inicio <= (mensualidad.anio, mensualidad.mes) <= fin
        ]
        if ids:
            Mensualidad.objects.filter(pk__in=ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0030_alter_configuracionsistema_abonos_parciales_requieren_usd'),
        ('cobranza', '0046_bancoinstitucional_portal_metodos'),
    ]

    operations = [
        migrations.RunPython(normalizar_becas_totales, migrations.RunPython.noop),
    ]
