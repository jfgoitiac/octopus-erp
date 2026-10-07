"""Reglas transaccionales de Egresos; no dependen de modelos de CxP."""
from decimal import Decimal
from django.apps import apps
from django.db import IntegrityError, transaction
from django.utils import timezone
from finanzas.monedas import convertir, redondear, tasa_para_fecha
from .models import (ArticuloFrecuente, BitacoraEgreso, DetallePagoCuentaPorPagar,
                     Egreso, RenglonEgreso)


def _d(valor, defecto='0'):
    return Decimal(str(valor if valor not in (None, '') else defecto))


def calcular_totales(datos):
    """Única fuente de totales para vista previa y persistencia, sin floats."""
    renglones = datos.get('renglones') or []
    totales_renglones = []
    for renglon in renglones:
        bruto = _d(renglon.get('cantidad'), 1) * _d(renglon.get('precio_unitario'))
        descuento = _d(renglon.get('descuento'))
        if descuento < 0 or descuento > bruto:
            raise ValueError('El descuento debe estar entre cero y el importe del renglón.')
        totales_renglones.append(redondear(bruto - descuento))
    subtotal = sum(totales_renglones, Decimal('0'))
    subtotal = redondear(subtotal if renglones else _d(datos.get('subtotal')))
    iva = redondear(subtotal * _d(datos.get('porcentaje_iva')) / Decimal('100'))
    igtf = redondear(subtotal * _d(datos.get('porcentaje_igtf')) / Decimal('100')) if datos.get('aplica_igtf') else Decimal('0')
    ret_iva = redondear(iva * _d(datos.get('porcentaje_retencion_iva')) / Decimal('100')) if datos.get('retiene_iva') else Decimal('0')
    ret_islr = redondear(subtotal * _d(datos.get('porcentaje_retencion_islr')) / Decimal('100')) if datos.get('retiene_islr') else Decimal('0')
    total = redondear(subtotal + iva + igtf)
    tasa = _d(datos.get('tasa_aplicada'))
    moneda = datos.get('moneda', 'USD')
    usd = total if moneda == 'USD' else convertir(total, 'VES', 'USD', tasa)
    ves = total if moneda == 'VES' else convertir(total, 'USD', 'VES', tasa)
    return {'subtotal': subtotal, 'monto_iva': iva, 'monto_igtf': igtf, 'monto_retencion_iva': ret_iva,
            'monto_retencion_islr': ret_islr, 'total_documento': total,
            'total_pagado': redondear(total-ret_iva-ret_islr), 'monto_usd': redondear(usd), 'monto_ves': redondear(ves),
            'tasa_aplicada': tasa}


def _snapshot(egreso):
    return {'estado': egreso.estado, 'total_documento': str(egreso.total_documento), 'fecha_egreso': str(egreso.fecha_egreso or '')}


def _bitacora(egreso, accion, usuario=None, antes=None, despues=None):
    BitacoraEgreso.objects.create(egreso=egreso, accion=accion, usuario=usuario, antes=antes or {}, despues=despues or {})


def _actualizar_articulos(egreso, usuario=None):
    for renglon in egreso.renglones.all():
        articulo, _ = ArticuloFrecuente.objects.get_or_create(nombre=renglon.descripcion, proveedor=egreso.proveedor,
            categoria=egreso.categoria, defaults={'creado_por': usuario})
        renglon.articulo = articulo
        renglon.save(update_fields=['articulo'])


