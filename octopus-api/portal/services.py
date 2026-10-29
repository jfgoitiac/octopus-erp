"""
Servicios de dominio del portal de representantes.

``aprobar_comprobante`` concentra la lógica de aprobación de un
``ComprobantePago`` para que la comparta el panel administrativo
(``AdminComprobantesView.patch``) y la conciliación bancaria
(``cobranza.conciliacion_semiauto``) sin duplicarla.
"""
import logging
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from cobranza.models import BancoInstitucional, Mensualidad, Pago, TasaCambio
from .models import AvisoPortal, ComprobantePago

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')

# Moneda por defecto según el método: lo que entra por Zelle o en efectivo
# divisas es USD; el resto (transferencia, pago móvil, efectivo Bs.) es VES.
_METODOS_EN_USD = {'zelle', 'efectivo'}
# Métodos sin banco receptor (el dinero se entrega en físico).
_METODOS_SIN_BANCO = {'efectivo', 'efectivo_ves'}


class ComprobanteNoEncontrado(Exception):
    pass


class ComprobanteYaProcesado(Exception):
    def __init__(self, estatus):
        super().__init__(estatus)
        self.estatus = estatus


class DatosPagoInvalidos(Exception):
    """Datos del revisor inválidos. `campos` = {campo: mensaje} (400 del contrato)."""
    def __init__(self, campos):
        super().__init__(campos)
        self.campos = campos


def moneda_por_defecto(metodo_pago):
    return 'USD' if metodo_pago in _METODOS_EN_USD else 'VES'


def validar_datos_aprobacion(data):
    """
    Valida lo que escribe el revisor al aprobar (referencia, banco, método,
    fecha, monto y moneda) y resuelve la tasa BCV de la fecha del pago.
    Devuelve el dict `datos_pago` que espera ``resolver_comprobante`` o lanza
    ``DatosPagoInvalidos`` con todos los errores juntos.
    """
    from finanzas.monedas import redondear, tasa_para_fecha
    from pagos_comunes.referencias import normalizar_referencia

    campos = {}
    metodos_validos = {clave for clave, _ in Pago.METODOS}

    metodo = (data.get('metodo_pago') or '').strip().lower()
    if not metodo:
        campos['metodo_pago'] = 'Indique el método de pago.'
    elif metodo not in metodos_validos:
        campos['metodo_pago'] = 'Método de pago no válido.'
    elif metodo == 'punto_de_venta':
        # Pago exige número de lote para punto de venta y la revisión no lo
        # pide: esos cobros se registran en caja.
        campos['metodo_pago'] = (
            'Los pagos por punto de venta se registran en caja, no desde un comprobante.'
        )

    referencia = normalizar_referencia(data.get('referencia') or '')
    if not referencia:
        campos['referencia'] = 'Indique la referencia del pago.'

    banco = None
    banco_id = data.get('banco_receptor_id')
    if banco_id in (None, ''):
        if metodo not in _METODOS_SIN_BANCO:
            campos['banco_receptor_id'] = 'Indique el banco que recibió el pago.'
    else:
        try:
            banco = BancoInstitucional.objects.get(pk=int(banco_id))
        except (BancoInstitucional.DoesNotExist, TypeError, ValueError):
            campos['banco_receptor_id'] = 'Banco receptor no encontrado.'

    fecha_pago = None
    fecha_raw = data.get('fecha_pago')
    if isinstance(fecha_raw, date):
        fecha_pago = fecha_raw
    elif fecha_raw:
        try:
            fecha_pago = date.fromisoformat(str(fecha_raw)[:10])
        except ValueError:
            campos['fecha_pago'] = 'Fecha inválida (use AAAA-MM-DD).'
    else:
        campos['fecha_pago'] = 'Indique la fecha del pago.'
    if fecha_pago and fecha_pago > timezone.localdate():
        campos['fecha_pago'] = 'La fecha del pago no puede ser futura.'
        fecha_pago = None

    monto = None
    monto_raw = data.get('monto_recibido')
    if monto_raw in (None, ''):
        campos['monto_recibido'] = 'Indique el monto recibido.'
    else:
        try:
            monto = redondear(str(monto_raw).replace(',', '.'))
        except (InvalidOperation, TypeError, ValueError):
            campos['monto_recibido'] = 'Monto inválido.'
        else:
            if monto <= ZERO:
                campos['monto_recibido'] = 'El monto recibido debe ser mayor que cero.'

    moneda = (data.get('moneda') or '').strip().upper() or moneda_por_defecto(metodo)
    if moneda not in ('USD', 'VES'):
        campos['moneda'] = 'La moneda debe ser USD o VES.'

    tasa = None
    if fecha_pago:
        try:
            tasa = tasa_para_fecha(fecha_pago)
        except TasaCambio.DoesNotExist:
            if moneda == 'VES':
                campos['fecha_pago'] = (
                    'No hay tasa BCV registrada para esa fecha ni para una anterior; '
                    'no se puede convertir el monto en bolívares.'
                )

    if campos:
        raise DatosPagoInvalidos(campos)
    return {
        'referencia': referencia,
        'banco_receptor': banco,
        'metodo_pago': metodo,
        'fecha_pago': fecha_pago,
        'monto_recibido': monto,
        'moneda': moneda,
        'tasa': tasa,
    }


