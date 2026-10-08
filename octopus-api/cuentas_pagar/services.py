"""Reglas transaccionales de Cuentas por Pagar.

Las funciones reciben datos primitivos para que Egresos no tenga que conocer los
modelos de este módulo.  No se usan floats: todo importe pasa por Decimal.
"""
from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from finanzas.monedas import convertir, redondear

from .models import (AplazamientoCxP, ComprobantePagoCxP, ConfiguracionRecordatorios,
    CuentaPorPagar, CuotaCuentaPagar, HistorialCxP, PagoCuentaPagar)


def _d(value, default='0'):
    return Decimal(str(value if value not in (None, '') else default))


def _history(cuenta, accion, usuario=None, **datos):
    HistorialCxP.objects.create(cuenta=cuenta, accion=accion, usuario=usuario, datos=datos)


def situacion(cuenta, hoy=None):
    if cuenta.estado in ('pagada', 'anulada'):
        return cuenta.estado
    hoy = hoy or timezone.localdate()
    dias = (cuenta.fecha_vencimiento - hoy).days
    if dias < 0: return 'vencida'
    if dias == 0: return 'vence_hoy'
    ventana = ConfiguracionRecordatorios.objects.first()
    if dias <= (ventana.ventana_por_vencer if ventana else 7): return 'por_vencer'
    return 'al_dia'


def _abonos(cuenta):
    return list(cuenta.pagos.filter(estado='valido').prefetch_related('comprobantes'))


def _payload_abono(pago):
    return {'id': pago.id, 'fecha_pago': pago.fecha_pago, 'moneda': pago.moneda,
        'tasa_aplicada': pago.tasa_aplicada, 'metodo_pago': pago.metodo_pago,
        'banco': pago.banco, 'referencia': pago.referencia,
        'monto_documento': pago.monto_aplicado, 'monto_usd': pago.monto_usd,
        'monto_ves': pago.monto_ves,
        'comprobantes': [c.archivo.name for c in pago.comprobantes.filter(activo=True)]}


def recalcular_saldo(cuenta, usuario=None):
    # Una cuenta anulada queda congelada: sus pagos anulados no deben reabrirla.
    if cuenta.estado == 'anulada': return cuenta
    aplicado = sum((p.monto_aplicado for p in _abonos(cuenta)), Decimal('0'))
    cuenta.saldo = redondear(cuenta.monto_documento - aplicado)
    if cuenta.saldo < 0:
        raise ValueError('Los pagos exceden el saldo de la cuenta.')
    cuenta.estado = 'pagada' if cuenta.saldo == 0 else ('parcial' if aplicado else 'pendiente')
    cuenta.save(update_fields=['saldo', 'estado', 'actualizado_en'])
    return cuenta


@transaction.atomic
def crear(datos, usuario=None):
    data = dict(datos)
    monto = _d(data.get('monto_documento'))
    tasa = _d(data.get('tasa_aplicada'))
    if monto <= 0 or tasa <= 0: raise ValueError('Monto y tasa deben ser mayores que cero.')
    cuenta = CuentaPorPagar.objects.create(**data, saldo=redondear(monto), creado_por=usuario)
    cuenta.actualizar_snapshots(); cuenta.save(update_fields=['monto_usd','monto_ves','actualizado_en'])
    _history(cuenta, 'creada', usuario)
    return cuenta


def _requiere_aprobacion(cuenta, monto_usd):
    cfg = ConfiguracionRecordatorios.objects.first()
    return bool(cfg and cfg.requiere_aprobacion_pago_grande and monto_usd >= cfg.umbral_aprobacion_usd)


def _reservado_por_aprobar(cuenta, excluir_id=None):
    qs = cuenta.pagos.filter(estado='por_aprobar')
    if excluir_id: qs = qs.exclude(pk=excluir_id)
    return sum((p.monto_aplicado for p in qs), Decimal('0'))


def _generar_egreso_si_pagada(cuenta):
    """Crea/actualiza el egreso de una cuenta saldada (igual para pagos normales y aprobados)."""
    if cuenta.estado != 'pagada': return None
    from egresos import services as egresos
    abonos = [_payload_abono(p) for p in _abonos(cuenta)]
    if cuenta.origen == 'factura':
        resultado = egresos.marcar_pagado(cuenta.id, abonos)
    else:
        resultado = egresos.crear_desde_cuenta_pagada(cuenta.id, {
            'proveedor': cuenta.proveedor, 'categoria': cuenta.categoria, 'sede': cuenta.sede,
            'concepto': cuenta.concepto, 'descripcion': cuenta.descripcion, 'moneda': cuenta.moneda,
            'tasa_aplicada': cuenta.tasa_aplicada, 'fecha_emision': cuenta.fecha_emision}, abonos)
    egreso_id = (resultado or {}).get('egreso_id')
    if egreso_id and cuenta.egreso_id != egreso_id:
        cuenta.egreso_id = egreso_id; cuenta.save(update_fields=['egreso_id','actualizado_en'])
    return resultado


