"""
Servicios de dominio del portal de representantes.

Un ``ComprobantePago`` se APRUEBA registrando el pago en caja
(``cobranza.views.RegistrarPagoView`` con ``comprobante_portal_id``): ver
``bloquear_comprobante_para_caja`` y ``aprobar_comprobante_en_caja``. El
panel solo lo RECHAZA (``resolver_comprobante``).
"""
import logging

from django.db import transaction
from django.utils import timezone

from .models import AvisoPortal, ComprobantePago

logger = logging.getLogger(__name__)


class ComprobanteNoEncontrado(Exception):
    pass


class ComprobanteYaProcesado(Exception):
    def __init__(self, estatus):
        super().__init__(estatus)
        self.estatus = estatus


class ComprobanteDeOtroAlumno(Exception):
    """La mensualidad del comprobante no es de ninguno de los alumnos del pago."""


# Métodos sin banco ni referencia bancaria (el dinero se entrega en físico).
_METODOS_EFECTIVO = {'efectivo', 'efectivo_ves'}


def bloquear_comprobante_para_caja(comprobante_id, alumno_ids):
    """
    Bloquea (``select_for_update``) el comprobante del portal que va a procesar
    un registro de pago en caja. Debe llamarse DENTRO del atomic de
    ``RegistrarPagoView`` y antes de crear los pagos: el bloqueo dura hasta el
    commit, así dos cajeros no pueden procesar el mismo comprobante.
    Lanza ``ComprobanteNoEncontrado`` / ``ComprobanteYaProcesado`` /
    ``ComprobanteDeOtroAlumno``.
    """
    try:
        comprobante = ComprobantePago.objects.select_for_update().select_related(
            'mensualidad__alumno',
        ).get(pk=comprobante_id)
    except ComprobantePago.DoesNotExist:
        raise ComprobanteNoEncontrado()
    if comprobante.estatus != 'pendiente':
        raise ComprobanteYaProcesado(comprobante.estatus)
    if comprobante.mensualidad.alumno_id not in set(alumno_ids):
        raise ComprobanteDeOtroAlumno()
    return comprobante


def aprobar_comprobante_en_caja(comprobante, pagos_creados, usuario):
    """
    Marca aprobado el comprobante (ya bloqueado por
    ``bloquear_comprobante_para_caja``) con el pago que lo procesó. Corre en el
    MISMO atomic que crea los pagos: si el registro falla, el comprobante
    sigue pendiente. Copia referencia, método y banco de la primera línea
    bancaria (para mostrarlos en el portal y en la lista de revisión); los
    montos, la fecha y la tasa viven en el Pago, no se duplican aquí.
    """
    comprobante.estatus = 'aprobado'
    comprobante.pago = pagos_creados[0]
    comprobante.revisado_por = usuario if getattr(usuario, 'pk', None) else None
    comprobante.fecha_revision = timezone.now()
    linea_bancaria = next(
        (p for p in pagos_creados if p.metodo_pago not in _METODOS_EFECTIVO), None,
    )
    if linea_bancaria is not None:
        # '' → None: la UniqueConstraint de referencia trata NULL como distinto.
        comprobante.referencia_bancaria = linea_bancaria.referencia or None
        comprobante.metodo_pago = linea_bancaria.metodo_pago
        comprobante.banco_receptor_id = linea_bancaria.banco_receptor_id
    comprobante.save()
    return comprobante


def advertencias_hash(comprobante):
    """Chequeo de solo lectura: ¿el mismo archivo ya fue aprobado antes?"""
    if not comprobante.hash_archivo:
        return []
    dup_hash = ComprobantePago.objects.filter(
        hash_archivo=comprobante.hash_archivo,
        estatus='aprobado',
    ).exclude(pk=comprobante.pk).select_related('mensualidad').first()
    if not dup_hash:
        return []
    return [
        f"ALERTA: El archivo de este comprobante es idéntico al del "
        f"comprobante #{dup_hash.pk} que ya fue aprobado "
        f"({dup_hash.mensualidad.get_mes_display()} {dup_hash.mensualidad.anio}). "
        "Podría ser el mismo documento presentado dos veces."
    ]


