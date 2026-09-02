"""
Servicio ÚNICO de generación de mensualidades.

Antes la creación de registros Mensualidad estaba dispersa y era manual
(un endpoint que generaba año calendario completo, y un efecto secundario
de la búsqueda de alumno que solo cubría meses futuros). Resultado: los
alumnos cargados a la BD no tenían mensualidades y nunca entraban en mora
(cobranza/mora.py solo evalúa registros existentes). Aquel endpoint de año
calendario ya fue eliminado del código; toda generación pasa por aquí.

Este módulo centraliza la regla del período escolar activo — leída siempre de
ConfiguracionSistema.fecha_inicio_ano_escolar / fecha_fin_ano_escolar, nunca de
meses fijos — y la creación idempotente de mensualidades, para que la tarea
mensual de Celery y el comando de backfill usen exactamente el mismo criterio.
Ninguna mensualidad se genera fuera de ese rango de fechas.

La inscripción (secretaria/serializers.py) solo cobra la cuota de inscripción;
no genera ninguna Mensualidad. La primera mensualidad del alumno la crea la
tarea mensual de Celery (generar_mensualidades_mes_actual) el día 1 del mes
en que le corresponda pagar.

Nota: se usa bulk_create (no dispara la señal post_save de Mensualidad) para
no enviar el email de "día 0" al crear meses futuros o históricos. Las
notificaciones de cobranza siguen saliendo por la tarea diaria
notificaciones.tasks.revisar_y_programar_notificaciones_pendientes, que se
basa en la fecha de vencimiento real de cada mensualidad.
"""
import calendar
from decimal import Decimal

from .models import Mensualidad, ParametroGlobal


def pagos_de_alumno(alumno):
    """Pagos en los que `alumno` participó, ya sea como titular de la
    operación (Pago.alumno) o como uno de los hermanos cuya deuda se saldó
    en una transacción conjunta.

    Pago.alumno es un FK singular: en un pago que cubre a varios hermanos en
    la misma transacción (ver PagoCreateSerializer.validate), solo el primer
    alumno seleccionado queda como "titular" de ese campo, aunque la deuda de
    todos los hermanos se marca pagada correctamente vía las relaciones M2M
    (mensualidades_pagadas, cuotas_inscripcion_pagadas, cuotas_solvencia_pagadas).
    Filtrar solo por Pago.alumno deja a los hermanos no-titulares sin ningún
    pago en su historial, aunque su deuda sí esté saldada — lo que hace creer
    que nunca se les cobró y lleva a cobrarles de nuevo.
    """
    from django.db.models import Q
    from .models import Pago
    return Pago.objects.filter(
        Q(alumno=alumno)
        | Q(mensualidades_pagadas__alumno=alumno)
        | Q(cuotas_inscripcion_pagadas__alumno=alumno)
        | Q(cuotas_solvencia_pagadas__alumno=alumno)
    ).distinct()


def alumnos_de_pago(pago):
    """Todos los alumnos realmente involucrados en un Pago (titular + hermanos
    cuya deuda se saldó en la misma transacción), para reportes que necesitan
    mostrar el desglose real en vez de solo el titular (ver pagos_de_alumno)."""
    vistos = set()
    alumnos = []

    def agregar(alumno):
        if alumno and alumno.id not in vistos:
            vistos.add(alumno.id)
            alumnos.append(alumno)

    agregar(pago.alumno)
    for m in pago.mensualidades_pagadas.all():
        agregar(m.alumno)
    for c in pago.cuotas_inscripcion_pagadas.all():
        agregar(c.alumno)
    for s in pago.cuotas_solvencia_pagadas.all():
        agregar(s.alumno)
    return alumnos


def monto_mensualidad_defecto():
    """Monto base de la mensualidad desde ParametroGlobal (fallback 35.00 USD)."""
    param = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
    try:
        return Decimal(param.valor) if param and param.valor else Decimal('35.00')
    except Exception:
        return Decimal('35.00')


def monto_proyecto_inversion_defecto():
    """Monto base del Proyecto de Inversión desde ParametroGlobal (fallback 0.00 USD)."""
    param = ParametroGlobal.objects.filter(clave="MONTO_PROYECTO_INVERSION_DEFECTO").first()
    try:
        return Decimal(param.valor) if param and param.valor else Decimal('0.00')
    except Exception:
        return Decimal('0.00')


