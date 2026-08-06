"""
Módulo "Corrección de Pagos".

Dos flujos de negocio relacionados pero distintos:

- Función A (corregir_pago): un pago ya existente se registró con datos
  incorrectos (ej. método de pago equivocado). Se corrige IN-PLACE — no se
  anula ni se recrea. `HistoricalRecords` (Pago.history) ya deja constancia
  de quién/cuándo/qué cambió, así que no hace falta ningún campo nuevo de
  enlace ni de auditoría manual.

- Función B (cargar_pago_retroactivo): el dinero se recibió en el pasado
  (ej. marzo) pero se está cargando al sistema hoy. Se crea un Pago nuevo
  con `fecha_pago` explícito igual a la fecha real en que se recibió el
  dinero, reutilizando la misma lógica de cálculo que ya usa
  RegistrarPagoView (tasa BCV vigente al momento de la carga, no un
  histórico de tasas).

Ambas comparten dos guardas:
  - No se puede tocar un período ya cerrado y validado por el director
    (fecha_en_cierre_validado).
  - Requieren un `motivo` explícito que se antepone a `observaciones`.
"""
import re
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import CierreCaja, Pago, TasaCambio
from .solvencia import periodo_activo

CAMPOS_EDITABLES_CORRECCION = ('metodo_pago', 'referencia', 'numero_lote', 'banco_receptor')


def fecha_en_cierre_validado(usuario, fecha):
    """
    True si `fecha` (un datetime) cae dentro del rango cubierto por algún
    CierreCaja de `usuario` que ya fue validado por el director.

    El rango cubierto por un cierre va desde el fecha_cierre del cierre
    INMEDIATAMENTE ANTERIOR de ese mismo usuario (exclusivo) hasta su propio
    fecha_cierre (inclusive). Si es el primer cierre del usuario, el rango
    arranca al inicio del día calendario (hora local) de ese cierre —
    mismo criterio que usa CierreCaja.save() (ver models.py línea ~517).
    """
    if timezone.is_naive(fecha):
        fecha = timezone.make_aware(fecha)

    cierres = list(
        CierreCaja.objects.filter(usuario_cierre=usuario).order_by('fecha_cierre')
    )

    anterior = None
    for cierre in cierres:
        fin_rango = cierre.fecha_cierre
        if anterior is not None:
            inicio_rango = anterior.fecha_cierre
        else:
            inicio_rango = timezone.localtime(fin_rango).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        if cierre.validado_por_director and inicio_rango < fecha <= fin_rango:
            return True

        anterior = cierre

    return False


def fecha_dentro_periodo_activo(fecha):
    """
    Verifica que `fecha` caiga dentro del período escolar activo
    (ConfiguracionSistema.periodo_escolar_activo, ej. "2025-2026" -> del
    1-sept-2025 al 31-ago-2026). Devuelve (bool, mensaje_error|None).
    """
    periodo = periodo_activo()
    if not periodo:
        return False, (
            "No hay un período escolar activo configurado "
            "(ConfiguracionSistema.periodo_escolar_activo). Configúrelo antes de "
            "cargar pagos retroactivos."
        )

    match = re.search(r'(\d{4})-(\d{4})', periodo)
    if not match:
        return False, f"El período escolar activo ('{periodo}') tiene un formato inválido."

    anio_inicio, anio_fin = int(match.group(1)), int(match.group(2))
    inicio = timezone.datetime(anio_inicio, 9, 1).date()
    fin = timezone.datetime(anio_fin, 8, 31).date()

    fecha_cmp = fecha.date() if hasattr(fecha, 'date') else fecha
    if not (inicio <= fecha_cmp <= fin):
        return False, (
            f"La fecha del pago retroactivo ({fecha_cmp}) está fuera del período "
            f"escolar activo vigente ({inicio} al {fin})."
        )

    return True, None


def corregir_pago(pago: Pago, cambios: dict, usuario, motivo: str) -> Pago:
    """
    Función A: edición in-place de un pago ya existente. Solo permite tocar
    metodo_pago/referencia/numero_lote/banco_receptor/observaciones — el resto
    de los campos (monto, alumno, fecha, etc.) no se tocan aquí.
    """
    if pago.estatus == 'anulado':
        raise ValidationError({
            'estatus': "No se puede corregir un pago anulado."
        })

    if fecha_en_cierre_validado(pago.usuario_receptor, pago.fecha_pago):
        raise ValidationError({
            'fecha_pago': (
                "No se puede corregir este pago: su fecha cae dentro de un cierre "
                "de caja ya validado por el director."
            )
        })

    for campo in CAMPOS_EDITABLES_CORRECCION:
        if campo in cambios:
            setattr(pago, campo, cambios[campo])

    # Se antepone el motivo a las observaciones. Si vinieron observaciones
    # nuevas en `cambios`, esas son la base sobre la que se antepone el
    # motivo; si no, se conserva lo que ya tenía el pago.
    observaciones_base = cambios.get('observaciones', pago.observaciones)
    pago.observaciones = f"[CORRECCIÓN] {motivo}\n{observaciones_base or ''}"

    pago.full_clean()
    pago.save()
    return pago


def cargar_pago_retroactivo(datos: dict, usuario, motivo: str) -> Pago:
    """
    Función B: registra un pago cuyo dinero se recibió en el pasado, con
    `fecha_pago` igual a la fecha real de recepción (no la fecha de hoy).

    `datos` ya viene validado/resuelto por PagoRetroactivoSerializer:
    alumno (instancia), metodo_pago, concepto, monto_usd, banco_receptor
    (instancia u None), referencia, numero_lote, observaciones,
    representante_documento, representante_nombre, fecha_pago (datetime).
    """
    fecha_pago = datos['fecha_pago']

    dentro_periodo, error_periodo = fecha_dentro_periodo_activo(fecha_pago)
    if not dentro_periodo:
        raise ValidationError({'fecha_pago': error_periodo})

    if fecha_en_cierre_validado(usuario, fecha_pago):
        raise ValidationError({
            'fecha_pago': (
                "No se puede cargar este pago: la fecha cae dentro de un cierre "
                "de caja ya validado por el director."
            )
        })

    try:
        tasa = TasaCambio.objects.latest('fecha')
    except TasaCambio.DoesNotExist:
        raise ValidationError({'tasa': "No se ha registrado ninguna tasa de cambio."})

    # monto_ves se calcula ANTES de construir el Pago (igual que en
    # RegistrarPagoView): Pago.save() llama full_clean() -> clean() antes de
    # recalcular monto_ves/monto_usd, así que si se dejara en 0 la
    # validación de integridad de clean() lo rechazaría.
    monto_usd_final = datos['monto_usd']
    monto_ves_final = (monto_usd_final * tasa.valor_bs).quantize(Decimal('0.01'))

    observaciones = f"[CARGA RETROACTIVA] {motivo}\n{datos.get('observaciones') or ''}"

    pago = Pago(
        alumno=datos['alumno'],
        usuario_receptor=usuario,
        banco_receptor=datos.get('banco_receptor'),
        metodo_pago=datos['metodo_pago'],
        concepto=datos.get('concepto') or 'mensualidad',
        monto_usd=monto_usd_final,
        tasa_aplicada=tasa.valor_bs,
        monto_ves=monto_ves_final,
        fecha_pago=fecha_pago,
        referencia=datos.get('referencia') or '',
        numero_lote=datos.get('numero_lote') or '',
        observaciones=observaciones,
        representante_documento=datos.get('representante_documento') or '',
        representante_nombre=datos.get('representante_nombre') or '',
    )
    pago.save()
    return pago
