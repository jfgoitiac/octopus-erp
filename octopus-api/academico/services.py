"""
Cálculo de rendimiento académico (Fase 4 — Seguimiento Gráfico).
Solo lectura sobre Nota/Asistencia ya existentes; sin modelos nuevos salvo
AlertaRendimiento. Umbral aprobatorio fijo en 10 (escala 0-20), el mismo
criterio que ya usa Nota.aprobado.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from secretaria.models import Alumno

from .models import (
    AlertaRendimiento,
    Asistencia,
    ItemEvaluacion,
    Lapso,
    Materia,
    Nota,
    NotaItemEvaluacion,
    PlanEvaluacion,
)

UMBRAL_APROBATORIO = Decimal('10')


def _periodo_escolar_activo():
    """Alias de compatibilidad: la lógica real vive en `common.periodo.periodo_escolar_activo`
    (helper neutral, sin depender de `secretaria` ni `academico`, para evitar un ciclo de
    imports entre ambos apps). Se conserva este nombre porque otros módulos de `academico`
    lo importan así — mismo comportamiento, sin duplicar la lógica."""
    from common.periodo import periodo_escolar_activo
    return periodo_escolar_activo()


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


def calcular_alertas_riesgo_docente(user):
    """AlertaRendimiento activas de las materias del docente — el modelo y el
    cron que lo calcula (tasks.py::generar_alertas_rendimiento) ya existen,
    esto solo lo expone filtrado por docente para el hero del dashboard."""
    alertas = AlertaRendimiento.objects.filter(
        activa=True, materia__docente=user
    ).select_related('alumno', 'materia', 'lapso').order_by('-created_at')
    return [{
        'id': a.id,
        'alumno_id': a.alumno_id,
        'alumno_nombre': f"{a.alumno.nombre} {a.alumno.apellido}",
        'materia_id': a.materia_id,
        'materia_nombre': a.materia.nombre if a.materia else None,
        'grado_seccion': a.materia.grado_seccion if a.materia else None,
        'lapso_id': a.lapso_id,
        'lapso_nombre': a.lapso.nombre,
        'promedio_actual': float(a.promedio_actual),
        'umbral_minimo': float(a.umbral_minimo),
    } for a in alertas]


def calcular_radar_cierre_lapso(user, dias_anticipacion=5):
    """Qué falta para cerrar el lapso: materias sin plan de evaluación creado,
    e ítems ya vencidos o por vencer que todavía tienen alumnos sin nota
    cargada. Alimenta el widget "radar" del dashboard del docente para que no
    dependa de que el docente recuerde revisar cada materia manualmente."""
    periodo = _periodo_escolar_activo()
    lapso = (
        Lapso.objects.filter(periodo_escolar=periodo, activo=True).first()
        or Lapso.objects.filter(periodo_escolar=periodo).order_by('-nombre').first()
    )
    if lapso is None:
        return {
            'lapso': None,
            'dias_para_cierre': None,
            'materias_sin_plan': [],
            'items_vencidos': [],
            'items_por_vencer': [],
        }

    hoy = timezone.localdate()
    materias = list(Materia.objects.filter(docente=user, activa=True))

    planes = PlanEvaluacion.objects.filter(materia__in=materias, lapso=lapso)
    materias_con_plan = {p.materia_id for p in planes}
    materias_sin_plan = [{
        'materia_id': m.id,
        'materia_nombre': m.nombre,
        'grado_seccion': m.grado_seccion,
    } for m in materias if m.id not in materias_con_plan]

    # Cantidad de alumnos por grado_seccion, precalculada una vez (evita 1
    # query por ítem al contar pendientes).
    alumnos_por_seccion = {}
    for m in materias:
        if m.grado_seccion not in alumnos_por_seccion:
            alumnos_por_seccion[m.grado_seccion] = set(
                Alumno.objects.filter(grado_seccion__iexact=m.grado_seccion).values_list('id', flat=True)
            )

    items = (
        ItemEvaluacion.objects
        .filter(bloque__plan__in=planes, fecha__isnull=False)
        .select_related('bloque', 'bloque__plan__materia')
        .prefetch_related('notas')
    )

    items_vencidos = []
    items_por_vencer = []
    limite_anticipacion = hoy + timedelta(days=dias_anticipacion)

    for item in items:
        if item.fecha > limite_anticipacion:
            continue
        materia = item.bloque.plan.materia
        alumnos_seccion = alumnos_por_seccion.get(materia.grado_seccion, set())
        if not alumnos_seccion:
            continue
        alumnos_con_nota = {n.alumno_id for n in item.notas.all()}
        pendientes = len(alumnos_seccion - alumnos_con_nota)
        if pendientes == 0:
            continue

        entrada = {
            'item_id': item.id,
            'nombre': item.nombre,
            'fecha': item.fecha,
            'materia_id': materia.id,
            'materia_nombre': materia.nombre,
            'bloque_id': item.bloque_id,
            'bloque_nombre': item.bloque.nombre,
            'alumnos_pendientes': pendientes,
        }
        if item.fecha < hoy:
            items_vencidos.append(entrada)
        else:
            items_por_vencer.append(entrada)

    items_vencidos.sort(key=lambda e: e['fecha'])
    items_por_vencer.sort(key=lambda e: e['fecha'])

    return {
        'lapso': lapso.nombre,
        'dias_para_cierre': (lapso.fecha_fin - hoy).days,
        'materias_sin_plan': materias_sin_plan,
        'items_vencidos': items_vencidos,
        'items_por_vencer': items_por_vencer,
    }


def calcular_comparacion_materia(materia, lapso):
    """Compara el % de aprobados de la sección de `materia` contra el promedio
    de otras Materia con el mismo nombre (mismo lapso) — es decir, otras
    secciones que dictan la misma asignatura. No se compara contra "el grado"
    porque grado_seccion es un string libre (ej. "5to Grado") sin estructura
    grado+sección separable de forma confiable."""
    rendimiento_propio = calcular_rendimiento_seccion(materia.grado_seccion, lapso)
    porcentaje_propio = None
    for entrada in rendimiento_propio['por_materia']:
        if entrada['materia_id'] == materia.id:
            porcentaje_propio = entrada['porcentaje_aprobados']
            break

    otras_materias = list(Materia.objects.filter(nombre=materia.nombre, activa=True).exclude(
        grado_seccion=materia.grado_seccion
    ))

    porcentajes_otras = []
    for otra in otras_materias:
        notas = Nota.objects.filter(materia=otra, lapso=lapso, definitiva__isnull=False)
        total = notas.count()
        if not total:
            continue
        aprobados = notas.filter(definitiva__gte=UMBRAL_APROBATORIO).count()
        porcentajes_otras.append(aprobados / total * 100)

    porcentaje_otras_secciones = (
        round(sum(porcentajes_otras) / len(porcentajes_otras), 1) if porcentajes_otras else None
    )

    return {
        'materia_id': materia.id,
        'materia_nombre': materia.nombre,
        'grado_seccion': materia.grado_seccion,
        'porcentaje_propio': porcentaje_propio,
        'porcentaje_otras_secciones': porcentaje_otras_secciones,
        'otras_secciones_count': len(otras_materias),
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


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN (sistema nuevo, opcional por materia+lapso)
# ─────────────────────────────────────────────
def _valor_bloque_numerico(bloque, alumno_id, notas_map):
    """
    Total de un bloque numérico para un alumno.
      - modo 'puntos'  : suma de valor_numerico de sus items. Si no hay
        ninguna nota cargada todavía, la suma natural es 0.
      - modo 'promedio': promedio de valor_numerico de sus items *con nota
        cargada* (los items sin nota NO cuentan como 0 en el promedio). Si
        ningún item tiene nota, retorna None (bloque aún sin evaluar).
    notas_map: dict {(item_id, alumno_id): NotaItemEvaluacion}
    """
    valores = []
    for item in bloque.items.all():
        nota = notas_map.get((item.id, alumno_id))
        if nota is not None and nota.valor_numerico is not None:
            valores.append(nota.valor_numerico)

    if bloque.modo == 'promedio':
        if not valores:
            return None
        return sum(valores) / len(valores)
    # modo 'puntos'
    return sum(valores) if valores else Decimal('0')


def _moda_letras(letras):
    """
    Letra más frecuente de una lista (moda). Desempate: la primera letra que
    alcanza el conteo máximo, en el orden en que aparece en `letras` — es un
    criterio arbitrario mientras no exista otro requisito de negocio; se
    documenta acá porque no hay regla explícita de desempate.
    Retorna None si la lista está vacía.
    """
    if not letras:
        return None
    conteo = {}
    for letra in letras:
        conteo[letra] = conteo.get(letra, 0) + 1
    maximo = max(conteo.values())
    for letra in letras:
        if conteo[letra] == maximo:
            return letra
    return None  # inalcanzable, letras no está vacía


def _valor_bloque_letra(bloque, alumno_id, notas_map):
    """Letra final de un bloque literal = moda de valor_letra de sus items
    con nota cargada (items sin nota se ignoran, no hay "letra vacía")."""
    letras = []
    for item in bloque.items.all():
        nota = notas_map.get((item.id, alumno_id))
        if nota is not None and nota.valor_letra:
            letras.append(nota.valor_letra)
    return _moda_letras(letras)


def _notas_items_bloque(bloque, alumno_id, notas_map):
    """
    Desglose por ítem de las notas ya cargadas de un alumno en un bloque.
    Necesario para que el frontend precargue la tabla editable con lo que el
    docente ya guardó antes (si solo se devolviera el total agregado del
    bloque, no habría forma de saber qué valor va en cada input de ítem).
    Los items sin nota cargada para ese alumno se omiten del array.
    """
    resultado = []
    for item in bloque.items.all():
        nota = notas_map.get((item.id, alumno_id))
        if nota is None:
            continue
        resultado.append({
            'item_id': item.id,
            'valor_numerico': nota.valor_numerico,
            'valor_letra': nota.valor_letra,
        })
    return resultado


def calcular_plan_notas(materia, lapso):
    """
    Calcula, para cada alumno del grado_seccion de `materia`, el desglose de
    bloques de su PlanEvaluacion en `lapso` y el total final de la materia.

    Retorna (plan, alumnos_data). Si no existe PlanEvaluacion para esa
    materia+lapso, retorna (None, []) — el caller (vista) decide qué
    responder (404, ver PlanEvaluacionNotasView.get).

    Regla de "aporta_a_todas_las_materias" (alias "Puntos EREC"): el total de
    la materia (solo si es numérica) se completa sumando los bloques de
    CUALQUIER otra materia del mismo grado_seccion + mismo lapso que tenga
    ese flag activo y también sea numérica. Las materias literales nunca
    participan de este mecanismo de suma (no tiene sentido sumar letras) —
    limitación conocida y documentada, no se resuelve acá.
    """
    plan = PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).prefetch_related(
        'bloques__items'
    ).first()
    if plan is None:
        return None, []

    bloques = list(plan.bloques.all())
    item_ids = [item.id for bloque in bloques for item in bloque.items.all()]
    notas_map = {
        (n.item_id, n.alumno_id): n
        for n in NotaItemEvaluacion.objects.filter(item_id__in=item_ids)
    } if item_ids else {}

    alumnos = Alumno.objects.filter(grado_seccion=materia.grado_seccion).order_by('apellido', 'nombre')

    # Materias que aportan sus bloques a esta (mismo grado_seccion + lapso,
    # flag activo, numéricas). Solo aplica si `materia` también es numérica.
    materias_aporte = []
    aporte_bloques = {}
    aporte_notas_map = {}
    if materia.tipo_evaluacion == 'numerica':
        materias_aporte = list(Materia.objects.filter(
            grado_seccion=materia.grado_seccion,
            aporta_a_todas_las_materias=True,
            tipo_evaluacion='numerica',
        ).exclude(pk=materia.pk))

        for m in materias_aporte:
            plan_aporte = PlanEvaluacion.objects.filter(materia=m, lapso=lapso).prefetch_related(
                'bloques__items'
            ).first()
            aporte_bloques[m.id] = list(plan_aporte.bloques.all()) if plan_aporte else []

        aporte_item_ids = [
            item.id for bs in aporte_bloques.values() for b in bs for item in b.items.all()
        ]
        if aporte_item_ids:
            aporte_notas_map = {
                (n.item_id, n.alumno_id): n
                for n in NotaItemEvaluacion.objects.filter(item_id__in=aporte_item_ids)
            }

    resultado = []
    for alumno in alumnos:
        if materia.tipo_evaluacion == 'literal':
            bloques_data = []
            letras_bloques = []
            for b in bloques:
                letra = _valor_bloque_letra(b, alumno.id, notas_map)
                bloques_data.append({
                    'bloque_id': b.id,
                    'nombre': b.nombre,
                    'modo': b.modo,
                    'valor_letra': letra,
                    'notas_items': _notas_items_bloque(b, alumno.id, notas_map),
                })
                if letra:
                    letras_bloques.append(letra)

            resultado.append({
                'alumno_id': alumno.id,
                'alumno_nombre': f"{alumno.nombre} {alumno.apellido}",
                'bloques': bloques_data,
                'aporte_otras_materias': [],
                'total': None,
                'total_letra': _moda_letras(letras_bloques),
            })
            continue

        # Materia numérica
        bloques_data = []
        total = Decimal('0')
        tiene_algun_valor = False
        for b in bloques:
            valor = _valor_bloque_numerico(b, alumno.id, notas_map)
            bloques_data.append({
                'bloque_id': b.id,
                'nombre': b.nombre,
                'modo': b.modo,
                'total_puntos': float(b.total_puntos) if b.total_puntos is not None else None,
                'valor': float(valor) if valor is not None else None,
                'notas_items': _notas_items_bloque(b, alumno.id, notas_map),
            })
            if valor is not None:
                total += valor
                tiene_algun_valor = True

        aporte_detalle = []
        for m in materias_aporte:
            for b in aporte_bloques.get(m.id, []):
                valor = _valor_bloque_numerico(b, alumno.id, aporte_notas_map)
                aporte_detalle.append({
                    'materia_id': m.id,
                    'materia_nombre': m.nombre,
                    'bloque_id': b.id,
                    'bloque_nombre': b.nombre,
                    'valor': float(valor) if valor is not None else None,
                })
                if valor is not None:
                    total += valor
                    tiene_algun_valor = True

        resultado.append({
            'alumno_id': alumno.id,
            'alumno_nombre': f"{alumno.nombre} {alumno.apellido}",
            'bloques': bloques_data,
            'aporte_otras_materias': aporte_detalle,
            'total': float(total) if tiene_algun_valor else None,
            'total_letra': None,
        })

    return plan, resultado
