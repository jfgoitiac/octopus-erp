"""Servicio canónico de calificaciones.

Ningún consumidor debe decidir por su cuenta si gana ``Nota`` o un plan.
Este módulo resuelve la autoridad persistida y expone un contrato uniforme,
manteniendo los valores parciales separados de una definitiva cerrada.
"""

from collections import Counter
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Prefetch

from .models import (
    ConfiguracionCalificacion,
    Nota,
    NotaItemEvaluacion,
    PlanEvaluacion,
)


ESCALA_MAXIMA = Decimal('20')
UMBRAL_APROBATORIO = Decimal('10')
ORDEN_LITERAL = {'A': 0, 'B': 1, 'C': 2}


def _decimal(valor):
    if valor is None:
        return None
    return Decimal(str(valor)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _moda_conservadora(valores):
    if not valores:
        return None
    conteos = Counter(valores)
    maximo = max(conteos.values())
    empatadas = [letra for letra, cantidad in conteos.items() if cantidad == maximo]
    return max(empatadas, key=lambda letra: ORDEN_LITERAL[letra])


def resolver_fuente(materia, lapso):
    """Retorna la configuración autoritativa, sin inferir por existencia.

    Un plan vacío o recién creado no desplaza notas legacy. La activación
    ocurre exclusivamente al persistir ``ConfiguracionCalificacion.motor``.
    """
    return ConfiguracionCalificacion.objects.filter(
        materia=materia, lapso=lapso,
    ).first()


def validar_configuracion(materia, lapso):
    inconsistencias = []
    config = resolver_fuente(materia, lapso)
    tiene_legacy = Nota.objects.filter(materia=materia, lapso=lapso).exists()
    plan = PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).prefetch_related(
        'bloques__items'
    ).first()
    tiene_plan = bool(plan and any(b.items.all() for b in plan.bloques.all()))

    if config is None or config.motor is None:
        inconsistencias.append('fuente_sin_resolver')
    if tiene_legacy and plan is not None:
        inconsistencias.append('coexistencia_legacy_plan')
    if config and config.motor == 'plan' and not tiene_plan:
        inconsistencias.append('plan_vacio')

    if plan and materia.tipo_evaluacion == 'numerica':
        presupuesto = Decimal('0')
        for bloque in plan.bloques.all():
            items = list(bloque.items.all())
            if bloque.total_puntos is None:
                inconsistencias.append(f'bloque_{bloque.id}_sin_peso')
                continue
            peso = Decimal(str(bloque.total_puntos))
            presupuesto += peso
            if bloque.modo == 'puntos':
                maximos = [i.valor_maximo for i in items]
                if any(v is None for v in maximos) or sum((v or Decimal('0')) for v in maximos) != peso:
                    inconsistencias.append(f'bloque_{bloque.id}_maximos_no_coinciden')
            elif any(i.valor_maximo is None or i.valor_maximo <= 0 for i in items):
                inconsistencias.append(f'bloque_{bloque.id}_maximos_requeridos')
        aportantes = materia.__class__.objects.filter(
            sede_id=materia.sede_id,
            grado_seccion=materia.grado_seccion,
            aporta_a_todas_las_materias=True,
            tipo_evaluacion='numerica',
            planes_evaluacion__lapso=lapso,
            configuraciones_calificacion__lapso=lapso,
            configuraciones_calificacion__motor='plan',
        ).exclude(pk=materia.pk).prefetch_related('planes_evaluacion__bloques')
        for aportante in aportantes:
            plan_aporte = next(
                (p for p in aportante.planes_evaluacion.all() if p.lapso_id == lapso.id),
                None,
            )
            if plan_aporte:
                presupuesto += sum(
                    (bloque.total_puntos or Decimal('0'))
                    for bloque in plan_aporte.bloques.all()
                )
        if presupuesto > ESCALA_MAXIMA:
            inconsistencias.append('presupuesto_supera_20')

    return inconsistencias


def validar_captura(item, alumno, *, valor_numerico=None, valor_letra=None):
    """Valida una captura sin depender del serializer o de la interfaz."""
    errores = []
    materia = item.bloque.plan.materia
    if (valor_numerico is None) == (valor_letra is None):
        errores.append('debe_informar_exactamente_un_valor')
    if materia.tipo_evaluacion == 'numerica':
        if valor_letra is not None:
            errores.append('materia_numerica_no_acepta_letra')
        if valor_numerico is not None:
            valor = Decimal(str(valor_numerico))
            if valor < 0:
                errores.append('valor_negativo')
            if item.valor_maximo is not None and valor > item.valor_maximo:
                errores.append('valor_supera_maximo')
    elif valor_numerico is not None:
        errores.append('materia_literal_no_acepta_numero')
    if valor_letra is not None and valor_letra not in ORDEN_LITERAL:
        errores.append('letra_invalida')
    if alumno.grado_seccion != materia.grado_seccion:
        errores.append('alumno_fuera_de_seccion')
    if alumno.sede_id != materia.sede_id:
        errores.append('alumno_fuera_de_sede')
    return errores


