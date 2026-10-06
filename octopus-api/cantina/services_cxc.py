"""Servicio de cuentas por cobrar a representantes (cantina/librería).

Contrato fijado en la Fase 0 (PROMPT_CANTINA_CXC.md §3.2). Todas las
operaciones que mutan deuda corren en `transaction.atomic()` con
`select_for_update()` sobre el representante y sus cargos, para que dos
cajas cobrando al mismo representante a la vez no se pisen.

Los errores de negocio se lanzan como `rest_framework.exceptions.ValidationError`
(→ HTTP 400 en cualquier vista DRF; dentro de `transaction.atomic()` provocan
rollback completo).
"""
import uuid
from datetime import datetime, time
from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from cobranza.correcciones import fecha_dentro_periodo_activo
from cobranza.models import BancoInstitucional, Pago, TasaCambio
from pagos_comunes.referencias import buscar_referencia_duplicada, normalizar_referencia

from .models import (
    AbonoCantina,
    AplicacionAbonoCantina,
    CargoCantina,
    CreditoRepresentanteCantina,
    ParametroCantina,
)

CERO = Decimal('0.00')
CENTAVO = Decimal('0.01')

METODOS_VALIDOS = {m[0] for m in Pago.METODOS}
# Métodos cuyo monto físico se recibe en bolívares (mismo criterio que
# cobranza.serializers.PagoRetroactivoSerializer.METODOS_BOLIVARES).
METODOS_BOLIVARES = {'transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'}
# Métodos bancarios: exigen banco receptor y referencia.
METODOS_BANCARIOS = {'transferencia', 'pago_movil', 'punto_de_venta', 'zelle'}

MOTIVO_MIN_CARACTERES = 10


def _dec(valor, campo):
    try:
        d = Decimal(str(valor))
    except Exception:
        raise ValidationError({campo: 'Debe ser un número válido.'})
    if not d.is_finite():
        raise ValidationError({campo: 'Debe ser un número válido.'})
    return d


# ─────────────────────────────────────────────
# Consultas
# ─────────────────────────────────────────────
def saldo_representante(representante, area=None):
    """Σ(monto_usd − monto_pagado) de los cargos no anulados (opcionalmente de un área)."""
    qs = CargoCantina.objects.filter(representante=representante).exclude(estado='anulado')
    if area:
        qs = qs.filter(area=area)
    total = qs.aggregate(
        t=Sum(ExpressionWrapper(F('monto_usd') - F('monto_pagado'), output_field=DecimalField(max_digits=12, decimal_places=2)))
    )['t']
    return total or CERO


def limite_credito(representante):
    """Límite USD: override en CreditoRepresentanteCantina o el default de ParametroCantina."""
    credito = CreditoRepresentanteCantina.objects.filter(representante=representante).first()
    if credito is not None and credito.limite_usd is not None:
        return credito.limite_usd
    parametro = ParametroCantina.objects.first()
    if parametro is not None:
        return parametro.limite_credito_representante_default
    return ParametroCantina._meta.get_field('limite_credito_representante_default').default


def _lock_representante(representante):
    """Serializa las operaciones de deuda de un representante."""
    from secretaria.models import Representante
    return Representante.objects.select_for_update().get(pk=representante.pk)


