"""Campo de modelo que cifra su contenido en reposo (base de datos / dumps /
backups) usando Fernet (AES-128-CBC + HMAC), y lo descifra de forma
transparente al leerlo desde Python.

La clave Fernet se deriva de forma determinística de `settings.SECRET_KEY`
(SHA-256 -> base64 url-safe de 32 bytes), para no tener que generar ni
gestionar un secreto adicional en producción. Si `SECRET_KEY` rota, los
valores cifrados con la clave anterior dejan de poder descifrarse — hay que
tenerlo en cuenta antes de rotar `SECRET_KEY` en producción.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet_key_desde_secret_key():
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet():
    return Fernet(_fernet_key_desde_secret_key())


class EncryptedTextField(models.TextField):
    """TextField que persiste su valor cifrado en la base de datos.

    Transparente para el resto del código: `instancia.campo` siempre
    devuelve el texto plano (igual que un CharField/TextField normal). Solo
    el valor guardado en la columna de la BD (y por lo tanto en cualquier
    backup o dump) queda cifrado.

    Nota: al no ser un cifrado determinístico, este campo no debe usarse en
    filtros exactos de queryset (`.filter(campo=valor)`) — no es el caso de
    los campos donde se usa actualmente (credenciales del singleton de
    configuración de notificaciones).
    """

    description = 'Texto cifrado en reposo (Fernet)'

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value in (None, ''):
            return value
        if isinstance(value, bytes):
            value = value.decode('utf-8')
        token = _fernet().encrypt(value.encode('utf-8'))
        return token.decode('utf-8')

    def from_db_value(self, value, expression, connection):
        if value in (None, ''):
            return value
        try:
            return _fernet().decrypt(value.encode('utf-8')).decode('utf-8')
        except InvalidToken:
            # Valor legado guardado antes de que este campo existiera (texto
            # plano) — se devuelve tal cual para no perder el dato ni romper
            # nada; la próxima vez que se guarde quedará cifrado.
            return value

    def to_python(self, value):
        if value is None or isinstance(value, str):
            return value
        return str(value)
