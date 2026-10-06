"""Servicio de cuentas por cobrar a representantes (cantina/librería).

Contrato fijado en la Fase 0 (PROMPT_CANTINA_CXC.md §3.2). Todas las
operaciones que mutan deuda corren en `transaction.atomic()` con
`select_for_update()` sobre los cargos del representante.
"""


def saldo_representante(representante, area=None):
    """Σ(monto_usd − monto_pagado) de los cargos no anulados (opcionalmente de un área)."""
    raise NotImplementedError


def limite_credito(representante):
    """Límite USD: override en CreditoRepresentanteCantina o el default de ParametroCantina."""
    raise NotImplementedError


def crear_cargo_por_venta(venta):
    """Crea el CargoCantina de una venta 'credito_representante' (valida bloqueo y límite).
    Se llama dentro de la transacción de RegistrarVentaView."""
    raise NotImplementedError


def registrar_abono(*, representante, lineas, cajero, apertura, fecha_pago=None, motivo=''):
    """Registra un abono (posiblemente mixto) y lo aplica FIFO. Devuelve las líneas creadas."""
    raise NotImplementedError


def anular_abono(operacion_uuid, usuario):
    """Anula todas las líneas de la operación y revierte sus aplicaciones."""
    raise NotImplementedError


def anular_cargo_por_venta(venta, usuario):
    """Anula el cargo de una venta a crédito; falla si ya tiene aplicaciones."""
    raise NotImplementedError
