from django.core.exceptions import ValidationError


FIRMAS = {
    'jpg': (b'\xff\xd8\xff',), 'jpeg': (b'\xff\xd8\xff',),
    'png': (b'\x89PNG\r\n\x1a\n',), 'webp': (b'RIFF',), 'pdf': (b'%PDF-',),
}


def validar_comprobante(archivo):
    if archivo.size > 10 * 1024 * 1024:
        raise ValidationError('El comprobante no puede superar 10 MB.')
    extension = archivo.name.rsplit('.', 1)[-1].lower() if '.' in archivo.name else ''
    if extension not in FIRMAS:
        raise ValidationError('Formato de comprobante no permitido.')
    inicio = archivo.read(12)
    archivo.seek(0)
    valido = any(inicio.startswith(firma) for firma in FIRMAS[extension])
    if extension == 'webp':
        valido = inicio.startswith(b'RIFF') and inicio[8:12] == b'WEBP'
    if not valido:
        raise ValidationError('El contenido del archivo no coincide con su formato.')