# ─────────────────────────────────────────────
# Cargos
# ─────────────────────────────────────────────
def crear_cargo_por_venta(venta):
    """Crea el CargoCantina de una venta 'credito_representante' (valida bloqueo y límite).
    Se llama dentro de la transacción de RegistrarVentaView."""
    if venta.metodo_pago != 'credito_representante' or not venta.representante_id:
        raise ValidationError({'detail': 'La venta no es un cargo a cuenta de un representante.'})

    with transaction.atomic():
        representante = _lock_representante(venta.representante)

        credito = CreditoRepresentanteCantina.objects.filter(representante=representante).first()
        if credito is not None and credito.bloqueado:
            raise ValidationError({
                'representante_id': 'La cuenta de este representante está bloqueada para ventas a crédito.',
            })

        limite = limite_credito(representante)
        saldo = saldo_representante(representante)
        if saldo + venta.total_usd > limite:
            disponible = max(limite - saldo, CERO)
            raise ValidationError({
                'representante_id': (
                    f'El cargo excede el límite de crédito del representante '
                    f'(límite ${limite:.2f}, deuda actual ${saldo:.2f}, disponible ${disponible:.2f}).'
                ),
            })

        return CargoCantina.objects.create(
            representante=representante,
            alumno=venta.alumno,
            venta=venta,
            area=venta.area,
            monto_usd=venta.total_usd,
        )


def anular_cargo_por_venta(venta, usuario):
    """Anula el cargo de una venta a crédito; falla si ya tiene aplicaciones."""
    with transaction.atomic():
        cargo = CargoCantina.objects.select_for_update().filter(venta=venta).first()
        if cargo is None or cargo.estado == 'anulado':
            return
        if cargo.aplicaciones.filter(abono__estatus='completado').exists():
            raise ValidationError({
                'detail': (
                    'Esta venta ya tiene abonos aplicados a su cargo. '
                    'Anule primero el abono correspondiente.'
                ),
            })
        cargo.estado = 'anulado'
        cargo.save(update_fields=['estado'])


# ─────────────────────────────────────────────
# Abonos
# ─────────────────────────────────────────────
def _resolver_fecha_retroactiva(fecha_pago):
    if fecha_pago is None:
        raise ValidationError({'fecha_pago': 'El pago retroactivo requiere la fecha real del pago.'})
    if not isinstance(fecha_pago, datetime):
        fecha_pago = datetime.combine(fecha_pago, time(12, 0))
    if timezone.is_naive(fecha_pago):
        fecha_pago = timezone.make_aware(fecha_pago)
    if timezone.localtime(fecha_pago).date() > timezone.localdate():
        raise ValidationError({'fecha_pago': 'La fecha del pago no puede ser futura.'})
    dentro, error = fecha_dentro_periodo_activo(fecha_pago)
    if not dentro:
        raise ValidationError({'fecha_pago': error})
    return fecha_pago


