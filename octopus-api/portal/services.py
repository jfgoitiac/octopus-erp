"""
Servicios de dominio del portal de representantes.

Un ``ComprobantePago`` se APRUEBA registrando el pago en caja
(``cobranza.views.RegistrarPagoView`` con ``comprobante_portal_id``): ver
``bloquear_comprobante_para_caja`` y ``aprobar_comprobante_en_caja``. El
panel solo lo RECHAZA (``resolver_comprobante``). ``aprobar_comprobante`` es
el camino legado que aún usa la conciliación bancaria.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from cobranza.models import Pago, TasaCambio
from .models import AvisoPortal, ComprobantePago

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')

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


def _advertencias_referencia_legado(comprobante):
    """Advertencias de referencia repetida del flujo sin datos del revisor
    (conciliación bancaria): se conservan tal cual."""
    advertencias = []
    referencia = comprobante.referencia_bancaria
    if not referencia:
        return advertencias
    # Filtra por la misma clave compuesta (referencia, metodo_pago,
    # banco_receptor) que el resto del sistema: método/banco distinto
    # ya no es la misma transacción. Cuando este comprobante no
    # trae banco, la alerta queda redactada como sospecha a
    # verificar (no como certeza) y compara contra otros registros
    # que tampoco tienen banco.
    dup_pago_qs = Pago.objects.filter(
        referencia=referencia,
        metodo_pago=comprobante.metodo_pago,
        estatus__in=['completado', 'en_revision'],
    )
    dup_pago_qs = (
        dup_pago_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
        if comprobante.banco_receptor_id
        else dup_pago_qs.filter(banco_receptor__isnull=True)
    )
    dup_pago = dup_pago_qs.first()
    if dup_pago:
        if comprobante.banco_receptor_id:
            advertencias.append(
                f"ALERTA DE FRAUDE: La referencia '{referencia}' ya existe "
                f"en el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                "Verifique la autenticidad antes de completar la aprobación."
            )
        else:
            advertencias.append(
                f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                f"coincide con el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                "Verifique manualmente antes de completar la aprobación: sin banco "
                "confirmado, esta coincidencia es solo una sospecha a revisar."
            )

    dup_comp_qs = ComprobantePago.objects.filter(
        referencia_bancaria=referencia,
        metodo_pago=comprobante.metodo_pago,
        estatus='aprobado',
    ).exclude(pk=comprobante.pk)
    dup_comp_qs = (
        dup_comp_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
        if comprobante.banco_receptor_id
        else dup_comp_qs.filter(banco_receptor__isnull=True)
    )
    dup_comp = dup_comp_qs.first()
    if dup_comp:
        if comprobante.banco_receptor_id:
            advertencias.append(
                f"ALERTA: La referencia '{referencia}' ya fue aprobada en el "
                f"comprobante #{dup_comp.pk} "
                f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                "Posible intento de doble cobro."
            )
        else:
            advertencias.append(
                f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                f"coincide con el comprobante ya aprobado #{dup_comp.pk} "
                f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                "Verifique manualmente: sin banco confirmado, es solo una sospecha a revisar."
            )
    return advertencias


def _aprobar_legado(comprobante, usuario, advertencias):
    """Aprobación sin datos del revisor (conciliación bancaria): marca la
    mensualidad pagada y crea un Pago por el nominal con la última tasa."""
    mensualidad = comprobante.mensualidad
    alumno = mensualidad.alumno
    advertencias.extend(_advertencias_referencia_legado(comprobante))

    if not mensualidad.pagado:
        mensualidad.pagado = True
        mensualidad.fecha_pago = timezone.now()
        mensualidad.save()

    # Crear registro Pago para mantener coherencia de auditoría.
    # Si algo de esto falla, la excepción sale del atomic() y
    # revierte TODO (comprobante, mensualidad.pagado incluidos).
    tasa = TasaCambio.objects.order_by('-fecha').first()
    tasa_valor = tasa.valor_bs if tasa else 1

    pago = Pago.objects.create(
        alumno=alumno,
        usuario_receptor=usuario,
        metodo_pago=comprobante.metodo_pago or 'transferencia',
        banco_receptor=comprobante.banco_receptor,
        concepto='mensualidad',
        monto_usd=mensualidad.monto_usd,
        tasa_aplicada=tasa_valor,
        monto_ves=(mensualidad.monto_usd * tasa_valor).quantize(Decimal('0.01')),
        referencia=comprobante.referencia_bancaria or f'COMP-{comprobante.id}',
        observaciones=(
            f'Pago aprobado desde comprobante del portal #{comprobante.id}'
        ),
        estatus='completado',
    )
    mensualidad.pagos.add(pago)
    comprobante.pago = pago
    return pago, mensualidad


def resolver_comprobante(comprobante_id, nuevo_estatus, usuario, observaciones='',
                         motivo_rechazo=None):
    """
    Rechaza (panel) o aprueba por el camino LEGADO un comprobante pendiente.

    Usa un ``atomic`` propio (anidable): toda la parte monetaria hace rollback
    si algo falla, y NO se traga las excepciones. Devuelve
    ``(comprobante, pago_creado, mensualidad, advertencias)``.
    Lanza ``ComprobanteNoEncontrado`` / ``ComprobanteYaProcesado``.

    Al RECHAZAR: ``motivo_rechazo`` (MotivoRechazo) y/o ``observaciones``; el
    texto que ve el representante es el del motivo + el detalle.

    Al APROBAR (solo ``aprobar_comprobante``, que aún usa la conciliación
    bancaria): mensualidad pagada, ``Pago`` por el nominal con la última tasa
    y referencias repetidas solo como advertencia. El panel ya NO aprueba por
    aquí: se aprueba registrando el pago en caja (``POST
    cobranza/registrar-pago/`` con ``comprobante_portal_id``, ver
    ``bloquear_comprobante_para_caja`` / ``aprobar_comprobante_en_caja``).
    # TODO(coordinador): borrar el camino de aprobación cuando la
    # conciliación deje de llamar a aprobar_comprobante.

    En ambos casos guarda quién y cuándo revisó.
    """
    advertencias = []
    mensualidad = None
    pago_creado = None

    with transaction.atomic():
        # select_for_update() bloquea la fila hasta el commit; combinado con
        # el re-chequeo de estatus de abajo, evita que dos resoluciones
        # concurrentes del mismo comprobante (doble clic, dos admins) generen
        # doble acreditación.
        try:
            comprobante = ComprobantePago.objects.select_for_update().select_related(
                'mensualidad__alumno'
            ).get(id=comprobante_id)
        except ComprobantePago.DoesNotExist:
            raise ComprobanteNoEncontrado()

        if comprobante.estatus != 'pendiente':
            raise ComprobanteYaProcesado(comprobante.estatus)

        if nuevo_estatus == 'rechazado' and motivo_rechazo is not None:
            detalle = (observaciones or '').strip()
            observaciones = motivo_rechazo.texto + (f'
{detalle}' if detalle else '')
            comprobante.motivo_rechazo = motivo_rechazo

        if nuevo_estatus == 'aprobado':
            # Mismo archivo ya aprobado antes: solo advierte.
            advertencias.extend(advertencias_hash(comprobante))
            pago_creado, mensualidad = _aprobar_legado(comprobante, usuario, advertencias)
            # Recalcular con el criterio canónico: aprobar un comprobante
            # de un mes no implica solvencia si debe meses anteriores.
            from cobranza.mora import sincronizar_estatus_alumno
            sincronizar_estatus_alumno(mensualidad.alumno)

        comprobante.estatus = nuevo_estatus
        comprobante.observaciones = observaciones
        comprobante.revisado_por = usuario if getattr(usuario, 'pk', None) else None
        comprobante.fecha_revision = timezone.now()
        comprobante.save()

    return comprobante, pago_creado, mensualidad, advertencias


def aprobar_comprobante(comprobante_id, usuario, observaciones=''):
    """Aprueba un comprobante pendiente. Ver ``resolver_comprobante``."""
    return resolver_comprobante(comprobante_id, 'aprobado', usuario, observaciones)


def notificar_pago_aprobado(mensualidad, pago):
    """
    Notificación al representante: best-effort, DELIBERADAMENTE fuera de la
    transacción de dinero. Si Celery/Redis está caído, el pago ya quedó
    confirmado en BD y no debe revertirse solo porque no se pudo encolar el
    aviso — se registra el fallo para revisión manual.
    """
    try:
        from notificaciones.tasks import task_notificar_pago_exitoso
        task_notificar_pago_exitoso.delay(mensualidad.id, pago.id)
    except Exception as exc:
        logger.error(
            'Pago #%s creado pero falló el encolado de la notificación '
            'al representante: %s', pago.id, exc
        )


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
