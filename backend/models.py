from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
)

from database import Base
from crypto import encrypt, decrypt


class NotificationConfig(Base):
    """
    Almacena la configuración de canal (email o WhatsApp) por colegio.
    Los campos sensibles (API keys, contraseñas) se guardan encriptados
    en config_json usando crypto.encrypt / crypto.decrypt.
    """

    __tablename__ = "notification_configs"

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, index=True, nullable=False)
    channel = Column(String, nullable=False)  # 'email' | 'whatsapp'
    config_json = Column(Text, nullable=False, default="")  # JSON encriptado
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_config(self, raw_json: str):
        """Encripta y guarda el JSON de configuración."""
        self.config_json = encrypt(raw_json)

    def get_config(self) -> str:
        """Desencripta y retorna el JSON de configuración."""
        return decrypt(self.config_json)


class NotificationRule(Base):
    """
    Regla de notificación automática por días de atraso.
    IDs predefinidos: 'day_0', 'day_5', 'day_10', 'day_15'.
    """

    __tablename__ = "notification_rules"

    id = Column(String, primary_key=True)           # 'day_0' | 'day_5' | 'day_10' | 'day_15'
    school_id = Column(Integer, index=True, nullable=False)
    label = Column(String, nullable=False)
    offset_days = Column(Integer, nullable=False)
    channel_email = Column(Boolean, default=True)
    channel_whatsapp = Column(Boolean, default=False)
    email_template = Column(Text, nullable=True)
    whatsapp_template = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    director_alert = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NotificationLog(Base):
    """
    Registro de cada notificación enviada o fallida.
    Permite auditoría y reintentos.
    """

    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    school_id = Column(Integer, index=True, nullable=False)
    rule_id = Column(String, nullable=False)            # 'day_0', 'day_5', etc.
    invoice_id = Column(Integer, nullable=False)
    representative_id = Column(Integer, nullable=False)
    channel = Column(String, nullable=False)            # 'email' | 'whatsapp'
    recipient = Column(String, nullable=False)          # email o número de teléfono
    status = Column(String, nullable=False)             # 'sent' | 'failed'
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