def tipo_cargo_proyecto_inversion():
    """
    TipoCargoEspecial semilla "Proyecto de Inversión" (creada por la migración
    de backfill cobranza/migrations/0035). get_or_create como red de
    seguridad (ej. entornos de test que corren migraciones desde cero) —
    nunca debería tener que crearlo en producción, ya migrado.
    """
    from .models import TipoCargoEspecial
    tipo, _ = TipoCargoEspecial.objects.get_or_create(
        nombre="Proyecto de Inversión",
        defaults={
            'monto_defecto_usd': monto_proyecto_inversion_defecto(),
            'periodicidad': 'unico',
            'numero_cuotas': 1,
            'bloquea_inscripcion': True,
            'alcance': 'todos',
            'activo': True,
        },
    )
    return tipo


def configuracion_activa():
    """Instancia única de ConfiguracionSistema, o None si aún no existe."""
    from secretaria.models import ConfiguracionSistema
    return ConfiguracionSistema.objects.order_by('id').first()


def rango_ano_escolar(config=None):
    """
    (fecha_inicio, fecha_fin) del año escolar activo, tomado directamente de
    ConfiguracionSistema. Devuelve None si no hay configuración o le faltan
    las fechas de inicio/fin de clases.
    """
    config = config or configuracion_activa()
    if not config or not config.fecha_inicio_ano_escolar or not config.fecha_fin_ano_escolar:
        return None
    return config.fecha_inicio_ano_escolar, config.fecha_fin_ano_escolar


def meses_ano_escolar(fecha_inicio, fecha_fin):
    """Lista [(mes, anio), ...] entre fecha_inicio y fecha_fin (inclusive)."""
    meses = []
    anio, mes = fecha_inicio.year, fecha_inicio.month
    while (anio, mes) <= (fecha_fin.year, fecha_fin.month):
        meses.append((mes, anio))
        mes += 1
        if mes > 12:
            mes = 1
            anio += 1
    return meses


def mes_en_periodo_lectivo(mes, anio, config=None):
    """True si (mes, anio) cae dentro del año escolar activo configurado."""
    rango = rango_ano_escolar(config)
    if not rango:
        return False
    fecha_inicio, fecha_fin = rango
    inicio = (fecha_inicio.year, fecha_inicio.month)
    fin = (fecha_fin.year, fecha_fin.month)
    return inicio <= (anio, mes) <= fin


def porcentaje_beca_vigente(alumno, periodo_escolar=None):
    """
    Única función que resuelve qué % de beca aplica a las mensualidades de
    `alumno` en `periodo_escolar` (por defecto, el período activo). Fuente de
    verdad: secretaria.models.Beca — busca la beca 'activa' cuya vigencia
    (fecha_desde..fecha_hasta) cubre hoy. Devuelve 0 si no hay ninguna.

    La beca SOLO afecta mensualidades (ver secretaria/models.py::Beca,
    docstring). Nunca se usa para inscripción ni cargos especiales.
    """
    from django.utils import timezone
    from secretaria.models import Beca

    if periodo_escolar is None:
        config = configuracion_activa()
        periodo_escolar = config.periodo_escolar_activo if config else None
    if not periodo_escolar:
        return 0

    hoy = timezone.now().date()
    beca = (
        Beca.objects
        .filter(
            alumno=alumno, periodo_escolar=periodo_escolar, estado='activa',
            fecha_desde__lte=hoy, fecha_hasta__gte=hoy,
        )
        .order_by('-fecha_desde')
        .first()
    )
    return beca.porcentaje if beca else 0


