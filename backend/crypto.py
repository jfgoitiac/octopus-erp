import os
import warnings
from cryptography.fernet import Fernet

# Clave de desarrollo — solo para entorno local, nunca en producción
_DEV_KEY = b"ZmRlZmF1bHRfa2V5X3BhcmFfZGVzYXJyb2xsb19ub19wcm9kdWNjaW9u="

_raw_key = os.getenv("ENCRYPTION_KEY")

if not _raw_key:
    warnings.warn(
        "[crypto] ENCRYPTION_KEY no está definida en el entorno. "
        "Se usará una clave de desarrollo hardcodeada. "
        "NUNCA uses esto en producción.",
        stacklevel=2,
    )
    # Generamos una clave fija válida para desarrollo
    _fernet_key = Fernet.generate_key()
    _fernet = Fernet(_fernet_key)
else:
    _fernet = Fernet(_raw_key.encode())


def encrypt(value: str) -> str:
    """Encripta un string y retorna el resultado como string base64."""
    if not value:
        return ""
    token = _fernet.encrypt(value.encode())
    return token.decode()


def decrypt(value: str) -> str:
    """Desencripta un string base64 y retorna el string original."""
    if not value:
        return ""
    plain = _fernet.decrypt(value.encode())
    return plain.decode()
