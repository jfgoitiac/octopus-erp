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
from .utils import validar_datos_bancarios

CERO = Decimal('0.00')
CENTAVO = Decimal('0.01')

METODOS_VALIDOS = {m[0] for m in Pago.METODOS}
# Métodos cuyo monto físico se recibe en bolívares (mismo criterio que
# cobranza.serializers.PagoRetroactivoSerializer.METODOS_BOLIVARES).
METODOS_BOLIVARES = {'transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'}
# Métodos bancarios: exigen banco receptor y referencia.
METODOS_BANCARIOS = {'transferencia', 'pago_movil', 'punto_de_venta', 'zelle'}

MOTIVO_MIN_CARACTERES = 10


# Cotas que respetan los max_digits de los modelos (monto_usd 10/2, monto_ves 20/2, tasa 12/4).
MAX_MONTO_USD = Decimal('99999999.99')
MAX_MONTO_VES = Decimal('999999999999999999.99')
MAX_TASA = Decimal('99999999.9999')
TASA_MIN = Decimal('0.0001')


def _dec(valor, campo, maximo=None):
    if isinstance(valor, (dict, list, bool)):
        raise ValidationError({campo: 'Debe ser un número válido.'})
    try:
        d = Decimal(str(valor))
    except Exception:
        raise ValidationError({campo: 'Debe ser un número válido.'})
    if not d.is_finite():
        raise ValidationError({campo: 'Debe ser un número válido.'})
    if maximo is not None and abs(d) > maximo:
        raise ValidationError({campo: 'El valor es demasiado grande.'})
    return d


def _entero(valor, campo):
    """Entero estricto (rechaza 'abc', {}, [], True, 1.5) → ValidationError (400)."""
    if isinstance(valor, bool) or isinstance(valor, (dict, list)):
        raise ValidationError({campo: 'Debe ser un número entero.'})
    try:
        d = Decimal(str(valor).strip())
    except Exception:
        raise ValidationError({campo: 'Debe ser un número entero.'})
    if not d.is_finite() or d != d.to_integral_value() or abs(d) > 2**62:
        raise ValidationError({campo: 'Debe ser un número entero.'})
    return int(d)


def _texto(valor, campo):
    """Texto escalar recortado ('' si viene vacío); números → str(); dict/list → error."""
    if valor is None or valor == '':
        return ''
    if isinstance(valor, (dict, list)):
        raise ValidationError({campo: 'Debe ser un texto.'})
    return str(valor).strip()


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
    """Serializa las operaciones de deuda de un representante (acepta instancia o pk).

    Orden global de locks: representante → cargos → productos/tarjeta."""
    from secretaria.models import Representante
    pk = getattr(representante, 'pk', representante)
    return Representante.objects.select_for_update().get(pk=pk)


lock_representante = _lock_representante


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
        if venta.representante_id:
            _lock_representante(venta.representante_id)  # representante antes que el cargo
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
    if not isinstance(raw, dict):
        raise ValidationError({prefijo: 'Cada línea debe ser un objeto.'})
    metodo = _texto(raw.get('metodo_pago'), f'{prefijo}.metodo_pago')
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
            tasa = _dec(tasa_raw, f'{prefijo}.tasa_aplicada', MAX_TASA).quantize(TASA_MIN)
    else:
        tasa = tasa_vigente
    if tasa is None or tasa <= 0:
        raise ValidationError({'tasa': 'No hay una tasa de cambio válida registrada.'})

    if metodo in METODOS_BOLIVARES:
        ves_raw = raw.get('monto_ves')
        if ves_raw in (None, ''):
            raise ValidationError({prefijo: f"El método '{metodo}' requiere 'monto_ves'."})
        monto_ves = _dec(ves_raw, f'{prefijo}.monto_ves', MAX_MONTO_VES).quantize(CENTAVO)
        if monto_ves <= 0:
            raise ValidationError({prefijo: 'El monto debe ser mayor a cero.'})
        monto_usd = (monto_ves / tasa).quantize(CENTAVO)
    else:
        usd_raw = raw.get('monto_usd')
        if usd_raw in (None, ''):
            raise ValidationError({prefijo: f"El método '{metodo}' requiere 'monto_usd'."})
        monto_usd = _dec(usd_raw, f'{prefijo}.monto_usd', MAX_MONTO_USD).quantize(CENTAVO)
        if monto_usd <= 0:
            raise ValidationError({prefijo: 'El monto debe ser mayor a cero.'})
        monto_ves = (monto_usd * tasa).quantize(CENTAVO)

    if monto_usd <= 0:
        raise ValidationError({prefijo: 'El monto en USD resultante es cero; indique un monto mayor.'})
    if monto_usd > MAX_MONTO_USD or monto_ves > MAX_MONTO_VES:
        raise ValidationError({prefijo: 'El monto es demasiado grande.'})

    banco = None
    banco_id = raw.get('banco_receptor')
    if banco_id not in (None, ''):
        banco_pk = _entero(banco_id, f'{prefijo}.banco_receptor')
        banco = BancoInstitucional.objects.filter(pk=banco_pk, activo=True).first()
        if banco is None:
            raise ValidationError({prefijo: 'El banco receptor indicado no existe o está inactivo.'})

    # La referencia solo cuenta en métodos bancarios; en efectivo se ignora
    # (así no participa del chequeo de duplicados).
    referencia = _texto(raw.get('referencia'), f'{prefijo}.referencia') if metodo in METODOS_BANCARIOS else ''
    lote = _texto(raw.get('numero_lote'), f'{prefijo}.numero_lote')
    procedencia = _texto(raw.get('banco_procedencia'), f'{prefijo}.banco_procedencia')

    if metodo in METODOS_BANCARIOS and banco is None:
        raise ValidationError({prefijo: f"El método '{metodo}' requiere el banco receptor."})
    # Mismas reglas que venta/recarga (referencia 4/6 dígitos, lote 4 dígitos);
    # también chequea duplicados contra el resto del sistema.
    errores, ref_norm = validar_datos_bancarios(metodo, referencia, lote, banco)
    if errores:
        raise ValidationError({prefijo: next(iter(errores.values()))})

    return {
        'metodo_pago': metodo,
        'monto_usd': monto_usd,
        'tasa_aplicada': tasa,
        'monto_ves': monto_ves,
        'banco_receptor': banco,
        'banco_procedencia': procedencia or None,
        'referencia': ref_norm or None,
        'numero_lote': lote or None,
    }