def recalcular_mensualidades_impagas(alumno, periodo_escolar=None):
    """
    Ajusta las mensualidades IMPAGAS de `alumno` al % de beca vigente
    (porcentaje_beca_vigente), sin tocar las ya pagadas. Se llama al crear,
    modificar o revocar una Beca (ver secretaria/signals.py).

    Si el % vigente es 100 (becado total), las mensualidades impagas se
    ELIMINAN en vez de dejarlas en $0.00 — un becado total no debe tener
    mensualidades, igual que generar_mensualidades() nunca se las crea
    (ver exclusión por estatus_financiero='becado' en los distintos puntos
    de generación).

    Devuelve la cantidad de filas afectadas (actualizadas o eliminadas).
    """
    porcentaje = porcentaje_beca_vigente(alumno, periodo_escolar)
    impagas = Mensualidad.objects.filter(alumno=alumno, pagado=False)

    if porcentaje >= 100:
        total, _ = impagas.delete()
        return total

    actualizadas = 0
    for m in impagas:
        base = m.monto_original_usd if m.monto_original_usd is not None else m.monto_usd
        nuevo_monto = monto_con_beca(base, porcentaje)
        if m.monto_usd != nuevo_monto or m.monto_original_usd != base or m.porcentaje_beca_aplicado != porcentaje:
            m.monto_original_usd = base
            m.monto_usd = nuevo_monto
            m.porcentaje_beca_aplicado = porcentaje
            m.save(update_fields=['monto_usd', 'monto_original_usd', 'porcentaje_beca_aplicado'])
            actualizadas += 1
    return actualizadas


def monto_con_beca(monto_base, porcentaje_beca):
    """Aplica el descuento de `porcentaje_beca` (0-100) sobre `monto_base`.

    Los becados totales (estatus_financiero == 'becado') ni siquiera entran a
    este cálculo: quedan excluidos antes de generar mensualidades, así que su
    deuda nunca se toca. Este descuento es para becas PARCIALES (porcentaje_beca
    entre 1 y 99) sobre alumnos que sí generan mensualidad.
    """
    porcentaje_beca = porcentaje_beca or 0
    if porcentaje_beca <= 0:
        return monto_base
    descuento = (monto_base * Decimal(porcentaje_beca) / Decimal('100'))
    return (monto_base - descuento).quantize(Decimal('0.01'))


def generar_mensualidades(alumnos, meses, monto=None, config=None):
    """
    Crea (idempotente) las mensualidades indicadas para los alumnos dados.

    alumnos: iterable/queryset de Alumno.
    meses:   lista de tuplas (mes, anio). Cualquier mes fuera del año escolar
             activo (ConfiguracionSistema.fecha_inicio_ano_escolar..
             fecha_fin_ano_escolar) se descarta antes de crear nada.
    monto:   Decimal opcional; monto BASE por defecto MONTO_MENSUALIDAD_DEFECTO.
             El monto real de cada mensualidad se ajusta según
             Alumno.porcentaje_beca (beca parcial): quien tiene 100% en
             estatus_financiero='becado' no llega aquí, así que su deuda nunca
             se modifica.

    Devuelve la cantidad de mensualidades realmente creadas (0 si no hay
    período escolar configurado).
    """
    rango = rango_ano_escolar(config)
    if not rango:
        return 0
    fecha_inicio, fecha_fin = rango
    inicio = (fecha_inicio.year, fecha_inicio.month)
    fin = (fecha_fin.year, fecha_fin.month)
    meses = [(m, a) for (m, a) in meses if inicio <= (a, m) <= fin]
    if not meses:
        return 0

    monto_base = monto if monto is not None else monto_mensualidad_defecto()
    alumnos = list(alumnos)
    alumno_ids = [a.pk for a in alumnos]
    if not alumno_ids:
        return 0

    porcentajes_por_alumno = {a.pk: porcentaje_beca_vigente(a) for a in alumnos}
    montos_por_alumno = {
        a.pk: monto_con_beca(monto_base, porcentajes_por_alumno[a.pk])
        for a in alumnos
    }

    # Detectar existentes primero para crear solo lo que falta y poder
    # reportar un conteo exacto (bulk_create con ignore_conflicts no lo da).
    anios = {a for (_, a) in meses}
    existentes = set(
        Mensualidad.objects
        .filter(alumno_id__in=alumno_ids, anio__in=anios)
        .values_list('alumno_id', 'mes', 'anio')
    )

    # Becado total (100%): no se le crea NINGUNA mensualidad, ni siquiera en
    # $0.00 — igual que un alumno con estatus_financiero='becado' (ambos
    # casos son, en la práctica, el mismo alumno: la señal de Beca sincroniza
    # ese campo). No basta con que el llamador filtre por estatus_financiero
    # antes de llamar: se aplica aquí también para que la función sea segura
    # por sí misma sin importar quién la invoque.
    nuevas = [
        Mensualidad(
            alumno_id=alumno_id, mes=mes, anio=anio,
            monto_usd=montos_por_alumno[alumno_id], pagado=False,
            monto_original_usd=monto_base,
            porcentaje_beca_aplicado=porcentajes_por_alumno[alumno_id],
        )
        for alumno_id in alumno_ids
        if porcentajes_por_alumno[alumno_id] < 100
        for (mes, anio) in meses
        if (alumno_id, mes, anio) not in existentes
    ]
    if not nuevas:
        return 0

    Mensualidad.objects.bulk_create(nuevas, batch_size=500, ignore_conflicts=True)
    return len(nuevas)