@transaction.atomic
def guardar_contado(egreso, datos=None, usuario=None):
    if egreso.origen != 'factura' or egreso.condicion != 'contado':
        raise ValueError('Solo se puede registrar un egreso directo de contado.')
    if not egreso.fecha_egreso:
        raise ValueError('La fecha de egreso es obligatoria.')
    antes = _snapshot(egreso)
    totales = calcular_totales(datos or {'renglones': list(egreso.renglones.values()) , 'moneda': egreso.moneda,
        'tasa_aplicada': egreso.tasa_aplicada, 'porcentaje_iva': egreso.porcentaje_iva, 'aplica_igtf': egreso.aplica_igtf,
        'retiene_iva': egreso.retiene_iva, 'porcentaje_retencion_iva': egreso.porcentaje_retencion_iva,
        'retiene_islr': egreso.retiene_islr, 'porcentaje_retencion_islr': egreso.porcentaje_retencion_islr})
    for campo, valor in totales.items(): setattr(egreso, campo, valor)
    # Los reportes suman lo realmente desembolsado (después de retenciones),
    # no el total documental. También se congelan ambos equivalentes aquí.
    if egreso.moneda == 'USD':
        egreso.monto_usd_pagado = totales['total_pagado']
        egreso.monto_ves_pagado = convertir(totales['total_pagado'], 'USD', 'VES', egreso.tasa_aplicada)
    else:
        egreso.monto_ves_pagado = totales['total_pagado']
        egreso.monto_usd_pagado = convertir(totales['total_pagado'], 'VES', 'USD', egreso.tasa_aplicada)
    egreso.estado = 'registrado'
    egreso.full_clean(); egreso.save()
    _actualizar_articulos(egreso, usuario)
    _bitacora(egreso, 'registrado', usuario, antes, _snapshot(egreso))
    return egreso


@transaction.atomic
def anular(egreso, motivo, usuario=None, desde_cuenta=False):
    if egreso.origen == 'cuenta_por_pagar' and not desde_cuenta:
        raise ValueError('Los egresos originados en CxP solo se anulan desde CxP.')
    if not motivo: raise ValueError('El motivo de anulación es obligatorio.')
    antes = _snapshot(egreso); egreso.estado='anulado'; egreso.motivo_anulacion=motivo; egreso.anulado_por=usuario; egreso.anulado_en=timezone.now()
    egreso.save(update_fields=['estado','motivo_anulacion','anulado_por','anulado_en','actualizado_en'])
    _bitacora(egreso, 'anulado', usuario, antes, _snapshot(egreso)); return egreso


@transaction.atomic
def duplicar(egreso, usuario=None):
    if egreso.origen != 'factura': raise ValueError('Solo se duplican facturas de contado.')
    campos = [f.name for f in Egreso._meta.fields if f.name not in ('id','numero_documento','estado','fecha_egreso','tasa_pago','metodo_pago','banco_pago','referencia_pago','creado_en','actualizado_en','anulado_por','anulado_en','motivo_anulacion')]
    nuevo = Egreso(**{c:getattr(egreso,c) for c in campos}); nuevo.numero_documento=''; nuevo.estado='borrador'; nuevo.fecha_egreso=None; nuevo.creado_por=usuario; nuevo.save()
    for r in egreso.renglones.all(): RenglonEgreso.objects.create(egreso=nuevo, descripcion=r.descripcion, cantidad=r.cantidad, precio_unitario=r.precio_unitario, descuento=r.descuento, total=r.total, orden=r.orden)
    _bitacora(nuevo, 'duplicado', usuario, {}, {'origen_id': egreso.id}); return nuevo


def marcar_pagado(cuenta_por_pagar_id, abono):
    """La llamada parcial nunca crea un egreso; el llamador conserva sus abonos."""
    if not apps.is_installed('cuentas_por_pagar'): return {'cuenta_por_pagar_id': cuenta_por_pagar_id, 'egreso_creado': False}
    return {'cuenta_por_pagar_id': cuenta_por_pagar_id, 'egreso_creado': False, 'abono': abono}


