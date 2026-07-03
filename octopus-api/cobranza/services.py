"""
Servicio ÚNICO de generación de mensualidades.

Antes la creación de registros Mensualidad estaba dispersa y era manual:
  - GenerarAnualidadView (endpoint manual, un alumno a la vez, año calendario)
  - BuscarAlumnoCobranzaView (efecto secundario de la búsqueda, solo meses futuros)

Resultado: los alumnos cargados a la BD no tenían mensualidades y nunca
entraban en mora (cobranza/mora.py solo evalúa registros existentes).

Este módulo centraliza la regla del período escolar (Sep–Jul) y la creación
idempotente de mensualidades para que la tarea mensual de Celery, la
inscripción y el comando de backfill usen exactamente el mismo criterio.

Nota: se usa bulk_create (no dispara la señal post_save de Mensualidad) para
no enviar el email de "día 0" al crear meses futuros o históricos. Las
notificaciones de cobranza siguen saliendo por la tarea diaria
portal.tasks.revisar_y_programar_notificaciones_pendientes, que se basa en la
fecha de vencimiento real de cada mensualidad.
"""
from datetime import date
from decimal import Decimal

from .models import Mensualidad, ParametroGlobal

# El año escolar va de septiembre (año 1) a julio (año 2). Agosto es vacaciones.
MES_INICIO_PERIODO = 9
MES_FIN_PERIODO = 7


def monto_mensualidad_defecto():
    """Monto base de la mensualidad desde ParametroGlobal (fallback 35.00 USD)."""
    param = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
    try:
        return Decimal(param.valor) if param and param.valor else Decimal('35.00')
    except Exception:
        return Decimal('35.00')


def periodo_escolar_de_fecha(hoy=None):
    """
    Devuelve (anio_inicio, anio_fin) del período escolar que contiene la fecha.
    Sep–Dic pertenecen al período que inicia ese año; Ene–Ago al que inició el
    año anterior (agosto se asocia al período recién terminado).
    """
    hoy = hoy or date.today()
    if hoy.month >= MES_INICIO_PERIODO:
        return hoy.year, hoy.year + 1
    return hoy.year - 1, hoy.year


def meses_periodo_escolar(anio_inicio, anio_fin):
    """Lista [(mes, anio), ...] del período escolar: Sep–Dic año 1 + Ene–Jul año 2."""
    return (
        [(m, anio_inicio) for m in range(MES_INICIO_PERIODO, 13)] +
        [(m, anio_fin) for m in range(1, MES_FIN_PERIODO + 1)]
    )


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


def mes_en_periodo_lectivo(mes):
    """True si el mes pertenece al año escolar (excluye agosto, vacaciones)."""
    return mes != 8


def generar_mensualidades(alumnos, meses, monto=None):
    """
    Crea (idempotente) las mensualidades indicadas para los alumnos dados.

    alumnos: iterable/queryset de Alumno.
    meses:   lista de tuplas (mes, anio).
    monto:   Decimal opcional; por defecto MONTO_MENSUALIDAD_DEFECTO.

    Devuelve la cantidad de mensualidades realmente creadas.
    """
    meses = [(m, a) for (m, a) in meses if mes_en_periodo_lectivo(m)]
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
    Genera las mensualidades del período escolar (ej: '2025-2026') para un
    alumno, desde la fecha `desde` (default: hoy) hasta el fin del período.
    Pensado para el momento de la inscripción: un alumno que ingresa a mitad
    de año no debe cargar deuda de meses previos a su ingreso.

    Devuelve la cantidad creada (0 si el período es inválido).
    """
    anios = parsear_periodo_escolar(periodo)
    if not anios:
        return 0

    desde = desde or date.today()
    meses = [
        (m, a) for (m, a) in meses_periodo_escolar(*anios)
        if (a, m) >= (desde.year, desde.month)
    ]
    return generar_mensualidades([alumno], meses, monto=monto)