def calcular_datos_administrativos_inscripcion(inscripcion):
    """Deriva el bloque 'Datos Administrativos' de la planilla desde Pago/CuotaInscripcion.

    Solo lectura: nunca se persiste, se recalcula en cada consulta a partir de
    los pagos reales asociados a la cuota de inscripción del alumno/período.

    Agrupa los pagos por método de pago realmente utilizado, de modo que el
    comprobante solo muestre los campos correspondientes a ese método (p. ej.
    banco/referencia para transferencia o pago móvil, pero no para efectivo).

    El monto total mostrado es siempre `cuota.monto_usd` (el precio real y ya
    conocido de la inscripción), no la suma de `pago.monto_usd` de los pagos
    ligados a la cuota: cuando el pago es 'mixto' (cubre inscripción + otro
    concepto en una misma transacción), `pago.monto_usd` es el total
    transferido por ese método y no indica cuánto correspondía solo a la
    inscripción — sumar esos totales inflaba el monto mostrado. Por método
    se distribuye proporcionalmente solo para fines de desglose informativo,
    sin afectar el total.
    """
    from .models import CuotaInscripcion

    METODOS_CON_BANCO = ('transferencia', 'pago_movil', 'punto_de_venta')
    METODOS_CON_REFERENCIA = ('transferencia', 'pago_movil', 'punto_de_venta', 'zelle')

    datos = {
        'metodos_pago': [],
        'fecha_pago': None,
        'fecha_inscripcion': inscripcion.fecha_inscripcion,
        'nro_solvencia': inscripcion.nro_solvencia,
    }

    cuota = CuotaInscripcion.objects.filter(
        alumno=inscripcion.alumno, periodo_escolar=inscripcion.periodo_escolar
    ).first()
    if not cuota:
        return datos

    pagos = list(cuota.pagos.all())
    if not pagos:
        return datos

    total_transferido = sum((p.monto_usd for p in pagos), Decimal('0.00'))

    agrupados = {}
    ultima_fecha_pago = None

    for pago in pagos:
        grupo = agrupados.setdefault(pago.metodo_pago, {
            'metodo_display': pago.get_metodo_pago_display(),
            'monto': Decimal('0.00'),
            'referencias': [],
            'banco_destino': '',
            'banco_procedencia': '',
        })
        # Proporción de este pago dentro del total transferido para la
        # inscripción, aplicada sobre el monto real de la cuota (no sobre la
        # suma cruda de montos, que puede incluir otros conceptos).
        proporcion = (pago.monto_usd / total_transferido) if total_transferido > 0 else Decimal('0')
        grupo['monto'] += (cuota.monto_usd * proporcion).quantize(Decimal('0.01'))
        if pago.metodo_pago in METODOS_CON_REFERENCIA and pago.referencia:
            grupo['referencias'].append(pago.referencia)
        if pago.metodo_pago in METODOS_CON_BANCO:
            if not grupo['banco_destino'] and pago.banco_receptor:
                grupo['banco_destino'] = pago.banco_receptor.nombre
            if not grupo['banco_procedencia'] and pago.banco_procedencia:
                grupo['banco_procedencia'] = pago.banco_procedencia

        if ultima_fecha_pago is None or pago.fecha_pago > ultima_fecha_pago:
            ultima_fecha_pago = pago.fecha_pago

    for grupo in agrupados.values():
        grupo['referencia'] = ', '.join(grupo.pop('referencias'))
        datos['metodos_pago'].append(grupo)

    datos['fecha_pago'] = ultima_fecha_pago
    return datos


