from egresos.validators import validar_comprobante as _validar_comprobante


def validar_comprobante(archivo):
    """Misma validación que Egresos: extensión, firma de bytes y tamaño."""
    _validar_comprobante(archivo)
    return archivo
