# Contrato — WhatsApp (Meta) por sede

Resuelve la deuda "`ConfiguracionNotificaciones` pk=1: un número de WhatsApp por instalación"
(§9 de `PLAN_COBRANZA_INTELIGENTE_V4.md`). Una sede puede escribir y recibir por **su propio
número** de la Cloud API de Meta; las que no lo configuran siguen usando la configuración
general exactamente como antes. Una instalación de una sola sede no cambia: no hay filas por
sede, así que todo hereda.

## Modelo

`notificaciones.ConfiguracionWhatsAppSede` (0 o 1 por sede, `OneToOne` a `multisede.Sede`):

| Campo | Notas |
|---|---|
| `activo` | Apagado = la sede hereda la general. Solo se puede encender con token y Phone ID. |
| `numero_visible` | Informativo (ej. `+58 412 5551111`). |
| `meta_whatsapp_phone_id` | Único entre sedes (restricción parcial, ignora vacíos) y distinto del general. Enruta el webhook. |
| `meta_whatsapp_token` | **Cifrado** en reposo (`EncryptedTextField`). |
| `meta_waba_id` | Informativo. |
| `meta_app_secret` | **Cifrado**. Vacío = usa el App Secret general (misma app de Meta). |
| `meta_webhook_verify_token` | Vacío = usa el general. |

Solo Meta: el proveedor efectivo de una sede con número propio es siempre `meta`, aunque el
general sea Twilio. Twilio y `director_whatsapp` siguen siendo solo generales.

`ConversacionWhatsApp.phone_id_entrante` (nuevo): Phone Number ID por el que escribió la
familia la última vez. La respuesta sale por **ese** número (la ventana de 24 h es por número).

Migración `0013_whatsapp_por_sede`: solo esquema, no crea filas. La configuración existente
(pk=1 + variables de entorno) pasa a ser el fallback sin tocarla.

## Resolución única: `notificaciones/config_whatsapp.py`

- `get_config_whatsapp(sede)` → `ConfigWhatsApp(origen, sede_id, activo, proveedor, token, phone_id, waba_id, app_secret, verify_token, numero_visible, twilio_*)`.
  `sede` puede ser `Sede`, id o `None` (= general). Usa la fila de la sede solo si
  `activo` **y** tiene token y Phone ID; si no, la general (`origen='general'`).
  Los secretos vacíos de la sede (`app_secret`, `verify_token`) heredan los generales.
- `config_por_phone_id(pid)` → config dueña de ese Phone ID (sede activa o general) o `None`.
- `verify_tokens()` → tokens válidos del GET del webhook (general + sedes activas).
- `sede_id_de_representante(rep)` → su sede si todos sus alumnos activos están en una; si no, `None`.

Nadie más lee `meta_whatsapp_*` para enviar. Quien envía recibe la sede:

| Flujo | Sede usada |
|---|---|
| `services.enviar_whatsapp(..., sede=)` / `enviar_whatsapp_documento(..., sede=)` | la indicada; `None` = general |
| Recordatorios de mora, pago exitoso | `alumno.sede_id` |
| Bienvenida al portal | `sede_id_de_representante(rep)` |
| Motor de cobranza (`cobranza/motor.py`) | sede del representante, o la de la regla |
| Cobro por WhatsApp (modo B) | sede del representante (y exige que esa config esté activa) |
| Probar (`POST notificaciones/probar/`, `sede_id` opcional) | la indicada |
| Conversaciones (texto, lista, documento, plantilla, bot, descarga de media) | `config_de_conversacion(conv)`: el número por el que escribió la familia; si nunca escribió, el de `conv.sede` / sede del representante; si no, la general |

## Webhook `POST/GET /api/notificaciones/whatsapp/webhook/` (una sola URL para todas las sedes)

- **Enrutado:** cada `change` se asigna por `metadata.phone_number_id` a la sede dueña (o a la
  general). Una conversación nueva por el número de una sede nace con esa `sede`; una sin sede
  la toma del número. Un Phone ID que no es de ninguna sede ni de la general se **ignora**
  (si la general no tiene Phone ID configurado, todo va a la general, como antes).
- **Firma `X-Hub-Signature-256`:** se valida contra el App Secret de **cada** número del payload
  (el de su sede, o el general para números sin dueño sede). Un payload legítimo cumple todos
  (Meta firma con una sola app); uno firmado con el secreto de una sede que incluya eventos de
  otra se rechaza (403). Sin secreto aplicable, 403.
- **Verificación GET:** acepta el `verify_token` general o el de cualquier sede activa.

## API (JWT del panel)

Solo roles `director`, `administrador`, `sistemas` (los demás: 403). Una sede fuera del alcance
del usuario (`PermisoSede`; sin permisos o `directivo_red` = todas) responde **404**.

- `GET notificaciones/whatsapp-sedes/` → `{"results": [<sede>...]}` (sedes activas accesibles).
- `GET|PATCH|DELETE notificaciones/whatsapp-sedes/<sede_id>/`
  - `PATCH` acepta `activo, numero_visible, meta_whatsapp_phone_id, meta_whatsapp_token, meta_waba_id, meta_app_secret, meta_webhook_verify_token`. Un secreto que llega como `••••xxxx` o `***` se ignora (no es un cambio). Crea la fila si no existe.
    Errores 400: Phone ID no numérico o ya usado por otra sede/la general; activar sin token o sin Phone ID.
  - `DELETE` borra la fila: la sede vuelve a la general (idempotente).

```jsonc
{
  "sede": {"id": 2, "nombre": "Sede Sur"},
  "activo": true, "numero_visible": "+58 412 5551111",
  "meta_whatsapp_phone_id": "555111", "meta_waba_id": "WABA-S", "meta_webhook_verify_token": "",
  "meta_whatsapp_token": "••••1234", "meta_app_secret": "••••9876",   // enmascarados; "" si no hay
  "usa_configuracion_general": false,                                 // true = hereda
  "efectiva": {"origen": "sede", "phone_id": "555111", "numero_visible": "...", "proveedor": "meta"}
}
```

**Secretos:** nunca salen en claro por la API (`••••` + últimos 4), ni en `LogAuditoria`.

**Auditoría** (`LogAuditoria`, módulo `notificaciones`): cada `PATCH`/`DELETE` por sede registra
`sede_id`, nombres de campos tocados y cuáles eran secretos (sin valores). El `PATCH` de
`notificaciones/configuracion/` también audita ahora los cambios de campos de WhatsApp.

## Frontend

Configuración → Notificaciones → tarjeta **WhatsApp por sede** (`components/configuracion/WhatsAppPorSede.jsx`,
hook `hooks/useWhatsAppSedes.js`, servicio `services/whatsappSedes.js`). Solo aparece con 2 o más
sedes. Selector de sede; texto "usa la configuración general" cuando hereda; campos en grilla
`grid-cols-1 sm:grid-cols-2`; confirmación de "volver a la general" en `Modal`; botón "Probar con
esta sede". Los secretos solo se reenvían si se escribió uno nuevo.

## Límites conocidos

- `NotificacionLog` no guarda la sede de origen (el número usado queda en el log del proveedor de Meta).
- Alertas al director (`director_whatsapp`) salen por el número de la sede del alumno, pero el destino sigue siendo uno solo global.
- Plantillas de Meta (`PlantillaWhatsApp`) siguen siendo globales: deben estar aprobadas en la WABA de cada número que las use.
- Una familia que escribe a dos números de sedes distintas comparte una sola conversación (única por teléfono); responde el último número por el que escribió.
