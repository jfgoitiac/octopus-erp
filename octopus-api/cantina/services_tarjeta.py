"""
Servicio ÚNICO para modificar TarjetaPrepago.saldo, y para generar el
token opaco (`codigo`) que codifica el QR de cada tarjeta (§5.1 de
cantina.md).

Toda recarga, consumo, ajuste o reverso debe pasar por aquí — nunca tocar
`TarjetaPrepago.saldo` directamente — para que quede registrado en
MovimientoTarjeta y para que el límite de crédito y `saldo_negativo_desde`
se mantengan consistentes bajo concurrencia (dos ventas casi simultáneas
sobre la misma tarjeta, ej. dos cajas del colegio).
"""
import secrets
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import MovimientoTarjeta, TarjetaPrepago

TIPOS_QUE_SUMAN = ('recarga', 'reverso')

# Base32 sin ambigüedad: sin 0/O, 1/I/L (§5.1 de cantina.md) — evita que un
# cajero que tenga que teclear el código a mano (QR dañado) confunda
# caracteres visualmente parecidos.
ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
PREFIJO_CODIGO = 'CANT-'
LONGITUD_CODIGO = 10
MAX_INTENTOS_GENERACION = 20


class GeneracionCodigoError(Exception):
    """No se pudo generar un `codigo` único tras varios intentos (colisión persistente)."""


def _nuevo_token():
    sufijo = ''.join(secrets.choice(ALFABETO_CODIGO) for _ in range(LONGITUD_CODIGO))
    return f'{PREFIJO_CODIGO}{sufijo}'


def generar_codigo_tarjeta():
    """
    Genera un token opaco y criptográficamente aleatorio (`secrets.choice`)
    para `TarjetaPrepago.codigo`, con reintento ante colisión contra el
    `unique=True` del campo. Nunca es secuencial ni deriva de datos del
    alumno — ver §5.1/§10 de cantina.md.
    """
    for _ in range(MAX_INTENTOS_GENERACION):
        candidato = _nuevo_token()
        if not TarjetaPrepago.objects.filter(codigo=candidato).exists():
            return candidato
    raise GeneracionCodigoError(
        f'No se pudo generar un código único de tarjeta tras {MAX_INTENTOS_GENERACION} intentos.'
    )


class SaldoInsuficienteError(ValidationError):
    """Un 'consumo' dejaría el saldo por debajo de -limite_credito de la tarjeta."""


@transaction.atomic
def aplicar_movimiento_tarjeta(tarjeta, tipo, monto, *, venta=None, recarga=None, usuario=None):
    """
    Aplica un movimiento de saldo sobre `tarjeta` y devuelve el MovimientoTarjeta creado.

    - 'recarga' y 'reverso': `monto` (positivo) suma al saldo.
    - 'consumo': `monto` (positivo) resta del saldo; si el resultado queda por
      debajo de -tarjeta.limite_credito, se lanza SaldoInsuficienteError sin
      escribir nada (ni movimiento ni cambio de saldo).
    - 'ajuste': `monto` trae su propio signo (puede ser positivo o negativo) y
      se suma directo al saldo — es una corrección manual, no una compra ni
      una recarga, así que no tiene un signo implícito por el tipo.

    select_for_update() bloquea la fila de la tarjeta hasta que termine la
    transacción, para evitar que dos ventas casi simultáneas lean el mismo
    saldo_antes y ambas pasen la validación del límite de crédito.
    """
    monto = Decimal(monto)
    tarjeta = TarjetaPrepago.objects.select_for_update().get(pk=tarjeta.pk)

    saldo_antes = tarjeta.saldo
    if tipo in TIPOS_QUE_SUMAN:
        saldo_despues = saldo_antes + monto
    elif tipo == 'consumo':
        saldo_despues = saldo_antes - monto
    elif tipo == 'ajuste':
        saldo_despues = saldo_antes + monto
    else:
        raise ValueError(f"Tipo de movimiento inválido: {tipo!r}")

    if tipo == 'consumo' and saldo_despues < -tarjeta.limite_credito:
        raise SaldoInsuficienteError(
            f"El consumo de {monto} excede el límite de crédito de la tarjeta "
            f"{tarjeta.serial} (saldo actual {saldo_antes}, límite {tarjeta.limite_credito})."
        )

    movimiento = MovimientoTarjeta.objects.create(
        tarjeta=tarjeta,
        tipo=tipo,
        monto=monto,
        saldo_antes=saldo_antes,
        saldo_despues=saldo_despues,
        venta=venta,
        recarga=recarga,
        usuario=usuario,
    )

    tarjeta.saldo = saldo_despues
    if saldo_despues < 0 and tarjeta.saldo_negativo_desde is None:
        tarjeta.saldo_negativo_desde = date.today()
    elif saldo_despues >= 0 and tarjeta.saldo_negativo_desde is not None:
        tarjeta.saldo_negativo_desde = None
    tarjeta.save(update_fields=['saldo', 'saldo_negativo_desde', 'actualizado_en'])

    return movimiento