def _cuotas_de_tipo(tipo):
    """
    [(numero_cuota, fecha_cobro), ...] para un TipoCargoEspecial, según su
    periodicidad (ver TipoCargoEspecial.clean() para las reglas de validación
    que garantizan que estos campos vienen consistentes).
    """
    if tipo.periodicidad == 'unico':
        return [(1, None)]

    from dateutil.relativedelta import relativedelta
    paso_meses = 1 if tipo.periodicidad == 'mensual' else 3
    cuotas = []
    for n in range(1, tipo.numero_cuotas + 1):
        fecha = tipo.fecha_primera_cuota + relativedelta(months=paso_meses * (n - 1))
        if tipo.dia_cobro:
            ultimo_dia_del_mes = calendar.monthrange(fecha.year, fecha.month)[1]
            fecha = fecha.replace(day=min(tipo.dia_cobro, ultimo_dia_del_mes))
        cuotas.append((n, fecha))
    return cuotas


def generar_cargos_especiales_pendientes(periodo_escolar=None):
    """
    Genera (idempotente) las CuotaProyectoInversion faltantes de todos los
    TipoCargoEspecial activos, para el período escolar dado (por defecto el
    activo en ConfiguracionSistema.periodo_escolar_activo).

    Alcance (ver TipoCargoEspecial): se evalúa sobre los ALUMNOS ACTIVOS del
    representante — un representante entra si tiene AL MENOS UN alumno
    activo que matchee 'todos'/'grado'/'sede', sin importar cuántos hijos
    matcheen (una sola cuota por representante, no una por hijo).

    Idempotente vía la clave completa (representante, periodo_escolar,
    tipo_concepto, numero_cuota) — igual que los 7 puntos de escritura de
    CuotaProyectoInversion (ver PASO 1). Devuelve la cantidad de filas creadas.
    """
    from .models import CuotaProyectoInversion, TipoCargoEspecial
    from secretaria.models import Alumno

    if periodo_escolar is None:
        config = configuracion_activa()
        periodo_escolar = config.periodo_escolar_activo if config else None
    if not periodo_escolar:
        return 0

    total_creadas = 0
    for tipo in TipoCargoEspecial.objects.filter(activo=True).prefetch_related('grados', 'sedes'):
        alumnos_activos = Alumno.objects.filter(activo=True)
        if tipo.alcance == 'grado':
            grados = list(tipo.grados.values_list('grado_seccion', flat=True))
            if not grados:
                continue
            alumnos_activos = alumnos_activos.filter(grado_seccion__in=grados)
        elif tipo.alcance == 'sede':
            sedes_ids = list(tipo.sedes.values_list('id', flat=True))
            if not sedes_ids:
                continue
            alumnos_activos = alumnos_activos.filter(sede_id__in=sedes_ids)

        representantes_ids = set(alumnos_activos.values_list('representante_id', flat=True))
        if not representantes_ids:
            continue

        existentes = set(
            CuotaProyectoInversion.objects
            .filter(periodo_escolar=periodo_escolar, tipo_concepto=tipo, representante_id__in=representantes_ids)
            .values_list('representante_id', 'numero_cuota')
        )

        cuotas_del_tipo = _cuotas_de_tipo(tipo)
        nuevas = [
            CuotaProyectoInversion(
                representante_id=representante_id,
                periodo_escolar=periodo_escolar,
                tipo_concepto=tipo,
                numero_cuota=numero_cuota,
                fecha_cobro=fecha_cobro,
                monto_usd=tipo.monto_defecto_usd,
                pagado=False,
            )
            for representante_id in representantes_ids
            for (numero_cuota, fecha_cobro) in cuotas_del_tipo
            if (representante_id, numero_cuota) not in existentes
        ]
        if nuevas:
            CuotaProyectoInversion.objects.bulk_create(nuevas, batch_size=500, ignore_conflicts=True)
            total_creadas += len(nuevas)

    return total_creadas


