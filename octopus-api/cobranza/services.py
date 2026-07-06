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
mensual de Celery, la inscripción y el comando de backfill usen exactamente el
mismo criterio. Ninguna mensualidad se genera fuera de ese rango de fechas.

Nota: se usa bulk_create (no dispara la señal post_save de Mensualidad) para
no enviar el email de "día 0" al crear meses futuros o históricos. Las
notificaciones de cobranza siguen saliendo por la tarea diaria
portal.tasks.revisar_y_programar_notificaciones_pendientes, que se basa en la
fecha de vencimiento real de cada mensualidad.
"""
from datetime import date
from decimal import Decimal

from .models import Mensualidad, ParametroGlobal


def monto_mensualidad_defecto():
    """Monto base de la mensualidad desde ParametroGlobal (fallback 35.00 USD)."""
    param = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
    try:
        return Decimal(param.valor) if param and param.valor else Decimal('35.00')
    except Exception:
        return Decimal('35.00')


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


def parsear_periodo_escolar(periodo):
    """
    Convierte un string tipo '2025-2026' en (2025, 2026).
    Devuelve None si el formato no es válido.
    """
    try:
        anio_inicio, anio_fin = (int(p) for p in str(periodo).split('-'))
        if anio_fin != anio_inicio + 1:
            return None
        return anio_inicio, anio_fin
    except (ValueError, AttributeError):
        return None


def mes_en_periodo_lectivo(mes, anio, config=None):
    """True si (mes, anio) cae dentro del año escolar activo configurado."""
    rango = rango_ano_escolar(config)
    if not rango:
        return False
    fecha_inicio, fecha_fin = rango
    inicio = (fecha_inicio.year, fecha_inicio.month)
    fin = (fecha_fin.year, fecha_fin.month)
    return inicio <= (anio, mes) <= fin


def generar_mensualidades(alumnos, meses, monto=None, config=None):
    """
    Crea (idempotente) las mensualidades indicadas para los alumnos dados.

    alumnos: iterable/queryset de Alumno.
    meses:   lista de tuplas (mes, anio). Cualquier mes fuera del año escolar
             activo (ConfiguracionSistema.fecha_inicio_ano_escolar..
             fecha_fin_ano_escolar) se descarta antes de crear nada.
    monto:   Decimal opcional; por defecto MONTO_MENSUALIDAD_DEFECTO.

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

    monto = monto if monto is not None else monto_mensualidad_defecto()
    alumno_ids = [a.pk for a in alumnos]
    if not alumno_ids:
        return 0

    # Detectar existentes primero para crear solo lo que falta y poder
    # reportar un conteo exacto (bulk_create con ignore_conflicts no lo da).
    anios = {a for (_, a) in meses}
    existentes = set(
        Mensualidad.objects
        .filter(alumno_id__in=alumno_ids, anio__in=anios)
        .values_list('alumno_id', 'mes', 'anio')
    )

    nuevas = [
        Mensualidad(alumno_id=alumno_id, mes=mes, anio=anio, monto_usd=monto, pagado=False)
        for alumno_id in alumno_ids
        for (mes, anio) in meses
        if (alumno_id, mes, anio) not in existentes
    ]
    if not nuevas:
        return 0

    Mensualidad.objects.bulk_create(nuevas, batch_size=500, ignore_conflicts=True)
    return len(nuevas)


def generar_mensualidades_alumno_periodo(alumno, periodo, desde=None, monto=None):
    """
    Genera únicamente la PRIMERA mensualidad exigible de un alumno recién
    inscrito (nunca antes del inicio de clases), no todo el año escolar
    restante. Esa mensualidad se cobra junto con la cuota de inscripción,
    como adelanto del mes siguiente; el resto del período lo va generando
    mes a mes la tarea mensual de Celery (generar_mensualidades_mes_actual),
    que es la que efectivamente activa la mora al vencer cada mes.

    Ejemplo: si la inscripción ocurre en julio y el año escolar empieza en
    septiembre, se genera solo septiembre (no agosto, que queda fuera del
    período de clases, ni el resto del año).

    Un alumno que ingresa a mitad de año (con clases ya en curso) solo carga
    la mensualidad del mes de su ingreso, no la de meses previos.

    `periodo` solo se valida por formato (ej: '2025-2026'); el rango real de
    fechas siempre sale de la configuración vigente.

    Devuelve la cantidad creada (0 si el período es inválido o no hay
    configuración de año escolar).
    """
    if not parsear_periodo_escolar(periodo):
        return 0

    config = configuracion_activa()
    rango = rango_ano_escolar(config)
    if not rango:
        return 0
    fecha_inicio, fecha_fin = rango

    desde = desde or date.today()
    if desde < fecha_inicio:
        desde = fecha_inicio

    meses = [
        (m, a) for (m, a) in meses_ano_escolar(fecha_inicio, fecha_fin)
        if (a, m) >= (desde.year, desde.month)
    ]
    if not meses:
        return 0

    primer_mes = meses[0]
    return generar_mensualidades([alumno], [primer_mes], monto=monto, config=config)
