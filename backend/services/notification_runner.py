"""
Notification Runner
Lógica que:
1. Lee facturas vencidas de la BD (tabla invoices — adaptar según esquema real)
2. Para cada factura, verifica si ya se envió la notificación del día correspondiente
3. Si no se envió, renderiza el template, envía y registra en notification_logs

IMPORTANTE: Este archivo asume que existe una tabla `invoices` con campos:
  - id, school_id, representative_id, representative_email, representative_phone,
    representative_name, representative_cedula, student_name, amount, due_date, status
Adaptar los nombres de campos según el esquema real del proyecto.
"""
import json
import logging
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session

# Importar modelos cuando estén disponibles
# from models import NotificationRule, NotificationLog, Invoice  # ajustar import

logger = logging.getLogger(__name__)

TEMPLATE_VARS = {
    "{{nombre}}": "representative_name",
    "{{factura}}": "id",
    "{{monto}}": "amount",
    "{{vencimiento}}": "due_date",
    "{{cedula}}": "representative_cedula",
    "{{estudiante}}": "student_name",
}


def render_template(template: str, invoice: dict) -> str:
    """Reemplaza variables {{}} en el template con datos reales de la factura."""
    result = template
    for var, field in TEMPLATE_VARS.items():
        value = str(invoice.get(field, ""))
        if field == "due_date" and invoice.get(field):
            try:
                d = invoice[field]
                if isinstance(d, (date, datetime)):
                    value = d.strftime("%d/%m/%Y")
            except Exception:
                pass
        if field == "amount":
            try:
                value = f"Bs. {float(invoice[field]):,.2f}"
            except Exception:
                pass
        result = result.replace(var, value)
    return result


def already_sent(db: Session, rule_id: str, invoice_id: int, channel: str) -> bool:
    """Verifica si ya se envió esta notificación para evitar duplicados."""
    from models import NotificationLog
    return db.query(NotificationLog).filter(
        NotificationLog.rule_id == rule_id,
        NotificationLog.invoice_id == invoice_id,
        NotificationLog.channel == channel,
        NotificationLog.status == "sent",
    ).first() is not None


def log_notification(db: Session, *, rule_id, school_id, invoice_id, representative_id,
                     channel, recipient, status, error_message=None):
    """Registra el resultado del envío en notification_logs."""
    from models import NotificationLog
    log = NotificationLog(
        rule_id=rule_id,
        school_id=school_id,
        invoice_id=invoice_id,
        representative_id=representative_id,
        channel=channel,
        recipient=recipient,
        status=status,
        error_message=error_message,
    )
    db.add(log)
    db.commit()


async def run_notifications(db: Session):
    """
    Punto de entrada del cron job.
    Itera sobre todas las facturas impagas y aplica las reglas configuradas.

    TODO: Reemplazar el bloque de invoices con la query real al modelo Invoice del proyecto.
    """
    from models import NotificationRule, NotificationConfig
    from crypto import decrypt
    from services.email_service import send_email
    from services.whatsapp_service import send_whatsapp

    today = date.today()

    # ── Cargar reglas activas ────────────────────────────────────────────────
    rules = db.query(NotificationRule).filter(NotificationRule.active == True).all()
    if not rules:
        logger.info("No hay reglas de notificación activas")
        return

    # ── Cargar configuración de canales ─────────────────────────────────────
    def get_config(channel: str, school_id: int = 1) -> dict:
        cfg = db.query(NotificationConfig).filter(
            NotificationConfig.channel == channel,
            NotificationConfig.school_id == school_id,
        ).first()
        if cfg:
            return json.loads(decrypt(cfg.config_json))
        return {}

    email_config = get_config("email")
    whatsapp_config = get_config("whatsapp")

    # ── Query de facturas impagas ────────────────────────────────────────────
    # TODO: Reemplazar con el modelo Invoice real del proyecto
    # Ejemplo de query cuando exista el modelo:
    #
    # from models import Invoice
    # unpaid_invoices = db.query(Invoice).filter(
    #     Invoice.status.in_(["pending", "overdue"]),
    #     Invoice.due_date <= today,
    # ).all()
    #
    # Por ahora usamos lista vacía para que el scheduler no falle al arrancar
    unpaid_invoices = []
    logger.info(f"Procesando {len(unpaid_invoices)} facturas impagas")

    for invoice in unpaid_invoices:
        inv = invoice.__dict__ if hasattr(invoice, "__dict__") else invoice
        due = inv.get("due_date")
        if isinstance(due, datetime):
            due = due.date()
        days_overdue = (today - due).days if due else 0

        for rule in rules:
            if days_overdue != rule.offset_days:
                continue

            # Email
            if rule.channel_email and email_config:
                if not already_sent(db, rule.id, inv["id"], "email"):
                    recipient = inv.get("representative_email", "")
                    if rule.director_alert:
                        # TODO: obtener email del director del colegio
                        recipient = email_config.get("director_email", recipient)
                    try:
                        body = render_template(rule.email_template, inv)
                        await send_email(
                            config=email_config,
                            to=recipient,
                            subject=f"Aviso de pago — Factura #{inv.get('id')}",
                            body_html=f"<p>{body}</p>",
                            body_text=body,
                        )
                        log_notification(db, rule_id=rule.id, school_id=inv.get("school_id", 1),
                                         invoice_id=inv["id"], representative_id=inv.get("representative_id"),
                                         channel="email", recipient=recipient, status="sent")
                    except Exception as e:
                        logger.error(f"Error email rule={rule.id} invoice={inv['id']}: {e}")
                        log_notification(db, rule_id=rule.id, school_id=inv.get("school_id", 1),
                                         invoice_id=inv["id"], representative_id=inv.get("representative_id"),
                                         channel="email", recipient=recipient, status="failed",
                                         error_message=str(e))

            # WhatsApp
            if rule.channel_whatsapp and whatsapp_config:
                if not already_sent(db, rule.id, inv["id"], "whatsapp"):
                    phone = inv.get("representative_phone", "")
                    try:
                        msg = render_template(rule.whatsapp_template, inv)
                        await send_whatsapp(config=whatsapp_config, to=phone, message=msg)
                        log_notification(db, rule_id=rule.id, school_id=inv.get("school_id", 1),
                                         invoice_id=inv["id"], representative_id=inv.get("representative_id"),
                                         channel="whatsapp", recipient=phone, status="sent")
                    except Exception as e:
                        logger.error(f"Error WhatsApp rule={rule.id} invoice={inv['id']}: {e}")
                        log_notification(db, rule_id=rule.id, school_id=inv.get("school_id", 1),
                                         invoice_id=inv["id"], representative_id=inv.get("representative_id"),
                                         channel="whatsapp", recipient=phone, status="failed",
                                         error_message=str(e))
