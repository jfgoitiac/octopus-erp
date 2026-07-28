"""
Cálculo de rendimiento académico (Fase 4 — Seguimiento Gráfico).
Solo lectura sobre Nota/Asistencia ya existentes; sin modelos nuevos salvo
AlertaRendimiento. Umbral aprobatorio fijo en 10 (escala 0-20), el mismo
criterio que ya usa Nota.aprobado.
"""
from decimal import Decimal

from secretaria.models import ConfiguracionSistema

from .models import Asistencia, Lapso, Materia, Nota

UMBRAL_APROBATORIO = Decimal('10')


def _periodo_escolar_activo():
    """Determina el período escolar a mostrar: la configuración del sistema
    si existe, o el período más reciente con notas cargadas, o el default
    del modelo Lapso como último recurso."""
    config = ConfiguracionSistema.objects.first()
    if config and config.periodo_escolar_activo:
        return config.periodo_escolar_activo

    ultima_nota = Nota.objects.select_related('lapso').order_by('-lapso__periodo_escolar').first()
    if ultima_nota:
        return ultima_nota.lapso.periodo_escolar

    return '2025-2026'


def calcular_rendimiento_alumno(alumno):
    """Promedios por lapso y por materia + asistencia global + bandera de
    riesgo. Devuelve la estructura completa aunque falten notas de algún
    lapso (arrays vacíos, no error)."""
    periodo = _periodo_escolar_activo()
    lapsos = Lapso.objects.filter(periodo_escolar=periodo).order_by('nombre')

    por_lapso = []
    en_riesgo = False
    for lapso in lapsos:
        notas = Nota.objects.filter(alumno=alumno, lapso=lapso).select_related('materia')
        por_materia = []
        definitivas = []
        for nota in notas:
            if nota.definitiva is not None:
                definitivas.append(nota.definitiva)
                if nota.definitiva < UMBRAL_APROBATORIO:
                    en_riesgo = True
            por_materia.append({
                'materia_id': nota.materia_id,
                'materia': nota.materia.nombre,
                'promedio': float(nota.definitiva) if nota.definitiva is not None else None,
            })
        promedio_general = float(sum(definitivas) / len(definitivas)) if definitivas else None
        por_lapso.append({
            'lapso_id': lapso.id,
            'lapso': lapso.nombre,
            'promedio_general': promedio_general,
            'por_materia': por_materia,
        })

    asistencia_qs = Asistencia.objects.filter(alumno=alumno)
    total_clases = asistencia_qs.count()
    presentes = asistencia_qs.filter(presente=True).count()
    porcentaje = round(presentes / total_clases * 100, 1) if total_clases else None

    return {
        'alumno': {'id': alumno.id, 'nombre': alumno.nombre, 'apellido': alumno.apellido},
        'por_lapso': por_lapso,
        'asistencia': {
            'total_clases': total_clases,
            'presentes': presentes,
            'porcentaje': porcentaje,
        },
        'en_riesgo': en_riesgo,
    }


def calcular_rendimiento_seccion(grado_seccion, lapso=None):
    """% de aprobados por materia de una sección, para el mapa de calor del
    director. Si no se especifica lapso, usa el lapso activo del período
    vigente (o el más reciente si ninguno está marcado activo)."""
    periodo = _periodo_escolar_activo()
    if lapso is None:
        lapso = (
            Lapso.objects.filter(periodo_escolar=periodo, activo=True).first()
            or Lapso.objects.filter(periodo_escolar=periodo).order_by('-nombre').first()
        )

    materias = Materia.objects.filter(grado_seccion=grado_seccion, activa=True).order_by('nombre')
    por_materia = []
    for materia in materias:
        notas = Nota.objects.filter(materia=materia, definitiva__isnull=False)
        if lapso is not None:
            notas = notas.filter(lapso=lapso)
        total = notas.count()
        aprobados = notas.filter(definitiva__gte=UMBRAL_APROBATORIO).count()
        por_materia.append({
            'materia_id': materia.id,
            'materia': materia.nombre,
            'porcentaje_aprobados': round(aprobados / total * 100, 1) if total else None,
            'total_evaluados': total,
        })

    return {
        'grado_seccion': grado_seccion,
        'lapso': lapso.nombre if lapso else None,
        'por_materia': por_materia,
    }


def generar_alertas_rendimiento():
    """Crea/actualiza AlertaRendimiento por cada (alumno, materia, lapso) del
    período vigente cuya nota definitiva esté bajo el umbral, y resuelve las
    que dejaron de estar en riesgo. Se ejecuta desde el cron diario de Celery."""
    from django.utils import timezone

    from .models import AlertaRendimiento

    periodo = _periodo_escolar_activo()
    lapsos = Lapso.objects.filter(periodo_escolar=periodo)
    notas = Nota.objects.filter(lapso__in=lapsos, definitiva__isnull=False).select_related(
        'alumno', 'materia', 'lapso'
    )

    for nota in notas:
        en_riesgo = nota.definitiva < UMBRAL_APROBATORIO
        alerta = AlertaRendimiento.objects.filter(
            alumno=nota.alumno, materia=nota.materia, lapso=nota.lapso
        ).first()

        if en_riesgo:
            if alerta:
                alerta.promedio_actual = nota.definitiva
                if not alerta.activa:
                    alerta.activa = True
                    alerta.resuelta_at = None
                alerta.save(update_fields=['promedio_actual', 'activa', 'resuelta_at'])
            else:
                AlertaRendimiento.objects.create(
                    alumno=nota.alumno,
                    materia=nota.materia,
                    lapso=nota.lapso,
                    promedio_actual=nota.definitiva,
                    umbral_minimo=UMBRAL_APROBATORIO,
                    activa=True,
                )
        elif alerta and alerta.activa:
            alerta.activa = False
            alerta.resuelta_at = timezone.now()
            alerta.save(update_fields=['activa', 'resuelta_at'])
