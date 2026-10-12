# Webhook de WhatsApp (Meta Cloud API) — Conversaciones de Cobranza Inteligente

Permite que el sistema **reciba** los mensajes de las familias y las confirmaciones de entrega (enviado / entregado / leído / fallido). Sin esto el módulo Conversaciones solo puede enviar.

## Qué necesitas

1. Una app de Meta con el producto **WhatsApp** y el número del colegio ya registrado.
2. Una URL pública **HTTPS** hacia la API (el nginx del servidor ya la expone).
3. Tres valores, que se cargan en **Configuración → Notificaciones → WhatsApp** (o en el admin de Django, `Configuración de Notificaciones`):

| Campo | De dónde sale |
|---|---|
| `meta_whatsapp_token` | Token permanente del usuario del sistema (ya existente) |
| `meta_whatsapp_phone_id` | ID del número de teléfono (ya existente) |
| `meta_app_secret` | Meta for Developers → tu app → Configuración → Básica → **Clave secreta de la app**. Se guarda cifrado |
| `meta_webhook_verify_token` | Una cadena larga y aleatoria que inventas tú (la misma que escribirás en Meta) |
| `meta_waba_id` | ID de la cuenta de WhatsApp Business (informativo) |

Alternativa por variables de entorno (solo si no están en la base de datos): `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`.

## Registrar el webhook en Meta

1. Meta for Developers → tu app → **WhatsApp → Configuración** → *Webhook* → **Editar**.
2. **URL de devolución de llamada:** `https://TU-DOMINIO/api/notificaciones/whatsapp/webhook/`
3. **Token de verificación:** el valor de `meta_webhook_verify_token`.
4. Pulsa **Verificar y guardar**. Meta hace un `GET` con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; el sistema devuelve el `challenge` solo si el token coincide.
5. En *Campos del webhook* suscribe **`messages`** (cubre mensajes entrantes y estados de entrega).

## Cómo se protege

- **Firma obligatoria.** Cada `POST` trae `X-Hub-Signature-256: sha256=<hmac>`; el sistema recalcula el HMAC-SHA256 del cuerpo con `meta_app_secret` y compara en tiempo constante. Si no coincide, o si no hay secreto configurado, responde **403** y no guarda nada.
- Sin JWT (Meta no puede enviarlo): la firma es la autenticación.
- Responde **200** de inmediato y procesa en una tarea Celery (`notificaciones.tasks.procesar_webhook_meta`). Si el broker está caído procesa en línea para no perder el evento.
- **Idempotente:** Meta reintenta; el `wa_message_id` único evita mensajes duplicados.
- Solo procesa eventos del número configurado (`meta_whatsapp_phone_id`); ignora otros números de la misma app.
- Recomendado en nginx: `limit_req` sobre `/api/notificaciones/whatsapp/webhook/` y no registrar el cuerpo en los logs de acceso.

## Qué hace con cada evento

- **Texto, imagen, documento, botón de plantilla e interactivo (lista):** crea o actualiza la conversación del número, guarda el mensaje y suma un no leído. Se vincula al representante solo si el teléfono coincide con **uno**; con varios o ninguno queda "Sin vincular".
- **Imágenes y PDF:** descarga el archivo de Meta (token) y lo guarda como adjunto con los mismos límites del portal (10 MB; JPG, PNG, WEBP o PDF; se verifican los bytes reales). Los archivos se ven solo con sesión (`GET /api/cobranza/inteligente/mensajes/<id>/archivo/`); no los publiques por `/media/` en nginx (`whatsapp_adjuntos/`).
- **BAJA, STOP, NO MAS** (sin importar mayúsculas, tildes o puntuación): crea la baja de cobranza por WhatsApp del representante y le confirma por el mismo chat.
- **Cualquier otro texto libre:** marca la conversación `requiere_humano` (aparece una tarjeta en Hoy). No se intenta interpretar.
- **Estados (`statuses`):** actualizan la entrega del saliente (`enviado → entregado → leído`, nunca hacia atrás). Un `failed` marca el mensaje como fallido y, si era un recordatorio del motor solo por WhatsApp, lo devuelve a reintento (máximo 3 intentos).

## Probar sin Meta

```bash
cd octopus-api
python - <<'PY'
import hashlib, hmac, json, time
secreto = "TU_APP_SECRET"
cuerpo = json.dumps({"object": "whatsapp_business_account", "entry": [{"id": "W", "changes": [{"field": "messages", "value": {
  "messaging_product": "whatsapp", "metadata": {"phone_number_id": "TU_PHONE_ID"},
  "contacts": [{"profile": {"name": "Prueba"}, "wa_id": "584121234567"}],
  "messages": [{"from": "584121234567", "id": "wamid.PRUEBA1", "timestamp": str(int(time.time())),
                "type": "text", "text": {"body": "Hola"}}]}}]}]}).encode()
print(hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest())
open("payload.json", "wb").write(cuerpo)
PY
curl -X POST https://TU-DOMINIO/api/notificaciones/whatsapp/webhook/ \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=<hex impreso arriba>" \
  --data-binary @payload.json
```

Debe responder `{"status":"ok"}` y el mensaje aparece en Cobranza Inteligente → Conversaciones (≤ 15 s por el polling). Repetir el mismo `curl` no crea un segundo mensaje.

## Ventana de 24 h y plantillas

Meta solo permite texto libre dentro de las 24 h posteriores al último mensaje del representante. Fuera de esa ventana el sistema solo deja enviar **plantillas aprobadas** (`POST .../conversaciones/<id>/plantilla/`). Las plantillas se tramitan en Meta Business Manager (categoría *Utility*; ver §6 del plan).

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Meta no valida la URL | `meta_webhook_verify_token` distinto al escrito en Meta, o URL no pública / sin HTTPS válido |
| Los mensajes no aparecen y Meta muestra 403 | `meta_app_secret` vacío o incorrecto |
| Aparecen en el log pero no en pantalla | La sede tiene Cobranza Inteligente apagada, o el worker/beat de Celery no corre (`ARRANQUE_CELERY.md`) |
| Mensaje entrante sin imagen | Token vencido o sin permiso de medios; revisa `payload.media_error` del mensaje |
| La conversación sale "Sin vincular" | El teléfono del representante no coincide, o lo comparten dos representantes: usa *Vincular* |
