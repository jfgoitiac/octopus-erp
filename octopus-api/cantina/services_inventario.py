"""
Único punto de entrada para modificar ProductoCantina.stock_actual.

Cualquier cambio de stock (venta, compra a proveedor, corrección de conteo)
debe pasar por aplicar_movimiento_inventario para que quede su
MovimientoInventario y el stock nunca quede negativo.
"""
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import MovimientoInventario, ProductoCantina


def aplicar_movimiento_inventario(producto, tipo, cantidad, *, motivo='', venta=None, usuario=None):
    """
    Aplica un movimiento de inventario bajo lock de fila (select_for_update)
    y crea el MovimientoInventario correspondiente. Devuelve el
    MovimientoInventario creado.

    - 'entrada': cantidad (positiva) suma al stock.
    - 'salida': cantidad (positiva) resta del stock.
    - 'ajuste': cantidad con signo (merma/conteo manual) se suma directo al
      stock — un ajuste negativo es una merma, uno positivo una corrección
      hacia arriba.

    Nunca permite que stock_actual quede negativo: si el movimiento lo
    dejaría por debajo de 0, lanza ValidationError sin escribir nada.
    """
    if tipo == 'entrada':
        delta = cantidad
    elif tipo == 'salida':
        delta = -cantidad
    elif tipo == 'ajuste':
        delta = cantidad
    else:
        raise ValidationError(f"Tipo de movimiento inválido: {tipo!r}")

    with transaction.atomic():
        producto = ProductoCantina.objects.select_for_update().get(pk=producto.pk)

        stock_antes = producto.stock_actual
        stock_despues = stock_antes + delta
        if stock_despues < 0:
            raise ValidationError(
                f"Movimiento rechazado: dejaría el stock de '{producto.nombre}' en "
                f"{stock_despues} (negativo)."
            )

        producto.stock_actual = stock_despues
        producto.save(update_fields=['stock_actual'])

        return MovimientoInventario.objects.create(
            producto=producto,
            tipo=tipo,
            cantidad=cantidad,
            stock_antes=stock_antes,
            stock_despues=stock_despues,
            motivo=motivo,
            venta=venta,
            usuario=usuario,
        )
