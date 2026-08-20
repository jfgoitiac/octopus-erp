"""
Fuente de verdad para el criterio de "saldo negativo sostenido" en cantina.
Un alumno entra en este estado cuando TarjetaPrepago.saldo < 0.
Los dias de recordatorio (por defecto 1, 3 y 7) son configurables en
ParametroCantina.dias_alerta_saldo_negativo.
No genera intereses ni bloquea nada por si mismo -- solo decide CUANDO notificar.
El bloqueo real del pago con tarjeta ya ocurre en el momento de la venta
cuando el saldo proyectado excede `limite_credito` (ver views.RegistrarVentaView).
"""
from datetime import date


def dias_en_negativo(tarjeta):
    if tarjeta.saldo_negativo_desde is None:
        return 0
    return (date.today() - tarjeta.saldo_negativo_desde).days


def debe_notificarse_hoy(tarjeta, dias_configurados):
    return dias_en_negativo(tarjeta) in dias_configurados


def parsear_dias_configurados(cadena):
    """Convierte el string de ParametroCantina.dias_alerta_saldo_negativo
    (ej. '1, 3,7,') en una lista de enteros, tolerando espacios y tokens
    vacios. Un token no numerico (typo en la config) se ignora en silencio
    en vez de romper la tarea Celery que consume este valor."""
    dias = []
    for token in (cadena or '').split(','):
        token = token.strip()
        if not token:
            continue
        try:
            dias.append(int(token))
        except ValueError:
            continue
    return dias