def resolver_comprobante(comprobante_id, usuario, observaciones='', motivo_rechazo=None):
    """
    Rechaza un comprobante pendiente (panel). Aprobar se hace registrando el
    pago en caja: ver ``bloquear_comprobante_para_caja`` /
    ``aprobar_comprobante_en_caja``.

    ``motivo_rechazo`` (MotivoRechazo) y/o ``observaciones``: el texto que ve el
    representante es el del motivo + el detalle. Guarda quién y cuándo revisó.
    Lanza ``ComprobanteNoEncontrado`` / ``ComprobanteYaProcesado``.
    """
    with transaction.atomic():
        # select_for_update() + re-chequeo de estatus: evita que un rechazo
        # pise un pago que caja está registrando en paralelo.
        try:
            comprobante = ComprobantePago.objects.select_for_update().select_related(
                'mensualidad__alumno'
            ).get(id=comprobante_id)
        except ComprobantePago.DoesNotExist:
            raise ComprobanteNoEncontrado()

        if comprobante.estatus != 'pendiente':
            raise ComprobanteYaProcesado(comprobante.estatus)

        if motivo_rechazo is not None:
            detalle = (observaciones or '').strip()
            observaciones = motivo_rechazo.texto + (f'\n{detalle}' if detalle else '')
            comprobante.motivo_rechazo = motivo_rechazo

        comprobante.estatus = 'rechazado'
        comprobante.observaciones = observaciones
        comprobante.revisado_por = usuario if getattr(usuario, 'pk', None) else None
        comprobante.fecha_revision = timezone.now()
        comprobante.save()

    return comprobante


def crear_aviso_comprobante(comprobante):
    """Crea el AvisoPortal (bandeja del portal) del comprobante resuelto con el
    texto de PlantillaAviso. Síncrono: es una sola fila y no depende de Celery.
    Devuelve el aviso, o None si el representante no tiene usuario de portal."""
    from notificaciones.plantillas_aviso import renderizar_aviso, valores_comprobante
    from notificaciones.services import _usuario_portal_de

    if comprobante.estatus not in ('aprobado', 'rechazado'):
        return None
    usuario_portal = _usuario_portal_de(comprobante.mensualidad.alumno.representante)
    if not usuario_portal:
        return None
    clave = f'comprobante_{comprobante.estatus}'
    titulo, cuerpo = renderizar_aviso(clave, valores_comprobante(comprobante))
    return AvisoPortal.objects.create(
        usuario_portal=usuario_portal, tipo=clave,
        titulo=titulo[:255], cuerpo=cuerpo, url='/portal',
    )


def notificar_comprobante_resuelto(comprobante):
    """
    Avisos al representante tras rechazar (panel) o aprobar (caja) su
    comprobante. Best-effort y FUERA del atomic de dinero: el aviso de bandeja
    se crea aquí mismo y el push (y el email, si fue rechazado) se encola; si
    algo falla, la revisión ya quedó en BD y solo se registra el error (mismo
    criterio que notificar_pago_aprobado). Al aprobar NO manda correo: caja ya
    envía el de "pago confirmado" con el recibo.
    """
    try:
        crear_aviso_comprobante(comprobante)
    except Exception as exc:
        logger.error(
            'Comprobante #%s %s pero no se pudo crear el aviso del portal: %s',
            comprobante.id, comprobante.estatus, exc,
        )
    try:
        from notificaciones.tasks import task_notificar_comprobante_resuelto
        task_notificar_comprobante_resuelto.delay(comprobante.id)
    except Exception as exc:
        logger.error(
            'Comprobante #%s %s pero falló el encolado del push/email al '
            'representante: %s', comprobante.id, comprobante.estatus, exc,
        )
