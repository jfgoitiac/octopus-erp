# Contrato de API — Cobranza Inteligente v4, Fase C: botones, comprobantes por WhatsApp y link al portal (backend)

Base: `/api/cobranza/inteligente/`. Todo lo de las [Fase A](CONTRATO_COBRANZA_V4_FASE_A.md) y [Fase B](CONTRATO_COBRANZA_V4_FASE_B.md) sigue vigente: JWT + rol de personal de cobranza, `409 {"detail": "Cobranza Inteligente está apagada.", "apagada": true}` si ninguna sede accesible tiene el toggle encendido, errores `400/404 {"detail": "..."}`, visibilidad por sedes (más las conversaciones sin sede) y polling con `?desde=`.

Esta fase **no cambia** ningún endpoint de la B; agrega tres rutas, una tarjeta nueva en Hoy y comportamiento automático (árbol de botones y pausa por comprobante).

---

## 1. Qué hace el sistema solo (sin endpoint)

### Recordatorios con botones
Si una regla del motor tiene `plantilla_meta` (nombre de plantilla aprobada por Meta) y el proveedor de WhatsApp es Meta, el recordatorio sale como **plantilla con 3 botones de respuesta rápida**; si no, texto libre/email como siempre. El saliente aparece en el hilo así:

```jsonc
{ "direccion": "saliente", "tipo": "plantilla",
  "cuerpo": "texto equivalente que verá el cobrador…",
  "payload": { "origen": "motor", "plantilla": "cobro_seguimiento", "idioma": "es",
               "parametros": ["Maria", "Ana Perez", "50.00", "Bs. 2.025,00", "17/07/2026", "https://…/portal?pagar=1"],
               "botones": ["YA_PAGUE", "NECESITO_ACUERDO", "HABLAR"] },
  "envio_cobranza": 55 }
```
Variables posicionales del cuerpo de la plantilla en Meta (`{{1}}`…`{{6}}`): nombre del representante, alumnos, saldo USD, referencia en Bs (tasa de ese momento, `-` si no hay tasa), vencimiento más próximo (`dd/mm/aaaa`), link al portal. Botones, **en este orden** en la plantilla: `Ya pagué` · `Necesito un acuerdo` · `Hablar con alguien` (payloads `YA_PAGUE`, `NECESITO_ACUERDO`, `HABLAR`). La regla se edita por ahora desde el admin de Django (el editor de reglas es de la Fase D).

### Árbol de botones
Solo actúa si la conversación está en `estado: "automatico"`; en `humano` no responde. Los mensajes del sistema salen con `payload.origen = "bot"` y un `payload.motivo`.

| El representante… | El sistema |
|---|---|
| toca **Ya pagué** | responde "Envíanos la foto o el PDF del comprobante por aquí." y deja `esperando: "comprobante"` |
| toca **Necesito un acuerdo** | envía un mensaje **interactivo de lista** (`tipo: "lista"`, `payload.filas`) con 3 fechas (+3, +7, +14 días; `id` = `FECHA_ACUERDO:<aaaa-mm-dd>`) y deja `esperando: "fecha_acuerdo"` |
| elige una fecha | crea la **promesa** (`ConvenioPago` `tipo: "promesa"`, `origen: "whatsapp"`, una cuota con el saldo de todas sus deudas abiertas), **pausa** los ciclos, deja `esperando: ""`, agrega la nota de sistema "El representante prometió pagar el …" y confirma la fecha. Tocar la lista dos veces no duplica la promesa; una fecha fuera de rango vuelve a ofrecer la lista |
| toca **Hablar con alguien** | `requiere_humano: true` y responde "Te escribiremos en horario de atención." → aparece la tarjeta `conversacion_espera` |
| escribe texto libre / toca un botón desconocido | `requiere_humano: true`, sin respuesta automática |
| escribe BAJA / STOP / NO MAS | `BajaCobranza` de WhatsApp + confirmación (Fase B) |
| "Necesito un acuerdo" sin representante vinculado o sin deuda abierta | `requiere_humano: true` + "Te escribiremos en horario de atención." |