def reporte_costo_becas(periodo_escolar=None):
    """
    Costo total exonerado por becas en `periodo_escolar` (por defecto, el
    período activo), agregado por tipo de beca y por grado, más el detalle
    fila a fila (para el export a Excel del frontend).

    Fuente: Mensualidad.monto_original_usd - monto_usd de cada mensualidad
    con porcentaje_beca_aplicado > 0 dentro del rango de fechas del período
    (mismo criterio de "mes/año dentro del año escolar" que
    generar_mensualidades). No depende del estado ACTUAL de Beca — si ya se
    pagó con descuento, ese costo quedó fijado en la mensualidad aunque la
    beca se haya revocado después.

    `tipo` se resuelve buscando la Beca (activa o no) del alumno para ese
    período — best-effort, ya que Mensualidad no guarda una FK a Beca
    directamente. Si no se encuentra ninguna (caso backfill sin Beca
    correspondiente), se agrupa bajo 'otra'.
    """
    from collections import defaultdict
    from secretaria.models import Beca

    config = configuracion_activa()
    periodo = periodo_escolar or (config.periodo_escolar_activo if config else None)
    rango = rango_ano_escolar(config)

    vacio = {
        'periodo_escolar': periodo,
        'total_exonerado_usd': '0.00',
        'por_tipo': [],
        'por_grado': [],
        'detalle': [],
    }
    if not periodo or not rango:
        return vacio

    fecha_inicio, fecha_fin = rango
    inicio = (fecha_inicio.year, fecha_inicio.month)
    fin = (fecha_fin.year, fecha_fin.month)

    candidatas = (
        Mensualidad.objects
        .filter(porcentaje_beca_aplicado__gt=0)
        .select_related('alumno')
    )
    mensualidades = [m for m in candidatas if inicio <= (m.anio, m.mes) <= fin]
    if not mensualidades:
        return vacio

    alumno_ids = {m.alumno_id for m in mensualidades}
    becas_por_alumno = {}
    for b in Beca.objects.filter(periodo_escolar=periodo, alumno_id__in=alumno_ids).order_by('-fecha_desde'):
        becas_por_alumno.setdefault(b.alumno_id, b)

    tipos_display = dict(Beca.TIPOS)
    total = Decimal('0.00')
    por_tipo = defaultdict(lambda: {'cantidad': 0, 'total': Decimal('0.00')})
    por_grado = defaultdict(lambda: {'cantidad': 0, 'total': Decimal('0.00')})
    detalle = []

    for m in mensualidades:
        original = m.monto_original_usd if m.monto_original_usd is not None else m.monto_usd
        exonerado = (original - m.monto_usd).quantize(Decimal('0.01'))
        if exonerado <= 0:
            continue

        beca = becas_por_alumno.get(m.alumno_id)
        tipo = beca.tipo if beca else 'otra'
        grado = m.alumno.grado_seccion or 'Sin grado'

        total += exonerado
        por_tipo[tipo]['cantidad'] += 1
        por_tipo[tipo]['total'] += exonerado
        por_grado[grado]['cantidad'] += 1
        por_grado[grado]['total'] += exonerado

        detalle.append({
            'alumno_id': m.alumno_id,
            'alumno_nombre': f"{m.alumno.nombre} {m.alumno.apellido}",
            'grado_seccion': grado,
            'tipo_beca': tipo,
            'tipo_beca_display': tipos_display.get(tipo, tipo),
            'mes': m.get_mes_display(),
            'anio': m.anio,
            'monto_original_usd': str(original),
            'monto_usd': str(m.monto_usd),
            'exonerado_usd': str(exonerado),
            'pagado': m.pagado,
        })

    return {
        'periodo_escolar': periodo,
        'total_exonerado_usd': str(total.quantize(Decimal('0.01'))),
        'por_tipo': [
            {
                'tipo': k, 'tipo_display': tipos_display.get(k, k),
                'cantidad': v['cantidad'], 'total_exonerado_usd': str(v['total'].quantize(Decimal('0.01'))),
            }
            for k, v in sorted(por_tipo.items(), key=lambda kv: kv[1]['total'], reverse=True)
        ],
        'por_grado': [
            {
                'grado_seccion': k, 'cantidad': v['cantidad'],
                'total_exonerado_usd': str(v['total'].quantize(Decimal('0.01'))),
            }
            for k, v in sorted(por_grado.items(), key=lambda kv: kv[1]['total'], reverse=True)
        ],
        'detalle': detalle,
    }