def _normalizar_linea(raw, idx, *, retroactivo, tasa_vigente):
    """Valida una línea y devuelve un dict listo para crear el AbonoCantina."""
    prefijo = f'lineas[{idx}]'
    metodo = (raw.get('metodo_pago') or '').strip()
    if metodo not in METODOS_VALIDOS:
        raise ValidationError({prefijo: f"Método de pago inválido: '{metodo}'."})

    # Tasa: en caja siempre la vigente (snapshot); en retroactivo la indicada.
    if retroactivo:
        tasa_raw = raw.get('tasa_aplicada')
        if tasa_raw in (None, ''):
            if metodo in METODOS_BOLIVARES:
                raise ValidationError({
                    prefijo: 'El pago retroactivo en bolívares requiere indicar la tasa aplicada.',
                })
            tasa = tasa_vigente
        else:
            tasa = _dec(tasa_raw, f'{prefijo}.tasa_aplicada')
    else:
        tasa = tasa_vigente
    if tasa is None or tasa <= 0:
        raise ValidationError({'tasa': 'No hay una tasa de cambio válida registrada.'})

    if metodo in METODOS_BOLIVARES:
        ves_raw = raw.get('monto_ves')
        if ves_raw in (None, ''):
            raise ValidationError({prefijo: f"El método '{metodo}' requiere 'monto_ves'."})
        monto_ves = _dec(ves_raw, f'{prefijo}.monto_ves').quantize(CENTAVO)
        if monto_ves <= 0:
            raise ValidationError({prefijo: 'El monto debe ser mayor a cero.'})
        monto_usd = (monto_ves / tasa).quantize(CENTAVO)
    else:
        usd_raw = raw.get('monto_usd')
        if usd_raw in (None, ''):
            raise ValidationError({prefijo: f"El método '{metodo}' requiere 'monto_usd'."})
        monto_usd = _dec(usd_raw, f'{prefijo}.monto_usd').quantize(CENTAVO)
        if monto_usd <= 0:
            raise ValidationError({prefijo: 'El monto debe ser mayor a cero.'})
        monto_ves = (monto_usd * tasa).quantize(CENTAVO)

    if monto_usd <= 0:
        raise ValidationError({prefijo: 'El monto en USD resultante es cero; indique un monto mayor.'})

    banco = None
    referencia = (raw.get('referencia') or '').strip()
    lote = (raw.get('numero_lote') or '').strip()
    banco_id = raw.get('banco_receptor')
    if banco_id not in (None, ''):
        banco = BancoInstitucional.objects.filter(pk=banco_id, activo=True).first()
        if banco is None:
            raise ValidationError({prefijo: 'El banco receptor indicado no existe o está inactivo.'})

    if metodo in METODOS_BANCARIOS:
        if banco is None:
            raise ValidationError({prefijo: f"El método '{metodo}' requiere el banco receptor."})
        if not referencia:
            raise ValidationError({prefijo: f"El método '{metodo}' requiere número de referencia."})
    if metodo == 'punto_de_venta' and (not lote.isdigit() or len(lote) != 4):
        raise ValidationError({prefijo: 'Punto de Venta requiere un número de lote de 4 dígitos.'})

    ref_norm = normalizar_referencia(referencia) if referencia else None
    return {
        'metodo_pago': metodo,
        'monto_usd': monto_usd,
        'tasa_aplicada': tasa,
        'monto_ves': monto_ves,
        'banco_receptor': banco,
        'banco_procedencia': (raw.get('banco_procedencia') or '').strip() or None,
        'referencia': ref_norm,
        'numero_lote': lote or None,
    }


