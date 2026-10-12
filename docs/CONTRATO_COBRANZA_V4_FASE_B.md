# Contrato de API — Cobranza Inteligente v4, Fase B: Conversaciones (backend)

Base: `/api/cobranza/inteligente/` (JWT + rol de personal de cobranza: DIRECTOR, ADMINISTRADOR, COBRANZA, CAJERO, SISTEMAS).
Vale todo lo del [contrato de la Fase A](CONTRATO_COBRANZA_V4_FASE_A.md): **todas** las rutas de este documento responden `409 {"detail": "Cobranza Inteligente está apagada.", "apagada": true}` si ninguna sede accesible tiene el toggle encendido; errores `400 {"detail": "..."}`, `404 {"detail": "..."}`. Parámetro opcional `?sede=<id>`.
Instantes en ISO 8601. **Visibilidad:** el usuario ve las conversaciones de sus sedes accesibles **más** las que no tienen sede (sin vincular o de representantes con hijos en varias sedes).

Polling (cada 10–15 s, pausado con la pestaña oculta): lista y hilo aceptan `?desde=<iso>` y devuelven solo lo cambiado; ambos responden `ahora` (instante del servidor tomado **antes** de consultar): úsalo como siguiente `desde`. Las filas se fusionan por `id` (si llega una repetida, reemplaza).

---

## Objetos

### Conversación

```jsonc
{
  "id": 4,
  "telefono": "+584121234567",             // E.164, único: una conversación por número
  "nombre_contacto": "Maria P",            // nombre del perfil de WhatsApp ("" si no se conoce)
  "representante": { "id": 7, "nombre": "Maria Perez", "cedula": "V1", "telefono": "0412..." },   // null = "Sin vincular"
  "sede": 1,                               // null si sin vincular o con hijos en varias sedes
  "estado": "automatico",                  // "automatico" | "humano" (tomada por el cobrador)
  "requiere_humano": true,                 // la familia pidió una persona o escribió algo no reconocido
  "tomada_por": { "id": 2, "nombre": "Ana Cobranza" },   // null si automatico
  "tomada_en": "...",
  "ultimo_entrante_en": "...",             // último mensaje del representante (base de la ventana de 24 h)
  "ultimo_saliente_en": "...",
  "ultimo_humano_en": "...",               // último mensaje escrito por una persona
  "no_leidos": 2,
  "esperando": "",                         // "" | "comprobante" | "fecha_acuerdo" (paso del árbol de botones, fase C)
  "actualizado_en": "...",
  "ventana": { "abierta": true, "expira_en": "...", "segundos_restantes": 41300 },   // sin entrantes: abierta=false, expira_en=null
  "ultimo_mensaje": { "id": 31, "direccion": "entrante", "tipo": "texto", "cuerpo": "primeros 140 caracteres",
                      "estado_entrega": "", "creado_en": "..." }   // null si no hay (las notas no cuentan)
}
```

Cuando `ventana.abierta` es `false` el compositor debe pasar a "Enviar plantilla". Cuenta regresiva: `segundos_restantes` (o `expira_en`).

### Mensaje

```jsonc
{
  "id": 31,
  "direccion": "entrante",                 // "entrante" | "saliente" | "nota" (nota interna: la familia no la ve)
  "tipo": "texto",                         // texto | imagen | documento | boton | lista | plantilla | sistema
  "cuerpo": "Hola",                        // texto, caption, título del botón/lista, o aviso del sistema
  "payload": { },                          // ver abajo
  "estado_entrega": "",                    // solo salientes: "enviado" | "entregado" | "leido" | "fallido"
  "adjunto": { "url": "/api/cobranza/inteligente/mensajes/31/archivo/", "nombre": "foto.png", "tipo": "image/png" },   // o null
  "estado_adjunto": "",                    // "" | "pendiente" | "convertido" | "descartado" (fases C)
  "enviado_por": { "id": 2, "nombre": "Ana Cobranza" },   // null = sistema / representante
  "envio_cobranza": 55,                    // id del EnvioCobranza si es un recordatorio del motor, o null
  "creado_en": "...",
  "actualizado_en": "..."                  // cambia también al actualizarse la entrega
}
```

