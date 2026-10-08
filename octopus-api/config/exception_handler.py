"""Manejador de excepciones DRF.

Solo para api/cuentas-por-pagar/ y api/egresos/ normaliza:
  - 400 (validación): {"detalle": <mensaje legible>, "campos": {campo: [mensajes]}}
  - 401/403/404/405 y demás APIException: {"detalle": <mensaje>}
El resto de la API conserva el formato estándar de DRF.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions
from rest_framework.views import exception_handler as drf_exception_handler

PREFIJOS = ('/api/cuentas-por-pagar/', '/api/egresos/')


def _aplana(valor):
    if isinstance(valor, (list, tuple)):
        return [m for v in valor for m in _aplana(v)]
    if isinstance(valor, dict):
        return [m for v in valor.values() for m in _aplana(v)]
    return [str(valor)]


def exception_handler_octopus(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, 'error_dict') else exc.messages)
    response = drf_exception_handler(exc, context)
    request = context.get('request')
    if response is None or request is None or not request.path.startswith(PREFIJOS):
        return response
    data = response.data
    if response.status_code == 400 and isinstance(exc, exceptions.ValidationError):
        if isinstance(data, dict):
            campos = {k: _aplana(v) for k, v in data.items() if k not in ('detalle', 'non_field_errors')}
            generales = _aplana(data.get('detalle', [])) + _aplana(data.get('non_field_errors', []))
            mensajes = generales or [f'{k}: {" ".join(v)}' for k, v in campos.items()]
        else:
            campos, mensajes = {}, _aplana(data)
        response.data = {'detalle': ' '.join(mensajes) or 'Datos inválidos.', 'campos': campos}
    elif isinstance(data, dict) and 'detalle' in data and 'campos' not in data:
        response.data = {'detalle': ' '.join(_aplana(data['detalle']))}
    elif isinstance(data, dict) and 'detail' in data:
        response.data = {'detalle': str(data['detail'])}
    elif isinstance(data, (list, str)):
        response.data = {'detalle': ' '.join(_aplana(data))}
    return response
