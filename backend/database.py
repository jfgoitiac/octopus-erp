import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./school.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Requerido para SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency de FastAPI — provee una sesión de BD y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Crea todas las tablas y siembra las 4 reglas de notificación por defecto."""
    # Importación local para evitar circular imports
    from models import Base as ModelsBase, NotificationRule  # noqa: F401

    ModelsBase.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(NotificationRule).count()
        if existing == 0:
            default_rules = [
                NotificationRule(
                    id="day_0",
                    school_id=1,
                    label="Generación de factura (Día 0)",
                    offset_days=0,
                    channel_email=True,
                    channel_whatsapp=False,
                    email_template=(
                        "Estimado {nombre_representante}, se ha generado la factura "
                        "#{numero_factura} por {monto} con vencimiento el {fecha_vencimiento}."
                    ),
                    whatsapp_template=(
                        "Hola {nombre_representante}, su factura #{numero_factura} "
                        "por {monto} vence el {fecha_vencimiento}."
                    ),
                    active=True,
                    director_alert=False,
                    updated_at=datetime.utcnow(),
                ),
                NotificationRule(
                    id="day_5",
                    school_id=1,
                    label="Recordatorio (Día 5)",
                    offset_days=5,
                    channel_email=True,
                    channel_whatsapp=False,
                    email_template=(
                        "Estimado {nombre_representante}, le recordamos que su factura "
                        "#{numero_factura} por {monto} vence el {fecha_vencimiento}. "
                        "Por favor realice su pago a tiempo."
                    ),
                    whatsapp_template=(
                        "Recordatorio: su factura #{numero_factura} por {monto} "
                        "vence el {fecha_vencimiento}."
                    ),
                    active=True,
                    director_alert=False,
                    updated_at=datetime.utcnow(),
                ),
                NotificationRule(
                    id="day_10",
                    school_id=1,
                    label="Segundo aviso (Día 10)",
                    offset_days=10,
                    channel_email=True,
                    channel_whatsapp=False,
                    email_template=(
                        "Estimado {nombre_representante}, su factura #{numero_factura} "
                        "por {monto} lleva 10 días sin pago. Evite recargos por mora."
                    ),
                    whatsapp_template=(
                        "Aviso: su factura #{numero_factura} tiene 10 días de atraso. "
                        "Monto: {monto}."
                    ),
                    active=True,
                    director_alert=False,
                    updated_at=datetime.utcnow(),
                ),
                NotificationRule(
                    id="day_15",
                    school_id=1,
                    label="Alerta dirección (Día 15)",
                    offset_days=15,
                    channel_email=True,
                    channel_whatsapp=False,
                    email_template=(
                        "Estimado {nombre_representante}, su factura #{numero_factura} "
                        "por {monto} acumula 15 días de mora. Se ha notificado a la dirección."
                    ),
                    whatsapp_template=(
                        "Urgente: su factura #{numero_factura} por {monto} "
                        "lleva 15 días sin pago."
                    ),
                    active=True,
                    director_alert=True,
                    updated_at=datetime.utcnow(),
                ),
            ]
            db.add_all(default_rules)
            db.commit()
    finally:
        db.close()
