import base64
import re

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

CLAVES = ('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY')


def generar_par():
    """Par VAPID (P-256) en base64 url-safe sin relleno, el formato que usan
    pywebpush y `applicationServerKey` del navegador."""
    from cryptography.hazmat.primitives import serialization as s
    from py_vapid import Vapid

    v = Vapid()
    v.generate_keys()
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()  # noqa: E731
    publica = b64(v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint))
    privada = b64(v.private_key.private_numbers().private_value.to_bytes(32, 'big'))
    return publica, privada


def valor_en_env(texto, clave):
    m = re.search(rf'^{clave}=(.*)$', texto, flags=re.M)
    return m.group(1).strip() if m else ''


def escribir_claves(texto, valores):
    """Rellena (o agrega) cada clave en el texto del .env sin tocar el resto."""
    for clave, valor in valores.items():
        if re.search(rf'^{clave}=', texto, flags=re.M):
            texto = re.sub(rf'^{clave}=.*$', f'{clave}={valor}', texto, count=1, flags=re.M)
        else:
            texto = texto.rstrip('\n') + f'\n{clave}={valor}\n'
    return texto


class Command(BaseCommand):
    help = (
        'Genera el par VAPID del Web Push y lo guarda en .env si faltan las dos claves. '
        'Nunca sobrescribe un par existente (hacerlo invalidaría todas las suscripciones).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--imprimir', action='store_true',
                            help='Solo imprime un par nuevo; no escribe el .env.')

    def handle(self, *args, **opts):
        if opts['imprimir']:
            publica, privada = generar_par()
            self.stdout.write(f'VAPID_PUBLIC_KEY={publica}\nVAPID_PRIVATE_KEY={privada}')
            return

        ruta = settings.BASE_DIR / '.env'
        texto = ruta.read_text(encoding='utf-8') if ruta.exists() else ''
        actuales = {c: valor_en_env(texto, c) for c in CLAVES}

        if all(actuales.values()):
            self.stdout.write('VAPID: ya configuradas; no se cambia nada.')
            return
        if any(actuales.values()):
            raise CommandError(
                'VAPID: solo hay una de las dos claves en .env. Complétalas a mano o borra '
                'ambas para generar un par nuevo (esto invalida las suscripciones existentes).')

        publica, privada = generar_par()
        ruta.write_text(
            escribir_claves(texto, {'VAPID_PUBLIC_KEY': publica, 'VAPID_PRIVATE_KEY': privada}),
            encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(
            f'VAPID: par nuevo guardado en {ruta}. Reinicia el servicio para que lo cargue. '
            'Cada usuario debe reactivar las notificaciones en su dispositivo.'))