def _verificar_referencia_libre(comprobante, datos):
    """
    Antifraude de referencia (antes vivía en la subida del portal): la misma
    clave (referencia, método, banco) no puede estar en otro comprobante
    activo, en un Pago completado/en revisión ni en cantina. Corre dentro del
    atomic con el comprobante bloqueado. Lanza DatosPagoInvalidos.
    """
    from pagos_comunes.referencias import buscar_referencia_duplicada

    referencia = datos['referencia']
    banco_id = datos['banco_receptor'].id if datos['banco_receptor'] else None
    # El propio comprobante puede traer una referencia vieja (subida antes de
    # este flujo) con la misma clave: se limpia para que la búsqueda no se
    # detenga en él. Si algo falla después, el atomic lo revierte.
    ComprobantePago.objects.filter(pk=comprobante.pk).update(referencia_bancaria=None)
    duplicado = buscar_referencia_duplicada(
        referencia, metodo_pago=datos['metodo_pago'], banco_receptor_id=banco_id,
    )
    if not duplicado:
        return
    origenes = {
        'cobranza.Pago': 'el pago',
        'portal.ComprobantePago': 'el comprobante',
        'cantina.RecargaTarjeta': 'la recarga de cantina',
        'cantina.AbonoCantina': 'el abono de cantina',
        'cantina.VentaCantina': 'la venta de cantina',
    }
    donde = origenes.get(duplicado['origen'], 'otro registro')
    raise DatosPagoInvalidos({
        'referencia': (
            f"La referencia '{referencia}' ya está registrada en {donde} "
            f"#{duplicado['id']} ({duplicado['detalle']}) con el mismo método y banco. "
            'Cada transacción bancaria solo puede usarse una vez.'
        ),
    })


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


def _campos_de_validation_error(exc):
    """Traduce un ValidationError de Pago.full_clean() a campos del contrato."""
    mapa = {'referencia': 'referencia', 'numero_lote': 'metodo_pago',
            'monto_usd': 'monto_recibido', 'monto_ves': 'monto_recibido'}
    errores = exc.message_dict if hasattr(exc, 'error_dict') else {'general': exc.messages}
    return {
        mapa.get(campo, 'general'): ' '.join(str(m) for m in mensajes)
        for campo, mensajes in errores.items()
    }


