"""
WhatsApp Service — Meta Business Cloud API (oficial)
Stubs preparados para Twilio y 360dialog (comentados).

Para activar Meta:
1. Crear app en developers.facebook.com
2. Agregar producto WhatsApp Business
3. Obtener Phone Number ID y Access Token permanente
4. Registrar webhook para recibir confirmaciones de entrega
"""
import httpx
from typing import Optional


async def send_whatsapp(
    config: dict,   # config desencriptada del proveedor
    to: str,        # número en formato internacional: +58412...
    message: str,
) -> None:
    """Envía mensaje WhatsApp usando el proveedor configurado."""
    provider = config.get("provider", "meta")

    if provider == "meta":
        await _send_meta(config, to, message)
    elif provider == "twilio":
        await _send_twilio(config, to, message)
    elif provider == "360dialog":
        await _send_360dialog(config, to, message)
    else:
        raise ValueError(f"Proveedor WhatsApp no soportado: {provider}")


async def _send_meta(config: dict, to: str, message: str) -> None:
    """Meta Business Cloud API — la opción más oficial."""
    phone_number_id = config["phone_number_id"]
    access_token = config["access_token"]
    url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to.replace("+", "").replace(" ", ""),
        "type": "text",
        "text": {"body": message},
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        r.raise_for_status()


# TODO: implementar cuando se decida usar Twilio
async def _send_twilio(config: dict, to: str, message: str) -> None:
    """
    Stub Twilio WhatsApp API.
    Requiere: account_sid, auth_token, from_number (formato whatsapp:+1415...)

    Implementación futura:
    from twilio.rest import Client
    client = Client(config["account_sid"], config["auth_token"])
    client.messages.create(
        body=message,
        from_=f"whatsapp:{config['from_number']}",
        to=f"whatsapp:{to}"
    )
    """
    raise NotImplementedError("Integración Twilio pendiente de implementación")


# TODO: implementar cuando se decida usar 360dialog
async def _send_360dialog(config: dict, to: str, message: str) -> None:
    """
    Stub 360dialog WhatsApp API.
    Requiere: api_key_360, channel_id
    Documentación: https://docs.360dialog.com
    """
    raise NotImplementedError("Integración 360dialog pendiente de implementación")