@transaction.atomic
def registrar_pago(cuenta_id, datos, usuario=None):
    cuenta = CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    if cuenta.estado in ('pagada', 'anulada'): raise ValueError('La cuenta no admite pagos.')
    if cuenta.monto_por_confirmar: raise ValueError('Confirma el monto antes de registrar un pago.')
    aplicado = redondear(_d(datos.get('monto_aplicado')))
    pagado = redondear(_d(datos.get('monto_pagado')))
    if aplicado <= 0 or pagado <= 0 or aplicado > cuenta.saldo:
        raise ValueError('El monto aplicado debe ser positivo y no exceder el saldo.')
    # Los pagos por aprobar reservan saldo: válidos + por aprobar no pueden exceder la cuenta.
    reservado = _reservado_por_aprobar(cuenta)
    if aplicado > cuenta.saldo - reservado:
        raise ValueError('El monto aplicado excede el saldo disponible (hay pagos por aprobar que lo reservan).')
    moneda, tasa = datos.get('moneda', cuenta.moneda), _d(datos.get('tasa_aplicada'))
    if tasa <= 0: raise ValueError('La tasa debe ser mayor que cero.')
    # El saldo siempre se expresa en la moneda documental; el request debe ser consistente.
    if moneda != cuenta.moneda and convertir(pagado, moneda, cuenta.moneda, tasa) != aplicado:
        raise ValueError('El monto aplicado no coincide con la conversión de la moneda documental.')
    pago = PagoCuentaPagar.objects.create(cuenta=cuenta, fecha_pago=datos.get('fecha_pago') or timezone.localdate(),
        moneda=moneda, tasa_aplicada=tasa, motivo_cambio_tasa=datos.get('motivo_cambio_tasa',''), monto_pagado=pagado,
        monto_aplicado=aplicado, metodo_pago=datos.get('metodo_pago','otro'), banco=datos.get('banco',''),
        referencia=datos.get('referencia',''), nota=datos.get('nota',''), registrado_por=usuario)
    pago.actualizar_snapshots()
    if _requiere_aprobacion(cuenta, pago.monto_usd): pago.estado = 'por_aprobar'
    pago.save(update_fields=['monto_usd','monto_ves','estado'])
    if pago.estado == 'por_aprobar':
        _history(cuenta, 'pago_por_aprobar', usuario, pago_id=pago.id); return pago, cuenta, None
    recalcular_saldo(cuenta, usuario)
    resultado = _generar_egreso_si_pagada(cuenta)
    _history(cuenta, 'pago_registrado', usuario, pago_id=pago.id, saldo=str(cuenta.saldo))
    return pago, cuenta, resultado


@transaction.atomic
def aprobar_pago(pago_id, usuario=None):
    pago = PagoCuentaPagar.objects.select_related('cuenta').get(pk=pago_id)
    cuenta = CuentaPorPagar.objects.select_for_update().get(pk=pago.cuenta_id)
    pago = PagoCuentaPagar.objects.select_for_update().get(pk=pago_id)
    if pago.estado != 'por_aprobar': raise ValueError('El pago no está pendiente de aprobación.')
    if cuenta.estado in ('pagada', 'anulada'): raise ValueError('La cuenta no admite pagos.')
    # Se revalida contra el saldo vigente: pudo cambiar desde que se registró.
    if pago.monto_aplicado > cuenta.saldo:
        raise ValueError('El monto del pago excede el saldo vigente de la cuenta.')
    pago.estado = 'valido'; pago.save(update_fields=['estado'])
    recalcular_saldo(cuenta, usuario)
    resultado = _generar_egreso_si_pagada(cuenta)
    _history(cuenta, 'pago_aprobado', usuario, pago_id=pago.id, saldo=str(cuenta.saldo))
    return pago, cuenta, resultado


@transaction.atomic
def rechazar_pago(pago_id, motivo, usuario=None):
    if not motivo: raise ValueError('El motivo de rechazo es obligatorio.')
    pago = PagoCuentaPagar.objects.select_related('cuenta').get(pk=pago_id)
    cuenta = CuentaPorPagar.objects.select_for_update().get(pk=pago.cuenta_id)
    pago = PagoCuentaPagar.objects.select_for_update().get(pk=pago_id)
    if pago.estado != 'por_aprobar': raise ValueError('El pago no está pendiente de aprobación.')
    # Rechazado = anulado con motivo; libera la reserva de saldo.
    pago.estado = 'anulado'; pago.motivo_anulacion = motivo; pago.anulado_por = usuario; pago.anulado_en = timezone.now()
    pago.save(update_fields=['estado','motivo_anulacion','anulado_por','anulado_en'])
    _history(cuenta, 'pago_rechazado', usuario, pago_id=pago.id, motivo=motivo)
    return pago, cuenta


