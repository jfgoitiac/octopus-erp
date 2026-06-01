"""
Router de configuración de notificaciones.
Prefix: /api/settings  (montado en main.py)

Endpoints:
  GET    /notifications          — Obtiene config de email y WhatsApp
  PUT    /notifications/email    — Guarda config de email (encriptada)
  PUT    /notifications/whatsapp — Guarda config de WhatsApp (encriptada)
  GET    /notifications/rules    — Lista las 4 reglas de cobranza
  PATCH  /notifications/rules/{rule_id} — Actualiza una regla parcialmente
  POST   /notifications/test     — Envía un mensaje de prueba
"""

import json
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import NotificationConfig, NotificationRule, NotificationLog
from schemas import (
    EmailConfig,
    WhatsAppConfig,
    NotificationRuleSchema,
    NotificationRulePatch,
    TestSendRequest,
    NotificationSettingsResponse,
)
from crypto import encrypt, decrypt

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/notifications",
    tags=["Notificaciones"],
)

# School ID fijo — se parametrizará en Fase 3 (multi-sede) desde el JWT
SCHOOL_ID = 1


# ─────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────

def _get_or_create_config(db: Session, channel: str) -> NotificationConfig:
    """Obtiene o crea el registro de configuración para el canal indicado."""
    config = (
        db.query(NotificationConfig)
        .filter_by(school_id=SCHOOL_ID, channel=channel)
        .first()
    )
    if not config:
        config = NotificationConfig(
            school_id=SCHOOL_ID,
            channel=channel,
            config_json=encrypt("{}"),
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _parse_config_json(config: NotificationConfig) -> dict:
    """Desencripta y parsea el JSON de configuración. Retorna {} si falla."""
    try:
        raw = decrypt(config.config_json)
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────
# GET /notifications — Obtener configuración actual
# ─────────────────────────────────────────────────────────────

@router.get("", response_model=NotificationSettingsResponse)
def get_notification_settings(db: Session = Depends(get_db)):
    """
    Retorna la configuración de email y WhatsApp del colegio.
    Los campos sensibles (API keys, contraseñas) se devuelven enmascarados
    si tienen valor — el frontend muestra '••••••••' pero no el valor real.
    """
    email_cfg_record = _get_or_create_config(db, "email")
    whatsapp_cfg_record = _get_or_create_config(db, "whatsapp")

    email_data = _parse_config_json(email_cfg_record)
    whatsapp_data = _parse_config_json(whatsapp_cfg_record)

    # Enmascarar campos sensibles para no exponerlos al frontend
    sensitive_email = {"password", "api_key"}
    sensitive_whatsapp = {"auth_token", "access_token", "api_key_360"}

    for field in sensitive_email:
        if email_data.get(field):
            email_data[field] = "••••••••"

    for field in sensitive_whatsapp:
        if whatsapp_data.get(field):
            whatsapp_data[field] = "••••••••"

    return NotificationSettingsResponse(
        email=EmailConfig(**email_data),
        whatsapp=WhatsAppConfig(**whatsapp_data),
    )


# ─────────────────────────────────────────────────────────────
# PUT /notifications/email — Guardar configuración de email
# ─────────────────────────────────────────────────────────────

@router.put("/email", status_code=status.HTTP_200_OK)
def save_email_config(payload: EmailConfig, db: Session = Depends(get_db)):
    """
    Guarda la configuración de email del colegio.
    Los campos sensibles se encriptan antes de persistir en BD.
    Si el cliente envía '••••••••' (valor enmascarado), se conserva
    el valor anterior en BD sin sobreescribirlo.
    """
    config = _get_or_create_config(db, "email")
    existing = _parse_config_json(config)

    new_data = payload.model_dump()

    # Preservar campos sensibles si el frontend los envía enmascarados
    for field in ("password", "api_key"):
        if new_data.get(field) == "••••••••":
            new_data[field] = existing.get(field, "")

    config.set_config(json.dumps(new_data))
    config.updated_at = datetime.utcnow()
    db.commit()

    logger.info(f"[notifications] Configuración de email actualizada (school_id={SCHOOL_ID})")
    return {"message": "Configuración de email guardada correctamente."}


# ─────────────────────────────────────────────────────────────
# PUT /notifications/whatsapp — Guardar configuración de WhatsApp
# ─────────────────────────────────────────────────────────────

@router.put("/whatsapp", status_code=status.HTTP_200_OK)
def save_whatsapp_config(payload: WhatsAppConfig, db: Session = Depends(get_db)):
    """
    Guarda la configuración de WhatsApp del colegio.
    Los campos sensibles se encriptan antes de persistir en BD.

    NOTA: La integración con WhatsApp (Twilio / Meta Business API / 360Dialog)
    está preparada a nivel de datos pero no implementada. Ver services/whatsapp_service.py.
    TODO: conectar con Twilio o Meta Business API cuando el cliente lo apruebe.
    """
    config = _get_or_create_config(db, "whatsapp")
    existing = _parse_config_json(config)

    new_data = payload.model_dump()

    # Preservar campos sensibles si el frontend los envía enmascarados
    for field in ("auth_token", "access_token", "api_key_360"):
        if new_data.get(field) == "••••••••":
            new_data[field] = existing.get(field, "")

    config.set_config(json.dumps(new_data))
    config.updated_at = datetime.utcnow()
    db.commit()

    logger.info(f"[notifications] Configuración de WhatsApp actualizada (school_id={SCHOOL_ID})")
    return {"message": "Configuración de WhatsApp guardada correctamente."}


# ─────────────────────────────────────────────────────────────
# GET /notifications/rules — Listar reglas de cobranza
# ─────────────────────────────────────────────────────────────

@router.get("/rules", response_model=List[NotificationRuleSchema])
def list_notification_rules(db: Session = Depends(get_db)):
    """
    Retorna las 4 reglas de notificación automática ordenadas por offset_days.
    """
    rules = (
        db.query(NotificationRule)
        .filter_by(school_id=SCHOOL_ID)
        .order_by(NotificationRule.offset_days)
        .all()
    )

    result = []
    for rule in rules:
        result.append(
            NotificationRuleSchema(
                id=rule.id,
                label=rule.label,
                offset_days=rule.offset_days,
                channels={
                    "email": rule.channel_email,
                    "whatsapp": rule.channel_whatsapp,
                },
                email_template=rule.email_template or "",
                whatsapp_template=rule.whatsapp_template or "",
                active=rule.active,
                director_alert=rule.director_alert,
            )
        )
    return result


# ─────────────────────────────────────────────────────────────
# PATCH /notifications/rules/{rule_id} — Actualizar regla parcialmente
# ─────────────────────────────────────────────────────────────

@router.patch("/rules/{rule_id}", response_model=NotificationRuleSchema)
def update_notification_rule(
    rule_id: str,
    payload: NotificationRulePatch,
    db: Session = Depends(get_db),
):
    """
    Actualiza parcialmente una regla de notificación.
    Solo los campos enviados en el payload se modifican.
    """
    rule = (
        db.query(NotificationRule)
        .filter_by(id=rule_id, school_id=SCHOOL_ID)
        .first()
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Regla '{rule_id}' no encontrada.",
        )

    update_data = payload.model_dump(exclude_none=True)

    if "label" in update_data:
        rule.label = update_data["label"]
    if "offset_days" in update_data:
        rule.offset_days = update_data["offset_days"]
    if "channels" in update_data:
        rule.channel_email = update_data["channels"].get("email", rule.channel_email)
        rule.channel_whatsapp = update_data["channels"].get("whatsapp", rule.channel_whatsapp)
    if "email_template" in update_data:
        rule.email_template = update_data["email_template"]
    if "whatsapp_template" in update_data:
        rule.whatsapp_template = update_data["whatsapp_template"]
    if "active" in update_data:
        rule.active = update_data["active"]
    if "director_alert" in update_data:
        rule.director_alert = update_data["director_alert"]

    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)

    logger.info(f"[notifications] Regla '{rule_id}' actualizada (school_id={SCHOOL_ID})")

    return NotificationRuleSchema(
        id=rule.id,
        label=rule.label,
        offset_days=rule.offset_days,
        channels={
            "email": rule.channel_email,
            "whatsapp": rule.channel_whatsapp,
        },
        email_template=rule.email_template or "",
        whatsapp_template=rule.whatsapp_template or "",
        active=rule.active,
        director_alert=rule.director_alert,
    )