`tipo: "sistema"` (siempre `direccion: "nota"`) son avisos del hilo: "Conversación tomada por…", "devuelta al automático", "pidió la baja…". Muéstralos centrados y discretos.

`payload` según el caso:

| Caso | Contenido |
|---|---|
| saliente del motor | `{ "origen": "motor" }` |
| cobro manual desde Morosos | `{ "origen": "manual_wame" }` (Modo A) · `{ "origen": "manual_api" }` (Modo B, `tipo: "plantilla"`) |
| respuesta automática (bot) | `{ "origen": "bot", "motivo": "baja" }` |
| plantilla enviada por el cobrador | `{ "plantilla": "nombre_meta", "idioma": "es", "parametros": ["..."] }` |
| entrante botón / lista | `{ "boton_id": "YA_PAGUE", "titulo": "Ya pagué" }` (lista agrega `descripcion`) |
| entrante imagen / documento | `{ "media_id": "...", "mime_type": "image/png", "filename": "..." }`; si la descarga falló, `"media_error": "motivo"` y `adjunto: null` |
| saliente con `estado_entrega: "fallido"` | `{ "errores": [ { "code": 131026, "title": "..." } ] }` |

El archivo se descarga con **GET autenticado** (JWT): usa Axios con `responseType: 'blob'` y `URL.createObjectURL`; no sirve como `src` directo.

---

## GET `conversaciones/?desde=&filtro=&q=&limite=&sede=`

`filtro`: `todas` (defecto) · `no_leidas` · `requieren_humano` · `humano` · `automatico` · `sin_vincular` (otro valor → 400). `q`: busca en teléfono, nombre de contacto y nombre/apellido/cédula del representante. `limite` ≤ 200 (defecto 200). Orden: `actualizado_en` descendente.

```json
{ "ahora": "2026-07-20T10:00:00-04:00", "count": 2, "results": [ /* Conversación */ ] }
```
Con `desde` solo vienen las conversaciones cuyo `actualizado_en` es posterior (nuevo mensaje, tomar/devolver, leída, vincular, nota). **Los cambios de entrega (✓✓) de los salientes no mueven la lista**: se ven en el poll del hilo abierto. `desde` inválido → 400.

## GET `conversaciones/<id>/`

Una conversación (para entrar directo a `/conversaciones/:id`). `404` si no existe o no es accesible.

## POST `conversaciones/iniciar/`  `{ "representante_id": 7 }`

Devuelve la conversación del representante: la existente (vinculada a él) o la del teléfono del representante, creándola (vacía, `ventana.abierta=false`: solo se podrá enviar plantilla). `400` si no tiene teléfono válido. Úsalo en los botones `abrir_chat` cuya `conversacion` viene `null`.

## GET `conversaciones/<id>/mensajes/?desde=&limite=`

Sin `desde`: los últimos `limite` (defecto 100, máx. 200) en orden cronológico y `hay_mas`. Con `desde`: todo lo creado **o modificado** desde ese instante (incluye cambios de `estado_entrega`), en orden cronológico.

```json
{ "ahora": "...", "hay_mas": false, "count": 3, "conversacion": { /* Conversación */ }, "results": [ /* Mensaje */ ] }
```
Abrir el hilo **no** marca como leída: llama a `leida/` (o hazlo al abrirlo y al llegar mensajes con el hilo visible).

## POST `conversaciones/<id>/mensajes/`

Texto libre: `{ "cuerpo": "Buenas tardes" }` (JSON). Archivo (estado de cuenta en PDF o imagen): `multipart/form-data` con `archivo` y `cuerpo` opcional (pie de foto). JPG/PNG/WEBP/PDF, máx. 10 MB.
`201`:
```json
{ "mensaje": { /* Mensaje, estado_entrega "enviado" */ }, "conversacion": { /* Conversación ya actualizada */ } }
```
Errores:
- **Fuera de la ventana de 24 h** → `400 { "detail": "...", "ventana_cerrada": true }` (el compositor debería estar ya en modo plantilla; no se llama a Meta).
- Vacío / demasiado largo / archivo inválido → `400 { "detail": "..." }` (sin `ventana_cerrada`).
- Meta rechaza o falta configuración → `502 { "detail": "..." }` (no queda registrado nada).

