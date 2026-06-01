from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


# ─────────────────────────────────────────────────────────────
# Configuración de Email
# ─────────────────────────────────────────────────────────────

class EmailConfig(BaseModel):
    """Campos de configuración para cualquier proveedor de email."""

    provider: Optional[str] = ""     # 'smtp' | 'sendgrid' | 'resend'
    host: Optional[str] = ""         # Solo SMTP
    port: Optional[str] = ""         # Solo SMTP (ej. "587")
    secure: Optional[str] = ""       # 'true' | 'false' — TLS/SSL
    user: Optional[str] = ""         # Usuario SMTP
    password: Optional[str] = ""     # Contraseña SMTP (se encriptará en BD)
    from_name: Optional[str] = ""    # Nombre del remitente
    from_email: Optional[str] = ""   # Dirección del remitente
    api_key: Optional[str] = ""      # SendGrid o Resend API key (se encriptará en BD)
    domain: Optional[str] = ""       # Dominio Resend


# ─────────────────────────────────────────────────────────────
# Configuración de WhatsApp
# ─────────────────────────────────────────────────────────────

class WhatsAppConfig(BaseModel):
    """Campos de configuración para cualquier proveedor de WhatsApp."""

    provider: Optional[str] = ""          # 'twilio' | 'meta' | '360dialog'
    account_sid: Optional[str] = ""       # Twilio Account SID (se encriptará en BD)
    auth_token: Optional[str] = ""        # Twilio Auth Token (se encriptará en BD)
    from_number: Optional[str] = ""       # Número Twilio (ej. "whatsapp:+14155238886")
    phone_number_id: Optional[str] = ""   # Meta — Phone Number ID
    access_token: Optional[str] = ""      # Meta — Access Token permanente (se encriptará en BD)
    api_key_360: Optional[str] = ""       # 360Dialog API Key (se encriptará en BD)
    channel_id: Optional[str] = ""        # 360Dialog Channel ID


# ─────────────────────────────────────────────────────────────
# Reglas de notificación
# ─────────────────────────────────────────────────────────────

class NotificationRuleSchema(BaseModel):
    """Representación completa de una regla de notificación."""

    id: str
    label: str
    offset_days: int
    channels: dict                  # {"email": bool, "whatsapp": bool}
    email_template: Optional[str] = ""
    whatsapp_template: Optional[str] = ""
    active: bool
    director_alert: bool

    model_config = {"from_attributes": True}


class NotificationRulePatch(BaseModel):
    """Payload para PATCH parcial de una regla — todos los campos son opcionales."""

    label: Optional[str] = None
    offset_days: Optional[int] = None
    channels: Optional[dict] = None      # {"email": bool, "whatsapp": bool}
    email_template: Optional[str] = None
    whatsapp_template: Optional[str] = None
    active: Optional[bool] = None
    director_alert: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# Envío de prueba
# ─────────────────────────────────────────────────────────────

class TestSendRequest(BaseModel):
    """Payload para disparar un envío de prueba desde el panel de configuración."""

    channel: str    # 'email' | 'whatsapp'
    to: str         # Email o número de teléfono destino
    rule_id: str    # ID de la regla cuya plantilla se usará ('day_0', etc.)


# ─────────────────────────────────────────────────────────────
# Respuesta general de configuración
# ─────────────────────────────────────────────────────────────

class NotificationSettingsResponse(BaseModel):
    """Respuesta del endpoint GET /settings — devuelve ambas configuraciones."""

    email: EmailConfig
    whatsapp: WhatsAppConfig
