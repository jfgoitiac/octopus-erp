"""
Punto único de verdad para "¿es un comprobante de pago válido?" —
tamaño, extensión, content-type declarado y magic bytes reales.

Antes esta validación vivía duplicada en portal/views.py
(PortalComprobantePagoView y PortalRecargarTarjetaView); RecargarTarjetaCajeroView
(cantina/views.py) no la tenía en absoluto, permitiendo subir cualquier archivo
(ej. .html/.svg) como 'comprobante' sin ninguna verificación de tipo real.
"""

COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB

EXTENSIONES_VALIDAS = ('.jpg', '.jpeg', '.png', '.pdf', '.webp')

CONTENT_TYPES_PERMITIDOS = {
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
}


def validar_comprobante(archivo):
    """
    Valida un archivo subido (UploadedFile) como comprobante de pago.

    Devuelve None si es válido, o un mensaje de error (str) para mostrar
    al usuario si no lo es. No lanza excepciones — el caller decide el
    status HTTP de la respuesta.
    """
    if archivo.size > COMPROBANTE_MAX_BYTES:
        return 'El archivo supera el tamaño máximo permitido (10 MB).'

    nombre_archivo = archivo.name.lower()
    if not any(nombre_archivo.endswith(ext) for ext in EXTENSIONES_VALIDAS):
        return 'Formato no permitido. Use JPG, PNG, PDF o WEBP.'

    # Validar tipo MIME real del contenido (evita extension spoofing)
    content_type = getattr(archivo, 'content_type', '')
    if content_type not in CONTENT_TYPES_PERMITIDOS:
        return 'El tipo de contenido del archivo no es valido.'

    # Verificación adicional por magic bytes para imágenes
    if content_type.startswith('image/'):
        archivo.seek(0)
        header = archivo.read(12)
        archivo.seek(0)
        es_jpeg = header[:3] == b'\xff\xd8\xff'
        es_png = header[:8] == b'\x89PNG\r\n\x1a\n'
        es_gif = header[:6] in (b'GIF87a', b'GIF89a')
        es_webp = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
        if not (es_jpeg or es_png or es_gif or es_webp):
            return 'El contenido del archivo no corresponde a una imagen valida.'

    # Verificación adicional por magic bytes para PDFs — sin esto, un archivo
    # con extensión y content-type falsificados ('.pdf' / 'application/pdf'
    # declarados por el cliente) pasaría sin verificar el contenido real,
    # igual que se evita para imágenes arriba.
    if content_type == 'application/pdf':
        archivo.seek(0)
        header = archivo.read(5)
        archivo.seek(0)
        if header != b'%PDF-':
            return 'El contenido del archivo no corresponde a un PDF valido.'

    return None