@transaction.atomic
def crear_desde_cuenta_pagada(cuenta_por_pagar_id, cuenta, abonos):
    """Crea/actualiza idempotentemente el único resumen final de una cuenta saldada."""
    defaults = dict(cuenta)
    # Se calculan los snapshots antes de persistir: el constraint del modelo no
    # admite un estado registrado sin fecha de egreso, ni siquiera transitoriamente.
    if not abonos:
        raise ValueError('Una cuenta saldada requiere al menos un abono.')
    usd = sum((_d(a['monto_usd']) for a in abonos), Decimal('0'))
    ves = sum((_d(a['monto_ves']) for a in abonos), Decimal('0'))
    ultimo = max(a['fecha_pago'] for a in abonos)
    moneda = defaults.get('moneda', 'USD')
    total_documento = redondear(usd if moneda == 'USD' else ves)
    try: egreso = Egreso.objects.select_for_update().get(cuenta_por_pagar_id=cuenta_por_pagar_id, origen='cuenta_por_pagar')
    except Egreso.DoesNotExist:
        defaults.update(
            origen='cuenta_por_pagar', cuenta_por_pagar_id=cuenta_por_pagar_id,
            condicion='contado', estado='registrado', fecha_egreso=ultimo,
            monto_usd_pagado=redondear(usd), monto_ves_pagado=redondear(ves),
            monto_usd=redondear(usd), monto_ves=redondear(ves),
            total_documento=total_documento, total_pagado=total_documento,
        )
        # Un savepoint permite recuperarse de la carrera de unicidad sin dejar
        # marcada la transacción externa como rota.
        try:
            with transaction.atomic():
                egreso = Egreso.objects.create(**defaults)
            creado = True
        except IntegrityError:
            egreso = Egreso.objects.select_for_update().get(
                cuenta_por_pagar_id=cuenta_por_pagar_id, origen='cuenta_por_pagar'
            )
            creado = False
    else: creado=False
    DetallePagoCuentaPorPagar.objects.filter(egreso=egreso).delete()
    for a in abonos:
        DetallePagoCuentaPorPagar.objects.create(egreso=egreso, fecha_pago=a['fecha_pago'], moneda=a['moneda'], tasa_aplicada=a['tasa_aplicada'], metodo_pago=a['metodo_pago'], banco=a.get('banco',''), referencia=a.get('referencia',''), monto_documento=a['monto_documento'], monto_usd=a['monto_usd'], monto_ves=a['monto_ves'], comprobantes=a.get('comprobantes',[]))
    egreso.fecha_egreso=ultimo; egreso.monto_usd_pagado=redondear(usd); egreso.monto_ves_pagado=redondear(ves); egreso.monto_usd=redondear(usd); egreso.monto_ves=redondear(ves)
    egreso.total_documento = total_documento; egreso.total_pagado=total_documento; egreso.estado='registrado'; egreso.save()
    _bitacora(egreso, 'sincronizado_cxp', None, {}, {'abonos':len(abonos)})
    return {'egreso_id': egreso.id, 'creado': creado, 'monto_usd_pagado': str(egreso.monto_usd_pagado), 'monto_ves_pagado': str(egreso.monto_ves_pagado), 'abonos':len(abonos)}


@transaction.atomic
def revertir_pago(cuenta_por_pagar_id, abono_id):
    egreso=Egreso.objects.select_for_update().filter(cuenta_por_pagar_id=cuenta_por_pagar_id, origen='cuenta_por_pagar').first()
    if not egreso: return None
    egreso.pagos_cuenta_por_pagar.filter(pk=abono_id).delete()
    if not egreso.pagos_cuenta_por_pagar.exists(): return anular(egreso, 'Reversión de pago CxP', desde_cuenta=True)
    pagos=list(egreso.pagos_cuenta_por_pagar.values('fecha_pago','moneda','tasa_aplicada','metodo_pago','banco','referencia','monto_documento','monto_usd','monto_ves','comprobantes'))
    return crear_desde_cuenta_pagada(cuenta_por_pagar_id, {'proveedor':egreso.proveedor,'categoria':egreso.categoria,'sede':egreso.sede,'tipo_documento':egreso.tipo_documento,'numero_documento':egreso.numero_documento,'fecha_emision':egreso.fecha_emision,'moneda':egreso.moneda,'tasa_aplicada':egreso.tasa_aplicada}, pagos)


def anular_por_cuenta(cuenta_por_pagar_id, motivo):
    e=Egreso.objects.filter(cuenta_por_pagar_id=cuenta_por_pagar_id, origen='cuenta_por_pagar').first()
    return anular(e, motivo, desde_cuenta=True) if e else None