def _aprobar_con_datos(comprobante, usuario, datos, advertencias):
    """
    Abona a la mensualidad lo realmente recibido, a la tasa de la fecha del
    pago, y crea el Pago por ese monto (mismo patrón que caja en
    cobranza/views.py: monto_pagado += min(abono, saldo) + registrar_aplicacion).
    Corre dentro del atomic de ``resolver_comprobante``.
    """
    from cobranza.deudas import registrar_aplicacion, saldo_deuda
    from finanzas.monedas import convertir, redondear

    _verificar_referencia_libre(comprobante, datos)

    mensualidad = Mensualidad.objects.select_for_update().select_related(
        'alumno__representante'
    ).get(pk=comprobante.mensualidad_id)
    alumno = mensualidad.alumno

    tasa = datos['tasa']
    tasa_valor = tasa.valor_bs if tasa else None
    monto = datos['monto_recibido']
    if datos['moneda'] == 'USD':
        monto_usd = redondear(monto)
    else:
        monto_usd = convertir(monto, 'VES', 'USD', tasa_valor)
    if tasa_valor is None:
        # Solo llega aquí en USD sin ninguna tasa en el sistema: mismo
        # fallback que el flujo anterior (Pago exige una tasa).
        tasa_valor = Decimal('1')
        advertencias.append(
            'No hay tasa BCV registrada: el equivalente en bolívares del pago quedó sin tasa real.'
        )
    if monto_usd <= ZERO:
        raise DatosPagoInvalidos({
            'monto_recibido': 'El monto equivale a menos de un centavo de dólar.',
        })

    # Nunca se abona más que el saldo; registrar_aplicacion guarda el abono
    # exacto para que una anulación posterior revierta solo esto.
    saldo_previo = saldo_deuda(mensualidad)
    abono = min(monto_usd, saldo_previo)
    excedente = monto_usd - abono

    fecha_pago_dt = timezone.make_aware(datetime.combine(datos['fecha_pago'], time(12, 0)))
    mensualidad.monto_pagado = min(mensualidad.monto_pagado + abono, mensualidad.monto_usd)
    if mensualidad.monto_usd <= 0 or mensualidad.monto_pagado >= mensualidad.monto_usd:
        # Fecha REAL del pago; save() respeta el valor si ya viene seteado.
        mensualidad.fecha_pago = fecha_pago_dt
    mensualidad.save()

    # Bs. coherente con Pago.clean(): en métodos en divisas (o si se recibió
    # USD) el Bs. se deriva del USD; si se recibieron bolívares por un método
    # en bolívares, es el monto exacto.
    if datos['metodo_pago'] in _METODOS_EN_USD or datos['moneda'] == 'USD':
        monto_ves = redondear(monto_usd * tasa_valor)
    else:
        monto_ves = redondear(monto)

    rep = alumno.representante
    observaciones_pago = f'Pago aprobado desde comprobante del portal #{comprobante.id}'
    if excedente > ZERO:
        observaciones_pago += f' (excedente no aplicado: {excedente} USD)'
    try:
        pago = Pago.objects.create(
            alumno=alumno,
            usuario_receptor=usuario,
            metodo_pago=datos['metodo_pago'],
            banco_receptor=datos['banco_receptor'],
            concepto='mensualidad',
            monto_usd=monto_usd,
            tasa_aplicada=tasa_valor,
            monto_ves=monto_ves,
            fecha_pago=fecha_pago_dt,
            referencia=datos['referencia'],
            observaciones=observaciones_pago,
            representante_documento=rep.cedula if rep else None,
            representante_nombre=f'{rep.nombre} {rep.apellido}' if rep else None,
            estatus='completado',
        )
    except ValidationError as exc:
        raise DatosPagoInvalidos(_campos_de_validation_error(exc))
    mensualidad.pagos.add(pago)
    if abono > ZERO:
        registrar_aplicacion(pago, mensualidad, abono)

    saldo_final = saldo_deuda(mensualidad)
    if saldo_previo <= ZERO:
        advertencias.append(
            'La mensualidad ya estaba saldada: no se abonó nada y todo el monto quedó como excedente.'
        )
    else:
        if saldo_final > ZERO:
            advertencias.append(
                f'Pago parcial: se abonaron {abono} USD y la mensualidad queda con '
                f'{saldo_final} USD pendientes.'
            )
        if excedente > ZERO:
            advertencias.append(
                f'El monto recibido supera el saldo en {excedente} USD: solo se aplicó el saldo. '
                'El excedente no se registró como saldo a favor.'
            )

    comprobante.referencia_bancaria = datos['referencia']
    comprobante.metodo_pago = datos['metodo_pago']
    comprobante.banco_receptor = datos['banco_receptor']
    comprobante.fecha_pago = datos['fecha_pago']
    comprobante.monto_recibido = monto
    comprobante.moneda = datos['moneda']
    comprobante.tasa_aplicada = tasa.valor_bs if tasa else None
    comprobante.monto_usd_aplicado = abono
    comprobante.pago = pago
    return pago, mensualidad


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
                         datos_pago=None, motivo_rechazo=None):
    """
    Aprueba o rechaza un comprobante pendiente.

    Usa un ``atomic`` propio (anidable): toda la parte monetaria hace rollback
    si algo falla, y NO se traga las excepciones. Devuelve
    ``(comprobante, pago_creado, mensualidad, advertencias)``.
    Lanza ``ComprobanteNoEncontrado`` / ``ComprobanteYaProcesado`` /
    ``DatosPagoInvalidos``.

    Al APROBAR con ``datos_pago`` (de ``validar_datos_aprobacion``; flujo de
    revisión del panel): referencia libre o error, abono real a la tasa de la
    fecha del pago (parcial o con excedente) y ``Pago`` por lo recibido.

    Al APROBAR sin ``datos_pago`` (conciliación bancaria, compatibilidad):
    comportamiento anterior — mensualidad pagada, ``Pago`` por el nominal con
    la última tasa y referencias repetidas solo como advertencia.

    Al RECHAZAR: ``motivo_rechazo`` (MotivoRechazo) y/o ``observaciones``; el
    texto que ve el representante es el del motivo + el detalle.

    En ambos casos guarda quién y cuándo revisó.
    """
    advertencias = []
    mensualidad = None
    pago_creado = None

    try:
        with transaction.atomic():
            # select_for_update() bloquea la fila hasta el commit; combinado con
            # el re-chequeo de estatus de abajo, evita que dos aprobaciones
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
                observaciones = motivo_rechazo.texto + (f'\n{detalle}' if detalle else '')
                comprobante.motivo_rechazo = motivo_rechazo

            if nuevo_estatus == 'aprobado':
                # Mismo archivo ya aprobado antes: solo advierte.
                advertencias.extend(advertencias_hash(comprobante))
                if datos_pago is not None:
                    pago_creado, mensualidad = _aprobar_con_datos(
                        comprobante, usuario, datos_pago, advertencias,
                    )
                else:
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
    except IntegrityError:
        # UniqueConstraint de referencia (comprobante o Pago) ganado por una
        # operación concurrente entre el chequeo y el guardado.
        raise DatosPagoInvalidos({
            'referencia': 'La referencia ya está registrada con el mismo método y banco.',
        })

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
    Avisos al representante tras aprobar/rechazar desde el panel. Best-effort
    y FUERA del atomic de dinero: el aviso de bandeja se crea aquí mismo y el
    push/email se encola; si algo falla, la revisión ya quedó en BD y solo se
    registra el error (mismo criterio que notificar_pago_aprobado). Al aprobar
    reemplaza a notificar_pago_aprobado (la tarea manda también el email de
    pago confirmado con el recibo).
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
