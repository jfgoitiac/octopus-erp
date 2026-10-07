from django.core.exceptions import ValidationError

ARCHIVOS_PERMITIDOS = {'image/jpeg','image/png','image/webp','application/pdf'}
MAXIMO_COMPROBANTE = 10 * 1024 * 1024

def validar_comprobante(archivo):
    if archivo.size > MAXIMO_COMPROBANTE:
        raise ValidationError('El comprobante no puede superar 10 MB.')
    tipo = getattr(archivo, 'content_type', '')
    if tipo and tipo not in ARCHIVOS_PERMITIDOS:
        raise ValidationError('Formato no permitido. Use JPG, PNG, WEBP o PDF.')
    return archivo