# ─────────────────────────────────────────────────────────────
# POST /notifications/test — Enviar mensaje de prueba
# ─────────────────────────────────────────────────────────────

@router.post("/test", status_code=status.HTTP_200_OK)
async def send_test_notification(
    payload: TestSendRequest,
    db: Session = Depends(get_db),
):
    """
    Dispara un envío de prueba usando la plantilla de la regla indicada.
    Registra el resultado en notification_logs.

    TODO: conectar con email_service.py y whatsapp_service.py cuando
    los proveedores estén configurados.
    """
    rule = (
        db.query(NotificationRule)
        .filter_by(id=payload.rule_id, school_id=SCHOOL_ID)
        .first()
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Regla '{payload.rule_id}' no encontrada.",
        )

    if payload.channel not in ("email", "whatsapp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El canal debe ser 'email' o 'whatsapp'.",
        )

    # Seleccionar plantilla según canal
    template = (
        rule.email_template if payload.channel == "email" else rule.whatsapp_template
    ) or ""

    # Sustituir variables de plantilla con valores de ejemplo
    sample_vars = {
        "{nombre_representante}": "María González (prueba)",
        "{numero_factura}": "FAC-0001",
        "{monto}": "Bs. 1.500,00",
        "{fecha_vencimiento}": "15/06/2026",
    }
    message_body = template
    for var, val in sample_vars.items():
        message_body = message_body.replace(var, val)

    success = False
    error_msg = None

    try:
        if payload.channel == "email":
            # TODO: from services.email_service import send_email
            # await send_email(to=payload.to, subject=f"Prueba: {rule.label}", body=message_body)
            logger.info(
                f"[notifications/test] Simulando envío email a {payload.to}:\n{message_body}"
            )
            success = True
        else:
            # TODO: from services.whatsapp_service import send_whatsapp
            # await send_whatsapp(to=payload.to, body=message_body)
            logger.info(
                f"[notifications/test] Simulando envío WhatsApp a {payload.to}:\n{message_body}"
            )
            success = True

    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"[notifications/test] Error al enviar prueba: {exc}")

    # Registrar en log
    log_entry = NotificationLog(
        school_id=SCHOOL_ID,
        rule_id=payload.rule_id,
        invoice_id=0,           # 0 = envío de prueba
        representative_id=0,    # 0 = envío de prueba
        channel=payload.channel,
        recipient=payload.to,
        status="sent" if success else "failed",
        error_message=error_msg,
    )
    db.add(log_entry)
    db.commit()

    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al enviar la notificación de prueba: {error_msg}",
        )

    return {
        "message": f"Notificación de prueba enviada a {payload.to} por {payload.channel}.",
        "preview": message_body,
    }