@transaction.atomic
def pago_multiple(pagos, usuario=None):
    proveedor_id = None
    for data in pagos:
        cuenta = CuentaPorPagar.objects.only('proveedor_id').get(pk=data['cuenta'])
        if proveedor_id is None: proveedor_id = cuenta.proveedor_id
        elif proveedor_id != cuenta.proveedor_id: raise ValueError('El pago múltiple requiere cuentas del mismo proveedor.')
    grupo = uuid4(); resultado=[]
    for data in pagos:
        pago, cuenta, egreso = registrar_pago(data['cuenta'], data, usuario)
        pago.pago_multiple = grupo; pago.save(update_fields=['pago_multiple'])
        resultado.append((pago, cuenta, egreso))
    return resultado


@transaction.atomic
def anular_pago(pago_id, motivo, usuario=None):
    if not motivo: raise ValueError('El motivo de anulación es obligatorio.')
    pago = PagoCuentaPagar.objects.select_for_update().select_related('cuenta').get(pk=pago_id)
    cuenta = CuentaPorPagar.objects.select_for_update().get(pk=pago.cuenta_id)
    if cuenta.estado == 'anulada': raise ValueError('La cuenta está anulada; sus pagos no pueden modificarse.')
    if pago.estado == 'anulado': return cuenta
    era_final = cuenta.estado == 'pagada' and pago.estado == 'valido'
    pago.estado='anulado'; pago.motivo_anulacion=motivo; pago.anulado_por=usuario; pago.anulado_en=timezone.now()
    pago.save(update_fields=['estado','motivo_anulacion','anulado_por','anulado_en'])
    recalcular_saldo(cuenta, usuario)
    if era_final:
        from egresos import services as egresos
        if cuenta.origen == 'factura': egresos.revertir_pago(cuenta.id, pago.id)
        else:
            egresos.anular_por_cuenta(cuenta.id, motivo)
            # El egreso de la factura original sigue vinculado; solo se suelta el generado por CxP.
            cuenta.egreso_id = None; cuenta.save(update_fields=['egreso_id','actualizado_en'])
    _history(cuenta, 'pago_anulado', usuario, pago_id=pago.id, motivo=motivo)
    return cuenta


@transaction.atomic
def aplazar(cuenta_id, fecha_nueva, motivo, usuario=None, aprobado_por=None):
    cuenta=CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    cfg=ConfiguracionRecordatorios.objects.first(); limite=cfg.max_aplazamientos_sin_director if cfg else 2
    requiere=cuenta.veces_aplazada >= limite
    if requiere and not aprobado_por: raise PermissionError('El aplazamiento requiere aprobación del director.')
    item=AplazamientoCxP.objects.create(cuenta=cuenta, fecha_anterior=cuenta.fecha_vencimiento, fecha_nueva=fecha_nueva,
        motivo=motivo, requiere_aprobacion=requiere, aprobado_por=aprobado_por, creado_por=usuario)
    cuenta.fecha_vencimiento=fecha_nueva; cuenta.veces_aplazada += 1; cuenta.save(update_fields=['fecha_vencimiento','veces_aplazada','actualizado_en'])
    _history(cuenta,'aplazada',usuario, aplazamiento_id=item.id); return item


@transaction.atomic
def posponer(cuenta_id, hasta, motivo, usuario=None):
    cuenta=CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    cuenta.recordatorio_pospuesto_hasta=hasta; cuenta.save(update_fields=['recordatorio_pospuesto_hasta','actualizado_en'])
    _history(cuenta,'recordatorio_pospuesto',usuario,motivo=motivo); return cuenta


@transaction.atomic
def crear_acuerdo_cuotas(cuenta_id, cuotas, usuario=None):
    cuenta=CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    if cuenta.estado not in ('pendiente','parcial'): raise ValueError('La cuenta no admite cuotas.')
    total=sum((redondear(_d(c['monto'])) for c in cuotas), Decimal('0'))
    if total != cuenta.saldo: raise ValueError('Las cuotas deben sumar el saldo pendiente.')
    CuotaCuentaPagar.objects.filter(cuenta=cuenta).delete()
    creadas=[CuotaCuentaPagar.objects.create(cuenta=cuenta,numero=i,fecha_vencimiento=c['fecha_vencimiento'],monto=redondear(_d(c['monto']))) for i,c in enumerate(cuotas,1)]
    _history(cuenta,'acuerdo_cuotas',usuario, cuotas=len(creadas)); return creadas