La promesa vencida sin pago se maneja con lo de la Fase A (`revisar_convenios` + tarjeta `promesa_vencida`). Para la UI: los convenios con `origen: "whatsapp"` se pueden etiquetar "Creada por el representante por WhatsApp".

### Comprobantes entrantes
Una imagen o PDF recibido queda con **`estado_adjunto: "pendiente"`** (aunque la conversación esté tomada). Efectos:
- El motor **omite** los envíos a ese representante con el motivo `comprobante_pendiente` (también en `motor/simulacion/`) hasta que se convierta o descarte.
- Si la conversación está en `automatico`, responde "Recibimos tu comprobante, lo revisaremos en las próximas horas." (un solo acuse si llegan varios seguidos en 10 minutos) y cierra el paso `esperando: "comprobante"`.
- Si Meta no entrega el archivo (`payload.media_error`, `adjunto: null`, `estado_adjunto: ""`): `requiere_humano: true` y se avisa a la familia.
- Aparece una tarjeta en Hoy (ver §3).

---

## 2. Endpoints nuevos

### POST `adjuntos/<mensaje_id>/convertir-comprobante/`

Convierte el adjunto pendiente en comprobante(s) de pago del portal (`ComprobantePago`, estatus `pendiente`), que entran al **flujo de revisión y aprobación existente** (pantalla de revisión de comprobantes / pagos en revisión): no se duplica ese flujo. Se crea **un comprobante por mensualidad** elegida (el mismo archivo se copia a cada uno).

```jsonc
// body (JSON)
{ "mensualidades": [123, 124],          // obligatorio: ids de GET conversaciones/<id>/mensualidades-pendientes/
  "referencia_bancaria": "ab 123",      // opcional (se normaliza a mayúsculas); si ya existe en otro comprobante pendiente/aprobado → 400
  "metodo_pago": "transferencia",       // opcional; transferencia (defecto) | pago_movil | punto_de_venta | zelle | efectivo | otro
  "banco_receptor_id": 3 }              // opcional
```
`201`:
```jsonc
{ "mensaje": { /* Mensaje con estado_adjunto "convertido" y payload.comprobantes = [ids] */ },
  "comprobantes": [ { "id": 9, "estatus": "pendiente", "mensualidad": 123, "alumno": "Ana Perez",
                      "periodo": "Julio 2026", "monto_usd": "50.00" } ],
  "conversacion": { /* Conversación */ } }
```
Errores `400 {"detail"}` (mostrar el texto): adjunto ya convertido/descartado o mensaje sin adjunto; **conversación sin representante vinculado** ("Vincule la conversación…": usa `vincular/` primero); lista vacía o ids inválidos; mensualidad ajena/pagada/inexistente; una mensualidad ya con comprobante en revisión; el mismo archivo ya presentado como comprobante (pendiente o aprobado) → descartarlo; método de pago o banco inválidos. `404` mensaje inexistente/no accesible. Se agrega una nota de sistema al hilo.

### POST `adjuntos/<mensaje_id>/descartar/`

`{ "motivo": "Foto borrosa, no es un pago" }` (obligatorio, máx. 300). `200 { "mensaje": { /* estado_adjunto "descartado", payload.motivo_descarte */ } }`. `400` sin motivo o adjunto ya resuelto. Deja una nota de sistema y libera al motor.

### GET `conversaciones/<id>/mensualidades-pendientes/`

Mensualidades impagas de los alumnos activos del representante vinculado, para el selector del modal de conversión. Sin representante vinculado: `representante: null` y lista vacía.

```json
{ "representante": { "id": 7, "nombre": "Maria Perez", "cedula": "V1", "telefono": "0412..." }, "count": 1,
  "results": [ { "id": 123, "alumno": "Ana Perez", "alumno_id": 4, "mes": 7, "anio": 2026, "periodo": "Julio 2026",
                 "monto_usd": "50.00", "saldo_usd": "50.00", "tiene_comprobante_pendiente": false } ] }
```
Las filas con `tiene_comprobante_pendiente: true` no se pueden elegir (el POST las rechaza).

Estas tres rutas usan los mismos permisos, el mismo `?sede=` y el mismo `409` "apagada" que el resto.

