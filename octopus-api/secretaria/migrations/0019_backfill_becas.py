"""
Backfill de Beca a partir de los campos ya existentes Alumno.porcentaje_beca /
Alumno.estatus_financiero='becado'. No los borra (siguen siendo la caché
derivada que consume el resto del código, ver secretaria/models.py::Beca) —
esta migración solo crea el registro auditable equivalente para que, de aquí
en adelante, Beca sea la fuente de verdad.

Un alumno backfileado queda con:
  - porcentaje = Alumno.porcentaje_beca si es > 0, si no 100 (caso
    estatus_financiero='becado' con porcentaje_beca en 0, el bug #3 del
    pedido original).
  - vigencia = año escolar activo de ConfiguracionSistema (o, si no hay
    configuración todavía, un año calendario desde hoy — solo relevante en
    entornos de desarrollo/test que corren migraciones desde cero).
  - otorgada_por = None, motivo = "Backfill migración inicial".

Idempotente: usa get_or_create sobre (alumno, periodo_escolar, estado=activa),
que ya está protegido por el UniqueConstraint del modelo.
"""
from datetime import date, timedelta

from django.db import migrations


def crear_becas_backfill(apps, schema_editor):
    from django.db.models import Q

    Alumno = apps.get_model('secretaria', 'Alumno')
    Beca = apps.get_model('secretaria', 'Beca')
    ConfiguracionSistema = apps.get_model('secretaria', 'ConfiguracionSistema')

    config = ConfiguracionSistema.objects.order_by('id').first()
    if config and config.periodo_escolar_activo and config.fecha_inicio_ano_escolar and config.fecha_fin_ano_escolar:
        periodo = config.periodo_escolar_activo
        fecha_desde = config.fecha_inicio_ano_escolar
        fecha_hasta = config.fecha_fin_ano_escolar
    else:
        hoy = date.today()
        periodo = '2025-2026'
        fecha_desde = hoy
        fecha_hasta = hoy + timedelta(days=365)

    candidatos = Alumno.objects.filter(
        Q(porcentaje_beca__gt=0) | Q(estatus_financiero='becado')
    )

    for alumno in candidatos.iterator():
        porcentaje = alumno.porcentaje_beca if alumno.porcentaje_beca and alumno.porcentaje_beca > 0 else 100
        Beca.objects.get_or_create(
            alumno=alumno,
            periodo_escolar=periodo,
            estado='activa',
            defaults={
                'tipo': 'otra',
                'porcentaje': porcentaje,
                'fecha_desde': fecha_desde,
                'fecha_hasta': fecha_hasta,
                'motivo': 'Backfill migración inicial',
                'otorgada_por': None,
            },
        )


def noop_reverse(apps, schema_editor):
    """No se revierte: borrar las becas backfileadas perdería la auditoría
    de qué alumnos estaban becados antes de este cambio."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0018_beca'),
    ]

    operations = [
        migrations.RunPython(crear_becas_backfill, noop_reverse),
    ]