@transaction.atomic
def confirmar_monto(cuenta_id, monto_documento, tasa_aplicada, usuario=None):
    cuenta=CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    if not cuenta.monto_por_confirmar: raise ValueError('La cuenta no requiere confirmación de monto.')
    if cuenta.pagos.filter(estado='valido').exists(): raise ValueError('No puede confirmarse una cuenta con pagos.')
    cuenta.monto_documento=redondear(_d(monto_documento)); cuenta.tasa_aplicada=_d(tasa_aplicada); cuenta.saldo=cuenta.monto_documento; cuenta.monto_por_confirmar=False
    cuenta.actualizar_snapshots(); cuenta.save(); _history(cuenta,'monto_confirmado',usuario); return cuenta


@transaction.atomic
def anular(cuenta_id, motivo, usuario=None):
    if not motivo: raise ValueError('El motivo de anulación es obligatorio.')
    cuenta=CuentaPorPagar.objects.select_for_update().get(pk=cuenta_id)
    if cuenta.estado == 'anulada': return cuenta
    if cuenta.estado == 'pagada':
        from egresos import services as egresos
        if cuenta.origen == 'factura': egresos.revertir_pago(cuenta.id, None)
        else: egresos.anular_por_cuenta(cuenta.id, motivo)
        if cuenta.origen != 'factura': cuenta.egreso_id = None
    # Los pagos válidos de una cuenta anulada también quedan anulados.
    ahora = timezone.now()
    for pago in cuenta.pagos.select_for_update().filter(estado__in=('valido','por_aprobar')):
        pago.estado='anulado'; pago.motivo_anulacion=motivo; pago.anulado_por=usuario; pago.anulado_en=ahora
        pago.save(update_fields=['estado','motivo_anulacion','anulado_por','anulado_en'])
    cuenta.estado='anulada'; cuenta.motivo_anulacion=motivo; cuenta.anulada_por=usuario; cuenta.anulada_en=timezone.now()
    cuenta.save(update_fields=['estado','motivo_anulacion','anulada_por','anulada_en','egreso_id','actualizado_en']); _history(cuenta,'anulada',usuario,motivo=motivo); return cuenta


# API de integración para Egresos: únicamente tipos primitivos hacia afuera.
def crear_desde_egreso(datos): return crear(datos)
CAMPOS_ACTUALIZABLES_DESDE_EGRESO = ('proveedor','categoria','sede','concepto','descripcion','prioridad','fecha_emision','fecha_vencimiento')
def actualizar_desde_egreso(datos):
    datos=dict(datos); cuenta=CuentaPorPagar.objects.get(pk=datos.pop('id'))
    # Lista blanca: nunca montos, saldo, estado ni snapshots (se cambian solo vía servicios de CxP).
    campos=[k for k in datos if k in CAMPOS_ACTUALIZABLES_DESDE_EGRESO]
    for k in campos: setattr(cuenta,k,datos[k])
    
    if campos: cuenta.save(update_fields=campos+['actualizado_en'])
    return {'id':cuenta.id}
def anular_por_egreso(egreso_id, usuario_id=None, motivo=''):
    cuenta=CuentaPorPagar.objects.filter(egreso_id=egreso_id).first(); return {'id': anular(cuenta.id,motivo).id} if cuenta else None
def resumen_pagos_de_egreso(egreso_id):
    cuenta=CuentaPorPagar.objects.filter(egreso_id=egreso_id).first()
    return {'cuenta_id': cuenta.id, 'pagos': [_payload_abono(p) for p in _abonos(cuenta)]} if cuenta else None


def comprometido_abierto(usuario, sede=None):
    """Deuda abierta de CxP (pendiente/parcial, no anulada) en USD y VES.

    Respeta las sedes autorizadas del usuario y el filtro ``sede``.  Devuelve
    ``{'usd': Decimal, 'ves': Decimal, 'por_categoria': {categoria_id: {'usd','ves'}}}``.
    El saldo está en la moneda del documento y se convierte con la tasa del documento.
    """
    from cobranza.permissions import filtrar_por_sede
    cuentas = CuentaPorPagar.objects.filter(estado__in=('pendiente', 'parcial'), saldo__gt=0)
    cuentas = filtrar_por_sede(usuario, cuentas, campo='sede')
    if sede:
        cuentas = cuentas.filter(sede_id=sede)
    total = {'usd': Decimal('0.00'), 'ves': Decimal('0.00'), 'por_categoria': {}}
    for categoria_id, moneda, saldo, tasa in cuentas.values_list('categoria_id', 'moneda', 'saldo', 'tasa_aplicada'):
        usd = convertir(saldo, moneda, 'USD', tasa)
        ves = convertir(saldo, moneda, 'VES', tasa)
        fila = total['por_categoria'].setdefault(categoria_id, {'usd': Decimal('0.00'), 'ves': Decimal('0.00')})
        fila['usd'] += usd
        fila['ves'] += ves
        total['usd'] += usd
        total['ves'] += ves
    return total