def registrar_abono(*, representante, lineas, cajero, apertura, fecha_pago=None, motivo='', area=None):
    """Registra un abono (posiblemente mixto) y lo aplica FIFO. Devuelve las líneas creadas.

    `apertura=None` significa pago retroactivo (D8): exige `fecha_pago` pasada
    dentro del período activo, `motivo` >= 10 caracteres y tasa explícita en
    las líneas en bolívares; no altera el arqueo de ninguna caja. `area` solo
    se usa en retroactivo (en caja el área es la de la apertura, D9); si no se
    indica, se toma el área del cargo pendiente más antiguo.
    """
    if not lineas:
        raise ValidationError({'lineas': 'Debe indicar al menos una línea de pago.'})

    retroactivo = apertura is None
    motivo = (motivo or '').strip()
    if retroactivo:
        if len(motivo) < MOTIVO_MIN_CARACTERES:
            raise ValidationError({'motivo': f'El motivo es obligatorio (mínimo {MOTIVO_MIN_CARACTERES} caracteres).'})
        fecha_pago = _resolver_fecha_retroactiva(fecha_pago)
    else:
        if apertura.estado != 'abierta':
            raise ValidationError({'detail': 'La apertura de caja no está abierta.'})
        fecha_pago = timezone.now()

    tasa_obj = TasaCambio.objects.order_by('-fecha').first()
    tasa_vigente = tasa_obj.valor_bs if tasa_obj else None
    if tasa_vigente is None and not retroactivo:
        raise ValidationError({'tasa': 'No se ha registrado ninguna tasa de cambio.'})

    normalizadas = [
        _normalizar_linea(raw, i, retroactivo=retroactivo, tasa_vigente=tasa_vigente)
        for i, raw in enumerate(lineas)
    ]

    # Referencias: duplicadas entre las propias líneas y contra el resto del sistema.
    vistas = set()
    for i, ln in enumerate(normalizadas):
        if not ln['referencia']:
            continue
        banco_id = ln['banco_receptor'].id if ln['banco_receptor'] else None
        clave = (ln['referencia'], ln['metodo_pago'], banco_id)
        if clave in vistas:
            raise ValidationError({
                f'lineas[{i}]': f"La referencia '{ln['referencia']}' está repetida dentro de este mismo abono.",
            })
        vistas.add(clave)
        dup = buscar_referencia_duplicada(
            ln['referencia'], metodo_pago=ln['metodo_pago'], banco_receptor_id=banco_id,
        )
        if dup:
            raise ValidationError({
                f'lineas[{i}]': (
                    f"La referencia '{ln['referencia']}' ya está en uso en {dup['origen']} "
                    f"(#{dup['id']}, {dup['detalle']}). Si cree que es un error, contacte al administrador."
                ),
            })

    with transaction.atomic():
        representante = _lock_representante(representante)
        cargos = list(
            CargoCantina.objects.select_for_update()
            .filter(representante=representante, estado='pendiente')
            .order_by('creado_en', 'id')
        )
        saldo = sum((c.monto_usd - c.monto_pagado for c in cargos), CERO)
        total = sum((ln['monto_usd'] for ln in normalizadas), CERO)
        if saldo <= 0:
            raise ValidationError({'detail': 'El representante no tiene deuda pendiente en cantina/librería.'})
        if total > saldo:
            raise ValidationError({
                'lineas': f'El abono (${total:.2f}) excede la deuda pendiente (${saldo:.2f}); no se admite saldo a favor.',
            })

        if apertura is not None:
            area_abono = apertura.area
        else:
            area_abono = area or cargos[0].area
        operacion = uuid.uuid4()

        creados = []
        indice = 0
        pendiente_cargo = {c.pk: c.monto_usd - c.monto_pagado for c in cargos}
        for ln in normalizadas:
            abono = AbonoCantina.objects.create(
                operacion_uuid=operacion,
                representante=representante,
                area=area_abono,
                apertura=apertura,
                fecha_pago=fecha_pago,
                es_retroactivo=retroactivo,
                motivo=motivo,
                cajero=cajero,
                **ln,
            )
            restante = ln['monto_usd']
            while restante > 0:
                cargo = cargos[indice]
                disponible = pendiente_cargo[cargo.pk]
                if disponible <= 0:
                    indice += 1
                    continue
                aplicar = min(restante, disponible)
                AplicacionAbonoCantina.objects.create(abono=abono, cargo=cargo, monto_usd=aplicar)
                cargo.monto_pagado += aplicar
                cargo.save(update_fields=['monto_pagado'])
                pendiente_cargo[cargo.pk] = disponible - aplicar
                restante -= aplicar
            creados.append(abono)
        return creados


def anular_abono(operacion_uuid, usuario, motivo=''):
    """Anula todas las líneas de la operación y revierte sus aplicaciones."""
    with transaction.atomic():
        abonos = list(
            AbonoCantina.objects.select_for_update().filter(operacion_uuid=operacion_uuid)
        )
        if not abonos:
            raise ValidationError({'detail': 'No existe un abono con ese identificador.'})
        activos = [a for a in abonos if a.estatus == 'completado']
        if not activos:
            raise ValidationError({'detail': 'El abono ya está anulado.'})

        ahora = timezone.now()
        motivo = (motivo or '').strip()
        for abono in activos:
            for app in abono.aplicaciones.select_related('cargo'):
                cargo = CargoCantina.objects.select_for_update().get(pk=app.cargo_id)
                cargo.monto_pagado -= app.monto_usd
                cargo.save(update_fields=['monto_pagado'])
            abono.estatus = 'anulado'
            abono.anulado_por = usuario
            abono.anulado_en = ahora
            if motivo:
                abono.motivo = f'{abono.motivo}\n[ANULADO] {motivo}'.strip()
            abono.save(update_fields=['estatus', 'anulado_por', 'anulado_en', 'motivo'])