**Efecto lateral:** escribir texto o un archivo en una conversación `automatico` la **toma** (`estado: "humano"`, `tomada_por` = usuario): así el motor deja de escribirle a la familia. Si ya era `humano`, solo limpia `requiere_humano`. Usa la `conversacion` de la respuesta para refrescar el encabezado (banner de takeover). Inserción optimista: agrega el mensaje y reconcilia por `id` con el siguiente poll.

## GET `conversaciones/plantillas/`

Plantillas aprobadas disponibles (las `PlantillaWhatsApp` activas con plantilla de Meta asociada):
```json
{ "count": 1, "results": [ { "id": 3, "nombre": "Recordatorio amable", "nombre_meta": "cobro_pendiente", "idioma": "es",
                              "cuerpo": "Hola {{representante.nombre}}…", "orden_parametros": [] } ] }
```

## POST `conversaciones/<id>/plantilla/`

Permitido **dentro y fuera** de la ventana; no toma la conversación.
Cuerpo: `{ "plantilla_id": 3, "parametros": ["Maria", "REF. 50,00"], "idioma": "es" (opcional), "cuerpo": "texto que verá el cobrador en el hilo" (opcional) }` **o** `{ "nombre": "reabrir_conversacion", "idioma": "es", "parametros": [...], "cuerpo": "..." }`.
`parametros` = valores posicionales del cuerpo de la plantilla en Meta ({{1}}, {{2}}…); deben coincidir en número con los de la plantilla aprobada (si no, Meta rechaza → 502). `cuerpo` es solo el texto que se guarda y se muestra en el hilo (si falta se guarda `[Plantilla: nombre]`).
`201 { "mensaje": { tipo: "plantilla", ... }, "conversacion": {...} }`. Errores: `400` plantilla inválida / `parametros` no es lista, `502` Meta.

## POST `conversaciones/<id>/nota/`  `{ "cuerpo": "Llamar mañana" }`

Nota interna (`direccion: "nota"`); la familia no la ve. `201 { "mensaje": {...} }`. `400` si está vacía.

## POST `conversaciones/<id>/tomar/` · `devolver/` · `leida/`

Sin cuerpo. Devuelven la **Conversación** actualizada.
- `tomar/`: `estado: "humano"`, `tomada_por`, `tomada_en`, limpia `requiere_humano`. El motor omite los envíos a ese representante (motivo `conversacion_humana`) y el árbol de botones no responde.
- `devolver/`: vuelve a `automatico`. También ocurre sola tras **3 días** sin mensajes del cobrador (tarea diaria 7:10).
- `leida/`: `no_leidos = 0`.

## POST `conversaciones/<id>/vincular/`  `{ "representante_id": 7 }`

Asocia la conversación a mano (y fija su `sede` si el representante tiene alumnos en una sola). Devuelve la Conversación. `400` si el representante no existe.

## GET `mensajes/<id>/archivo/`

Descarga autenticada del adjunto (`FileResponse`). `404` si no existe o no es accesible.

---

## Respuestas rápidas

Variables: `{nombre}`, `{saldo_usd}`, `{saldo_bs}`, `{alumnos}`, `{link_portal}`, `{datos_bancarios}`. Las variables desconocidas se dejan tal cual. **Los montos los calcula el servidor** (el frontend no debe calcularlos).

```jsonc
{ "id": 1, "sede": null, "titulo": "Saldo", "cuerpo": "Hola {nombre}, su saldo es ${saldo_usd}", "activa": true, "orden": 0 }
```

