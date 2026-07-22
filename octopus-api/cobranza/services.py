"""
Servicio ÚNICO de generación de mensualidades.

Antes la creación de registros Mensualidad estaba dispersa y era manual:
  - GenerarAnualidadView (endpoint manual, un alumno a la vez, año calendario)
  - BuscarAlumnoCobranzaView (efecto secundario de la búsqueda, solo meses futuros)

Resultado: los alumnos cargados a la BD no tenían mensualidades y nunca
entraban en mora (cobranza/mora.py solo evalúa registros existentes).

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
portal.tasks.revisar_y_programar_notificaciones_pendientes, que se basa en la
fecha de vencimiento real de cada mensualidad.
"""
from decimal import Decimal

from .models import Mensualidad, ParametroGlobal


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

    montos_por_alumno = {
        a.pk: monto_con_beca(monto_base, getattr(a, 'porcentaje_beca', 0))
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

    nuevas = [
        Mensualidad(
            alumno_id=alumno_id, mes=mes, anio=anio,
            monto_usd=montos_por_alumno[alumno_id], pagado=False,
        )
        for alumno_id in alumno_ids
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
    """
    from .models import CuotaInscripcion

    METODOS_CON_BANCO = ('transferencia', 'pago_movil', 'punto_de_venta')
    METODOS_CON_REFERENCIA = ('transferencia', 'pago_movil', 'punto_de_venta', 'zelle', 'stripe')

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

    agrupados = {}
    ultima_fecha_pago = None

    for pago in cuota.pagos.all():
        grupo = agrupados.setdefault(pago.metodo_pago, {
            'metodo_display': pago.get_metodo_pago_display(),
            'monto': Decimal('0.00'),
            'referencias': [],
            'banco_destino': '',
            'banco_procedencia': '',
        })
        grupo['monto'] += pago.monto_usd
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