def _chequear_duplicados(normalizadas):
    """Referencias repetidas dentro del propio abono y contra el resto del sistema."""
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


def _ajustar_redondeo_bs(normalizadas, saldo):
    """Un pago en Bs "completo" puede quedar a ±$0.01 del saldo por redondeo de la
    tasa: se ajusta la última línea en Bs para que el total calce con el saldo."""
    total = sum((ln['monto_usd'] for ln in normalizadas), CERO)
    diferencia = saldo - total
    if diferencia == 0 or abs(diferencia) > CENTAVO:
        return
    for ln in reversed(normalizadas):
        if ln['metodo_pago'] in METODOS_BOLIVARES and ln['monto_usd'] + diferencia > 0:
            ln['monto_usd'] += diferencia
            return


def registrar_abono(*, representante, lineas, cajero, apertura, fecha_pago=None, motivo='', area=None):
    """Registra un abono (posiblemente mixto) y lo aplica FIFO. Devuelve las líneas creadas.

    `apertura=None` significa pago retroactivo (D8): exige `fecha_pago` pasada
    dentro del período activo, `motivo` >= 10 caracteres y tasa explícita en
    las líneas en bolívares; no altera el arqueo de ninguna caja. Solo se
    saldan cargos con `creado_en <= fecha_pago`. `area` solo se usa en
    retroactivo (en caja el área es la de la apertura, D9); si no se indica,
    se toma el área del cargo pendiente más antiguo.
    """
    if not lineas or not isinstance(lineas, (list, tuple)):
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

    with transaction.atomic():
        representante = _lock_representante(representante)

        # Comprobación de duplicados ya con el representante bloqueado (carreras entre cajas).
        _chequear_duplicados(normalizadas)

        cargos_qs = (
            CargoCantina.objects.select_for_update()
            .filter(representante=representante, estado='pendiente')
        )
        if retroactivo:
            cargos_qs = cargos_qs.filter(creado_en__lte=fecha_pago)
        cargos = list(cargos_qs.order_by('creado_en', 'id'))
        saldo = sum((c.monto_usd - c.monto_pagado for c in cargos), CERO)
        if saldo <= 0:
            raise ValidationError({
                'detail': (
                    'El representante no tiene deuda pendiente en cantina/librería'
                    + (' a la fecha del pago indicada.' if retroactivo else '.')
                ),
            })
        _ajustar_redondeo_bs(normalizadas, saldo)
        total = sum((ln['monto_usd'] for ln in normalizadas), CERO)
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
    """Anula todas las líneas de la operación y revierte sus aplicaciones.

    Orden de locks: representante → cargos afectados (una sola consulta,
    ordenados por (creado_en, id), igual que registrar_abono) → abonos."""
    representante_id = (
        AbonoCantina.objects.filter(operacion_uuid=operacion_uuid)
        .values_list('representante_id', flat=True).first()
    )
    if representante_id is None:
        raise ValidationError({'detail': 'No existe un abono con ese identificador.'})

    with transaction.atomic():
        _lock_representante(representante_id)
        abonos = list(
            AbonoCantina.objects.select_for_update().filter(operacion_uuid=operacion_uuid)
        )
        if not abonos:
            raise ValidationError({'detail': 'No existe un abono con ese identificador.'})
        activos = [a for a in abonos if a.estatus == 'completado']
        if not activos:
            raise ValidationError({'detail': 'El abono ya está anulado.'})

        aplicaciones = list(AplicacionAbonoCantina.objects.filter(abono__in=activos))
        cargos = {
            c.pk: c for c in CargoCantina.objects.select_for_update()
            .filter(pk__in={a.cargo_id for a in aplicaciones})
            .order_by('creado_en', 'id')
        }
        for app in aplicaciones:
            cargos[app.cargo_id].monto_pagado -= app.monto_usd
        for cargo in cargos.values():
            cargo.save(update_fields=['monto_pagado'])

        ahora = timezone.now()
        motivo = (motivo or '').strip()
        for abono in activos:
            abono.estatus = 'anulado'
            abono.anulado_por = usuario
            abono.anulado_en = ahora
            if motivo:
                abono.motivo = f'{abono.motivo}\n[ANULADO] {motivo}'.strip()
            abono.save(update_fields=['estatus', 'anulado_por', 'anulado_en', 'motivo'])
