"""
Resolución ÚNICA de las credenciales de WhatsApp por sede
(docs/CONTRATO_WHATSAPP_POR_SEDE.md).

  get_config_whatsapp(sede)  → ConfigWhatsApp con las credenciales a usar.
  config_por_phone_id(pid)   → ConfigWhatsApp dueña de un Phone Number ID entrante.
  sede_id_de_representante() → sede de un representante (None si no es una sola).

Regla: la sede usa la suya si tiene `ConfiguracionWhatsAppSede` activa con token
y Phone ID; si no, hereda la general (`ConfiguracionNotificaciones` pk=1 más las
variables de entorno), exactamente como antes de existir esta función.
"""
import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)

ORIGEN_SEDE = 'sede'
ORIGEN_GENERAL = 'general'


@dataclass(frozen=True)
class ConfigWhatsApp:
    origen: str                 # 'sede' | 'general'
    sede_id: int = None         # solo con origen 'sede'
    activo: bool = False
    proveedor: str = ''         # 'meta' | 'twilio' | ''
    token: str = ''
    phone_id: str = ''
    waba_id: str = ''
    app_secret: str = ''
    verify_token: str = ''
    numero_visible: str = ''
    twilio_sid: str = ''
    twilio_token: str = ''
    twilio_from: str = ''


def _id_de(sede):
    if sede is None or sede == '':
        return None
    return getattr(sede, 'pk', sede)


def _general():
    from . import services
    cfg = services._notif_cfg()
    proveedor = (cfg.whatsapp_proveedor if (cfg and cfg.whatsapp_activo) else None) \
        or getattr(settings, 'WHATSAPP_PROVIDER', '')
    return ConfigWhatsApp(
        origen=ORIGEN_GENERAL,
        activo=bool(cfg and cfg.whatsapp_activo),
        proveedor=(proveedor or '').lower(),
        token=(cfg.meta_whatsapp_token if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', ''),
        phone_id=(cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', ''),
        waba_id=(cfg.meta_waba_id if cfg else ''),
        app_secret=(cfg.meta_app_secret if cfg else '') or getattr(settings, 'META_APP_SECRET', ''),
        verify_token=(cfg.meta_webhook_verify_token if cfg else '')
        or getattr(settings, 'META_WEBHOOK_VERIFY_TOKEN', ''),
        twilio_sid=(cfg.twilio_account_sid if cfg else '') or getattr(settings, 'TWILIO_ACCOUNT_SID', ''),
        twilio_token=(cfg.twilio_auth_token if cfg else '') or getattr(settings, 'TWILIO_AUTH_TOKEN', ''),
        twilio_from=(cfg.twilio_whatsapp_from if cfg else '') or getattr(settings, 'TWILIO_WHATSAPP_FROM', ''),
    )


def _de_sede(fila, general):
    """Config efectiva de una fila de sede. Secretos vacíos heredan de la general
    (la misma app de Meta suele atender varios números)."""
    return ConfigWhatsApp(
        origen=ORIGEN_SEDE, sede_id=fila.sede_id, activo=True, proveedor='meta',
        token=fila.meta_whatsapp_token, phone_id=fila.meta_whatsapp_phone_id,
        waba_id=fila.meta_waba_id, numero_visible=fila.numero_visible,
        app_secret=fila.meta_app_secret or general.app_secret,
        verify_token=fila.meta_webhook_verify_token or general.verify_token)


def _fila_utilizable(fila):
    return bool(fila and fila.activo and fila.meta_whatsapp_token and fila.meta_whatsapp_phone_id)


def _fila_de_sede(sede_id):
    from .models import ConfiguracionWhatsAppSede
    try:
        return ConfiguracionWhatsAppSede.objects.filter(sede_id=sede_id).first()
    except Exception:
        logger.exception('No se pudo leer la configuración de WhatsApp de la sede %s', sede_id)
        return None


def get_config_whatsapp(sede=None):
    """Credenciales a usar para enviar desde `sede` (Sede, id o None = general)."""
    general = _general()
    sede_id = _id_de(sede)
    if sede_id is None:
        return general
    fila = _fila_de_sede(sede_id)
    return _de_sede(fila, general) if _fila_utilizable(fila) else general


def config_por_phone_id(phone_id):
    """Config dueña del Phone Number ID que reporta Meta, o None si no es de nadie
    (ni de una sede activa ni de la general)."""
    phone_id = (phone_id or '').strip()
    if not phone_id:
        return None
    from .models import ConfiguracionWhatsAppSede
    general = _general()
    fila = ConfiguracionWhatsAppSede.objects.filter(meta_whatsapp_phone_id=phone_id).first()
    if _fila_utilizable(fila):
        return _de_sede(fila, general)
    if general.phone_id and general.phone_id == phone_id:
        return general
    return None


def verify_tokens():
    """Tokens de verificación válidos para el GET del webhook (general + sedes activas)."""
    from .models import ConfiguracionWhatsAppSede
    general = _general()
    tokens = [general.verify_token] if general.verify_token else []
    for fila in ConfiguracionWhatsAppSede.objects.filter(activo=True).exclude(meta_webhook_verify_token=''):
        tokens.append(fila.meta_webhook_verify_token)
    return tokens


def sede_id_de_representante(rep):
    """Sede de sus alumnos activos si es una sola; si hay varias (o ninguna), None."""
    if rep is None:
        return None
    sedes = set(rep.alumnos.filter(activo=True).values_list('sede_id', flat=True))
    return sedes.pop() if len(sedes) == 1 else None
