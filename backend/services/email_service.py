"""
Email Service — adaptador multi-proveedor
Soporta: SMTP, SendGrid, Resend, Mailgun
"""
import smtplib
import ssl
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


async def send_email(
    config: dict,          # config desencriptada del proveedor
    to: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> None:
    """Envía email usando el proveedor configurado. Lanza excepción si falla."""
    provider = config.get("provider", "smtp")

    if provider == "smtp":
        await _send_smtp(config, to, subject, body_html, body_text)
    elif provider == "sendgrid":
        await _send_sendgrid(config, to, subject, body_html, body_text)
    elif provider == "resend":
        await _send_resend(config, to, subject, body_html)
    elif provider == "mailgun":
        await _send_mailgun(config, to, subject, body_html, body_text)
    else:
        raise ValueError(f"Proveedor de email no soportado: {provider}")


async def _send_smtp(
    config: dict,
    to: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> None:
    """
    Envía email vía SMTP.
    config keys: host, port, username, password, from_email, from_name, secure (bool)
    - port 465 → SMTP_SSL
    - port 587 → SMTP + STARTTLS
    - secure=False → SMTP plano
    """
    host = config["host"]
    port = int(config.get("port", 587))
    username = config["username"]
    password = config["password"]
    from_email = config.get("from_email", username)
    from_name = config.get("from_name", "")
    secure = config.get("secure", False)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to

    if body_text:
        msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    context = ssl.create_default_context()

    if port == 465 or secure:
        with smtplib.SMTP_SSL(host, port, context=context) as server:
            server.login(username, password)
            server.sendmail(from_email, to, msg.as_string())
    else:
        with smtplib.SMTP(host, port) as server:
            if port == 587:
                server.starttls(context=context)
            server.login(username, password)
            server.sendmail(from_email, to, msg.as_string())


async def _send_sendgrid(
    config: dict,
    to: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> None:
    """
    Envía email vía SendGrid API v3.
    config keys: api_key, from_email, from_name
    """
    import httpx

    api_key = config["api_key"]
    from_email = config["from_email"]
    from_name = config.get("from_name", "")

    content = []
    if body_text:
        content.append({"type": "text/plain", "value": body_text})
    content.append({"type": "text/html", "value": body_html})

    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": content,
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        r.raise_for_status()


async def _send_resend(
    config: dict,
    to: str,
    subject: str,
    body_html: str,
) -> None:
    """
    Envía email vía Resend API.
    config keys: api_key, from_email, from_name
    """
    import httpx

    api_key = config["api_key"]
    from_email = config["from_email"]
    from_name = config.get("from_name", "")

    from_field = f"{from_name} <{from_email}>" if from_name else from_email

    payload = {
        "from": from_field,
        "to": [to],
        "subject": subject,
        "html": body_html,
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        r.raise_for_status()


async def _send_mailgun(
    config: dict,
    to: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
) -> None:
    """
    Envía email vía Mailgun API.
    config keys: api_key, domain, from_email, from_name, region (us|eu, default us)
    """
    import httpx

    api_key = config["api_key"]
    domain = config["domain"]
    from_email = config["from_email"]
    from_name = config.get("from_name", "")
    region = config.get("region", "us")

    base_url = (
        "https://api.eu.mailgun.net" if region == "eu" else "https://api.mailgun.net"
    )
    url = f"{base_url}/v3/{domain}/messages"

    from_field = f"{from_name} <{from_email}>" if from_name else from_email

    data = {
        "from": from_field,
        "to": to,
        "subject": subject,
        "html": body_html,
    }
    if body_text:
        data["text"] = body_text

    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            data=data,
            auth=("api", api_key),
            timeout=15,
        )
        r.raise_for_status()