def _base_resultado(materia, lapso, fuente, estado, inconsistencias):
    return {
        'materia_id': materia.id,
        'lapso_id': lapso.id,
        'fuente': fuente,
        'tipo': materia.tipo_evaluacion,
        'estado': estado,
        'progreso': {'evaluados': 0, 'esperados': 0, 'porcentaje': 0},
        'valor_provisional': None,
        'valor_literal_provisional': None,
        'definitiva': None,
        'definitiva_literal': None,
        'aprobado': None,
        'cuenta_para_promedio': materia.cuenta_para_promedio,
        'inconsistencias': inconsistencias,
        'desglose': [],
        'aportes_externos': [],
    }


def _finalizar(resultado, lapso, completo):
    if not resultado['progreso']['evaluados']:
        resultado['estado'] = 'sin_datos'
    elif completo:
        resultado['estado'] = 'cerrado' if not lapso.activo else 'completo'
    else:
        resultado['estado'] = 'en_progreso'

    # Una definitiva solo existe cuando el lapso está cerrado y la captura
    # está completa. Mientras tanto el valor es explícitamente provisional.
    if resultado['estado'] == 'cerrado':
        if resultado['tipo'] == 'literal':
            resultado['definitiva_literal'] = resultado['valor_literal_provisional']
            resultado['aprobado'] = resultado['definitiva_literal'] in ('A', 'B')
        else:
            resultado['definitiva'] = resultado['valor_provisional']
            resultado['aprobado'] = resultado['definitiva'] >= UMBRAL_APROBATORIO
    return resultado


def _calcular_legacy(alumno, materia, lapso, config, inconsistencias):
    resultado = _base_resultado(materia, lapso, 'legacy', 'sin_datos', inconsistencias)
    esperadas = config.evaluaciones_esperadas or 4
    nota = Nota.objects.filter(alumno=alumno, materia=materia, lapso=lapso).first()
    valores = []
    for indice in range(1, esperadas + 1):
        valor = getattr(nota, f'evaluacion_{indice}', None) if indice <= 4 and nota else None
        resultado['desglose'].append({'evaluacion': indice, 'valor': _decimal(valor)})
        if valor is not None:
            valores.append(Decimal(str(valor)))
    evaluadas = len(valores)
    resultado['progreso'] = {
        'evaluados': evaluadas,
        'esperados': esperadas,
        'porcentaje': round(evaluadas / esperadas * 100, 2) if esperadas else 0,
    }
    if valores:
        resultado['valor_provisional'] = _decimal(sum(valores) / len(valores))
    return _finalizar(resultado, lapso, evaluadas == esperadas)


