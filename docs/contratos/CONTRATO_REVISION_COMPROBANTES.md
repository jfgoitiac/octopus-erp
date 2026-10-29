# Contrato — Revisión de comprobantes del portal (2026-10-29)

Repo (worktree): C:\Octopus\.claude\worktrees\representantes-comprobantes-flujo-9dc0df
Backend Django: octopus-api/ · Frontend React 19 + Vite: octopus-frontend/
`apiClient` (octopus-frontend/src/api/apiClient.js) tiene baseURL `/api/`; las rutas de abajo son relativas a eso.
El portal del representante usa su propio cliente (ver octopus-frontend/src/portal/api/).

## Decisión del usuario (manda sobre todo lo demás)

**El representante SOLO sube el archivo del comprobante** (y elige la mensualidad, como hoy). Ya no escribe referencia, banco ni método.
**El revisor del colegio llena todos los datos** al revisar: referencia, banco receptor, método, fecha del pago, monto recibido y moneda. Todos obligatorios para aprobar. El formulario NO se prellena con datos del representante (solo si un comprobante viejo ya los trae). El saldo pendiente se muestra como referencia, pero el monto lo escribe el revisor.

## Reglas de negocio

- Subida en el portal (`POST portal/comprobante/`): solo `archivo` + `mensualidad_id`. Si llegan `referencia_bancaria`/`metodo_pago`/`banco_receptor_id` se ignoran (compatibilidad con clientes viejos). Se mantienen los antifraudes de archivo (validación, hash duplicado, un pendiente por mensualidad). El antifraude de referencia pasa a la aprobación.
- Al APROBAR: si la referencia (misma clave referencia + método + banco) ya existe en otro comprobante aprobado/pendiente o en un `Pago` completado/en revisión → **400** con `campos.referencia`, no se aprueba. El hash de archivo repetido sigue como advertencia.
- Moneda por defecto según método: `USD` para zelle/efectivo, `VES` para el resto (el revisor puede cambiarla).
- Tasa = `finanzas.monedas.tasa_para_fecha(fecha_pago)` (BCV de esa fecha o la última anterior). No la última del sistema. Sin tasa y moneda VES → 400.
- monto en USD = VES / tasa (o el monto directo si es USD), redondeado con `finanzas.monedas.redondear`.
- Se abona a la mensualidad igual que en caja: `monto_pagado += min(abono, saldo)` y `registrar_aplicacion(pago, mensualidad, abono)` (cobranza/deudas.py). Si el abono es menor que el saldo, es pago parcial y la mensualidad sigue pendiente (advertencia informativa). Si excede, se aplica solo el saldo y se devuelve `excedente_usd` con una advertencia (no se crea saldo a favor; anotarlo en NOTAS_TECNICAS.md).
- El `Pago` se crea con: monto_usd = USD realmente recibido (no el nominal), tasa_aplicada = tasa de la fecha, monto_ves coherente, fecha_pago = fecha_pago (datetime a mediodía local), y la referencia, banco y método que puso el revisor.
- Al RECHAZAR: `motivo_rechazo_id` (catálogo) y/o `observaciones` (texto libre); al menos uno obligatorio. El texto visible al representante = texto del motivo + "\n" + observaciones (si hay).
- Al aprobar o al rechazar se crea un `AvisoPortal` para el usuario del portal del representante y se envía push (tipo push `factura`). Al rechazar se envía además un email. Los textos salen de `PlantillaAviso` (personalizables). Las notificaciones son best-effort y van fuera del atomic de dinero.
- Fechas visibles al usuario en frontend: date-fns con locale `es`.

## Endpoints de administración (roles director, sistemas, administrador, cobranza)

### GET `portal/admin/comprobantes/?estatus=pendiente`
Lista existente; se le agregan los campos `referencia_bancaria`, `metodo_pago`, `banco_receptor_id`, `banco_receptor_nombre` (pueden venir null).

### GET `portal/admin/comprobantes/<id>/`
```json
{
  "id": 12, "estatus": "pendiente", "fecha_subida": "2026-10-29T10:12:00-04:00",
  "archivo_url": "https://.../media-protegido/comprobantes/x.jpg/",
  "archivo_tipo": "imagen",
  "alumno": "Amelia Rojas", "grado": "Sala 4",
  "representante": "Mariangeles Rodríguez", "representante_cedula": "30354677",
  "mensualidad_id": 99, "mensualidad": "Octubre 2026",
  "monto_usd": "30.00", "monto_pagado_usd": "0.00", "saldo_pendiente_usd": "30.00",
  "referencia_bancaria": null, "metodo_pago": null,
  "banco_receptor_id": null, "banco_receptor_nombre": null,
  "advertencias": ["ALERTA: el archivo es idéntico al del comprobante #4 ya aprobado"],
  "observaciones": null,
  "motivo_rechazo_id": null,
  "revision": null
}
```
`archivo_tipo`: `"imagen"` | `"pdf"` | null. `revision` cuando ya fue procesado:
`{"fecha_pago": "2026-10-28", "monto_recibido": "1215.00", "moneda": "VES", "tasa_aplicada": "40.5000", "monto_usd_aplicado": "30.00", "revisado_por": "jperez", "fecha_revision": "...", "pago_id": 501}`.
`advertencias` = chequeo previo de hash de archivo repetido, calculado sin modificar nada.