| Método | Ruta | Detalle |
|---|---|---|
| GET | `respuestas-rapidas/?conversacion=<id>&todas=1` | `{count, results}`. Solo activas salvo `todas=1`. Con `conversacion`, cada fila agrega `cuerpo_renderizado` con las variables de esa conversación ya resueltas (sin representante vinculado: `{nombre}` usa el nombre del contacto y los saldos quedan vacíos) |
| POST | `respuestas-rapidas/` | `{titulo, cuerpo, sede?, activa?, orden?}` → `201`. `sede` null = todas las sedes. `400` si falta título o texto |
| PATCH | `respuestas-rapidas/<id>/` | cualquiera de esos campos → `200` |
| DELETE | `respuestas-rapidas/<id>/` | `204` |

---

## Cambios en endpoints de la Fase A

- **`contadores/`**: `no_leidos` ahora es la suma de `no_leidos` de las conversaciones visibles; `total = no_leidos + tarjetas_urgentes` (badge del sidebar).
- **`hoy/`**: las acciones `abrir_chat` ahora vienen con `"disponible": true` y `"conversacion": <id | null>`. Con `null` primero `POST conversaciones/iniciar/` con `representante.id` de la tarjeta. Ruta sugerida: `/cobranza/inteligente/conversaciones/<id>`.
- **Tarjetas nuevas** (misma forma que las de la Fase A; `clave` estable para `.../hecha/`):

| `tipo` | `clave` | Cuándo | Acciones | `detalle` |
|---|---|---|---|---|
| `conversacion_espera` | `conversacion_espera:<id>` | `requiere_humano`, o el representante escribió hace más de 2 h y nadie le respondió (últimos 14 días). `urgente` = `requiere_humano`. `representante` puede ser `null` (sin vincular) | `abrir_chat` (`conversacion`) | `conversacion`, `telefono`, `requiere_humano`, `no_leidos`, `estado`, `ultimo_entrante_en` |
| `conversacion_tomada` | `conversacion_tomada:<id>` | `estado: humano` sin mensajes del cobrador hace más de 24 h | `abrir_chat` "Responder" (`conversacion`), **`devolver_automatico`** "Devolver al automático" (`conversacion`; llama a `devolver/`) | `conversacion`, `telefono`, `tomada_en`, `horas_sin_actividad` |

  Marcar una de estas como hecha la oculta hasta que llegue un mensaje nuevo (espera) o pasen otras 24 h de inactividad (tomada).
- **`motor/simulacion/`** y `procesar_envio`: nuevos `motivos_omision` **`conversacion_humana`** (conversación tomada) y **`comprobante_pendiente`** (hay un adjunto entrante con `estado_adjunto: "pendiente"`; la Fase C lo activa, hoy ningún adjunto queda pendiente). Mostrar etiquetas: "Conversación tomada por el cobrador" / "Comprobante por WhatsApp sin resolver".
- **Cobro manual de Morosos** (con toggle encendido): los envíos Modo A y B quedan registrados como salientes en la conversación del número (`payload.origen` `manual_wame` / `manual_api`). `puede_enviar_cobro` ya devolvía el aviso `conversacion_humana` (ahora con datos reales).

## Configuración (`/api/notificaciones/configuracion/`, roles director/sistemas/administrador)

Nuevos campos en GET/PATCH: `meta_app_secret` (se devuelve enmascarado `••••xxxx`; no reenviar el placeholder), `meta_webhook_verify_token`, `meta_waba_id`. URL a registrar en Meta: `https://<dominio>/api/notificaciones/whatsapp/webhook/` (ver `octopus-api/WHATSAPP_META_WEBHOOK.md`). El webhook no es parte de este contrato de UI: no usa JWT.

## Fuera de esta fase (no existe todavía)

`adjuntos/<id>/convertir-comprobante/`, `adjuntos/<id>/descartar/`, el árbol de botones (Ya pagué / Necesito un acuerdo / Hablar con alguien), `esperando` distinto de `""` y envío del recordatorio por plantilla de Meta. Los mensajes `boton` / `lista` entrantes se guardan y se muestran, pero el sistema todavía no responde.