def _calcular_plan(alumno, materia, lapso, config, inconsistencias):
    resultado = _base_resultado(materia, lapso, 'plan', 'sin_datos', inconsistencias)
    plan = PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).prefetch_related(
        Prefetch('bloques__items__notas', queryset=NotaItemEvaluacion.objects.filter(alumno=alumno))
    ).first()
    if plan is None:
        resultado['inconsistencias'].append('plan_inexistente')
        return resultado

    items = [item for bloque in plan.bloques.all() for item in bloque.items.all()]
    esperados = len(items)
    notas = {
        nota.item_id: nota
        for item in items for nota in item.notas.all()
    }
    evaluados = len(notas)
    resultado['progreso'] = {
        'evaluados': evaluados,
        'esperados': esperados,
        'porcentaje': round(evaluados / esperados * 100, 2) if esperados else 0,
    }

    valores_bloques = []
    letras_bloques = []
    for bloque in plan.bloques.all():
        items_bloque = list(bloque.items.all())
        detalle = []
        numericos = []
        letras = []
        for item in items_bloque:
            nota = notas.get(item.id)
            valor_num = nota.valor_numerico if nota else None
            valor_letra = nota.valor_letra if nota else None
            detalle.append({
                'item_id': item.id, 'nombre': item.nombre,
                'valor_numerico': _decimal(valor_num), 'valor_letra': valor_letra,
            })
            if valor_num is not None:
                numericos.append((Decimal(str(valor_num)), item.valor_maximo))
            if valor_letra:
                letras.append(valor_letra)

        bloque_data = {'bloque_id': bloque.id, 'nombre': bloque.nombre, 'items': detalle}
        if materia.tipo_evaluacion == 'literal':
            valor = _moda_conservadora(letras)
            bloque_data['valor_letra'] = valor
            if valor:
                letras_bloques.append(valor)
        else:
            valor = None
            peso = Decimal(str(bloque.total_puntos or 0))
            if numericos:
                if bloque.modo == 'promedio':
                    normalizados = [
                        valor_item / Decimal(str(maximo))
                        for valor_item, maximo in numericos
                        if maximo is not None and maximo > 0
                    ]
                    valor = (
                        sum(normalizados) / len(normalizados) * peso
                        if len(normalizados) == len(numericos) else None
                    )
                else:
                    valor = sum(valor_item for valor_item, _ in numericos)
                if valor is not None:
                    valores_bloques.append(valor)
            bloque_data['valor'] = _decimal(valor)
        resultado['desglose'].append(bloque_data)

    # Los aportes externos consumen el mismo presupuesto de 20 y forman parte
    # de la completitud, nunca se suman fuera del contrato canónico.
    if materia.tipo_evaluacion == 'numerica':
        aportantes = materia.__class__.objects.filter(
            sede_id=materia.sede_id,
            grado_seccion=materia.grado_seccion,
            aporta_a_todas_las_materias=True,
            tipo_evaluacion='numerica',
            configuraciones_calificacion__lapso=lapso,
            configuraciones_calificacion__motor='plan',
        ).exclude(pk=materia.pk)
        for aportante in aportantes:
            plan_aporte = PlanEvaluacion.objects.filter(
                materia=aportante, lapso=lapso,
            ).prefetch_related(
                Prefetch(
                    'bloques__items__notas',
                    queryset=NotaItemEvaluacion.objects.filter(alumno=alumno),
                )
            ).first()
            if not plan_aporte:
                continue
            for bloque in plan_aporte.bloques.all():
                items_aporte = list(bloque.items.all())
                notas_aporte = {
                    nota.item_id: nota for item in items_aporte for nota in item.notas.all()
                }
                esperados += len(items_aporte)
                evaluados += len(notas_aporte)
                numericos = [
                    (Decimal(str(notas_aporte[item.id].valor_numerico)), item.valor_maximo)
                    for item in items_aporte
                    if item.id in notas_aporte
                    and notas_aporte[item.id].valor_numerico is not None
                ]
                valor = None
                peso = Decimal(str(bloque.total_puntos or 0))
                if numericos:
                    valor = (
                        (
                            sum(v / Decimal(str(maximo)) for v, maximo in numericos)
                            / len(numericos) * peso
                            if all(maximo is not None and maximo > 0 for _, maximo in numericos)
                            else None
                        )
                        if bloque.modo == 'promedio'
                        else sum(v for v, _ in numericos)
                    )
                    if valor is not None:
                        valores_bloques.append(valor)
                resultado['aportes_externos'].append({
                    'materia_id': aportante.id,
                    'materia_nombre': aportante.nombre,
                    'bloque_id': bloque.id,
                    'valor': _decimal(valor),
                })

        resultado['progreso'] = {
            'evaluados': evaluados,
            'esperados': esperados,
            'porcentaje': round(evaluados / esperados * 100, 2) if esperados else 0,
        }

    if materia.tipo_evaluacion == 'literal':
        resultado['valor_literal_provisional'] = _moda_conservadora(letras_bloques)
    elif valores_bloques:
        resultado['valor_provisional'] = _decimal(sum(valores_bloques))
    return _finalizar(resultado, lapso, bool(esperados) and evaluados == esperados)


def calcular_calificacion(alumno, materia, lapso):
    config = resolver_fuente(materia, lapso)
    inconsistencias = validar_configuracion(materia, lapso)
    if config is None or config.motor is None:
        return _base_resultado(materia, lapso, None, 'sin_configuracion', inconsistencias)
    if config.motor == 'legacy':
        return _calcular_legacy(alumno, materia, lapso, config, inconsistencias)
    return _calcular_plan(alumno, materia, lapso, config, inconsistencias)


def calcular_calificaciones_seccion(materia, lapso):
    from secretaria.models import Alumno

    alumnos = Alumno.objects.filter(grado_seccion=materia.grado_seccion, sede_id=materia.sede_id)
    return [calcular_calificacion(alumno, materia, lapso) | {
        'alumno_id': alumno.id,
        'alumno_nombre': f'{alumno.nombre} {alumno.apellido}',
    } for alumno in alumnos.order_by('apellido', 'nombre')]