### GET `portal/admin/comprobantes/tasa/?fecha=YYYY-MM-DD`
`200 {"fecha": "2026-10-28", "valor_bs": "40.5000", "fuente": "BCV"}` · `404 {"error": "..."}` si no hay tasa.
Esta ruta debe declararse ANTES de `admin/comprobantes/<int:comprobante_id>/` (no choca por ser int, pero queda claro).

### PATCH `portal/admin/comprobantes/<id>/`
Aprobar (todos obligatorios salvo observaciones):
```json
{"estatus": "aprobado", "referencia": "123456", "banco_receptor_id": 3, "metodo_pago": "pago_movil",
 "fecha_pago": "2026-10-28", "monto_recibido": "1215.00", "moneda": "VES", "observaciones": ""}
```
Rechazar:
```json
{"estatus": "rechazado", "motivo_rechazo_id": 2, "observaciones": "El monto no coincide"}
```
200: `{"mensaje": "...", "advertencias": [], "abono_usd": "30.00", "saldo_pendiente_usd": "0.00", "excedente_usd": "0.00"}`
400: `{"error": "Revise los datos del pago.", "campos": {"monto_recibido": "...", "referencia": "..."}}` · 404 · 409 (ya procesado).
`fecha_pago` no puede ser futura. `monto_recibido` > 0. `metodo_pago` ∈ `Pago.METODOS`.

### Bancos
El frontend usa el endpoint de bancos institucionales que ya existe en el proyecto (buscarlo en src/services o src/api; no se crea uno nuevo).

### Motivos de rechazo — `portal/admin/motivos-rechazo/` (GET lista, POST) y `portal/admin/motivos-rechazo/<id>/` (PATCH, DELETE)
`{"id": 1, "nombre": "Monto no coincide", "texto": "El monto transferido no coincide con la mensualidad.", "activo": true, "orden": 1}`
GET acepta `?activos=1`. DELETE de un motivo ya usado → se desactiva en vez de borrar (on_delete PROTECT/SET_NULL a criterio, responder 200).
Semilla (data migration): Monto no coincide · Referencia no aparece en el banco · Comprobante ilegible · Pago a una cuenta que no es del colegio · Comprobante de otra mensualidad o alumno.

### Plantillas de aviso — `notificaciones/plantillas-aviso/` (GET) y `notificaciones/plantillas-aviso/<id>/` (PATCH)
GET: `{"plantillas": [{"id": 1, "clave": "comprobante_rechazado", "nombre": "Comprobante rechazado", "asunto": "Su comprobante de {{mensualidad}} fue rechazado", "cuerpo": "Hola {{representante.nombre}}, ... Motivo: {{motivo}} ... {{portal.link}}", "activa": true}], "tokens": [{"token": "{{motivo}}", "etiqueta": "Motivo del rechazo"}]}`
PATCH: `asunto`, `cuerpo`, `activa`. Las claves sembradas son `comprobante_rechazado` y `comprobante_aprobado`; no se crean ni se borran desde la UI. Si una plantilla está inactiva o falta, se usa el texto por defecto del código.
Tokens: `{{representante.nombre}}`, `{{alumno.nombre}}`, `{{mensualidad}}`, `{{monto}}`, `{{referencia}}`, `{{motivo}}`, `{{colegio.nombre}}`, `{{portal.link}}`.

## Endpoints del portal (representante autenticado con portal_token)

### GET `portal/avisos/`
`{"no_leidos": 2, "resultados": [{"id": 7, "tipo": "comprobante_rechazado", "titulo": "...", "cuerpo": "...", "url": "/portal", "leido": false, "creado_en": "..."}]}` (últimos 50, más recientes primero; solo los del representante autenticado).

### POST `portal/avisos/<id>/leer/` → 200 `{"ok": true}` · POST `portal/avisos/leer-todos/` → 200 `{"ok": true, "marcados": 3}`

## Reglas para todos los agentes
- Trabajan en el MISMO worktree en paralelo: toquen solo sus archivos asignados. NO hagan `git commit`, `git stash`, `git checkout` ni `git add`; el coordinador commitea.
- Verificación estática (tests, lint, build). NO abran el navegador (la validación visual la hace el usuario).
- Estándar responsive del CLAUDE.md del repo: mobile-first, `dvh`, sin `grid-cols-N` sin breakpoint, `Modal.jsx` y `TablaScroll.jsx` obligatorios, bordes semirredondeados y aspecto moderno.
- Deuda técnica que encuentren: anotarla en una lista en su respuesta final (el coordinador la pasa a NOTAS_TECNICAS.md); no editen NOTAS_TECNICAS.md.

## Fuera de alcance
Canal "Portal" en Cobranza Inteligente (bloque 4), anotado como deuda técnica. No tocar `cobranza/motor.py`.