---

## 3. Tarjeta nueva en Hoy

Misma forma que las demás (`clave` estable para `.../hecha/`):

| `tipo` | `clave` | Cuándo | Acciones | `detalle` |
|---|---|---|---|---|
| `comprobante_whatsapp` | `comprobante_whatsapp:<mensaje_id>` | adjunto entrante con `estado_adjunto: "pendiente"`. `urgente` a partir de 24 h. `representante` es `null` si la conversación no está vinculada | **`convertir_comprobante`** "Asignar a mensualidad" (`mensaje`, `conversacion`; **solo si hay representante vinculado**), `abrir_chat` (`conversacion`), **`descartar_comprobante`** "Descartar" (`mensaje`, `conversacion`) | `conversacion`, `mensaje`, `telefono`, `vinculado`, `horas_sin_asignar`, `adjunto` |

`convertir_comprobante` abre el modal de conversión (mensualidades de `mensualidades-pendientes/` + datos opcionales); `descartar_comprobante` pide el motivo. La tarjeta desaparece al resolver el adjunto. Cuenta en el KPI de comprobantes por aprobar y en el badge `urgentes` del sidebar si es urgente. Si no hay representante vinculado, la acción útil es `abrir_chat` → vincular.

---

## 4. Cambios en objetos y endpoints existentes

- **Mensaje**: `estado_adjunto` ahora toma valores reales (`pendiente` / `convertido` / `descartado`). Para entrantes pendientes la UI puede mostrar los botones "Asignar a mensualidad" y "Descartar" directamente en la burbuja. Tras resolver, `payload` trae `comprobantes` (convertido) o `motivo_descarte` (descartado), más `resuelto_por` y `resuelto_en`. El mensaje cambia `actualizado_en`, así que el poll del hilo lo recoge.
- **Mensaje `tipo: "lista"` saliente** (nuevo): `cuerpo` = pregunta, `payload.filas` = `[{id, title, description}]` para mostrarlas como opciones de solo lectura.
- **Conversación**: `esperando` ahora toma `"comprobante"` / `"fecha_acuerdo"` (se puede mostrar "Esperando comprobante…"). El árbol limpia `requiere_humano` solo al tomar la conversación (Fase B); los botones "Hablar con alguien" lo activan.
- **`{link_portal}`** (respuestas rápidas y recordatorios): ahora es `<dominio>/portal?pagar=1`, el enlace que abre la sección de pago. El portal de representantes debe abrir el modal "Pagar por transferencia" cuando recibe `?pagar=1` (pendiente del frontend del portal; mientras tanto el enlace aterriza en el dashboard del portal, donde está el botón). También lo usa el texto libre de los recordatorios del motor.
- **`motor/simulacion/` y `EnvioCobranza.motivo_omision`**: `comprobante_pendiente` ya es real ("Comprobante por WhatsApp sin resolver").
- **Configuración / Meta**: las plantillas de cobro (`cobro_preventivo`, `cobro_vence_hoy`, `cobro_seguimiento`, `cobro_prioritario`) deben crearse en Meta con **3 botones de respuesta rápida** en el orden indicado arriba y 6 variables en el cuerpo; el nombre aprobado se carga en `ReglaCobranza.plantilla_meta`.

## Cambios posteriores

- **Tarjeta `comprobante_whatsapp`: campo `adjunto`.** La tarjeta trae `adjunto` (también repetido en `detalle.adjunto`) con el mismo formato que `adjunto` de un mensaje del hilo: `{ id, url, nombre, tipo, estado }`. `id` es el id del mensaje, `url` es `/api/cobranza/inteligente/mensajes/<id>/archivo/` (descarga autenticada; sirve de preview para imágenes), `tipo` el MIME (`image/png`, `application/pdf`…) y `estado` el `estado_adjunto` (`pendiente` mientras la tarjeta está visible). Es `null` solo si el mensaje no conserva archivo.
- **Pruebas:** las llamadas salientes a `graph.facebook.com` quedan bloqueadas por el runner (`config/test_runner.py`, `TEST_RUNNER` en settings): responden `403` simulado sin salir a la red.
