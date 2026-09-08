# Módulo de Constancias — Contexto congelado (Fases 0 y 1)

> Este archivo es autocontenido: para abrir la Fase 2 en una sesión nueva, basta con
> pasarle este archivo + `PROMPT_MODULO_CONSTANCIAS.md` (para las reglas de
> paralelismo O.1-O.5 y el bloque de instrucciones de cada agente 2A-2D). No hace
> falta releer el historial de chat de las Fases 0 y 1.

Estado: **Fase 3 (Integración) completa — 2026-09-08. Compuerta 3→4 superada:
flujo elegir plantilla → previsualizar → emitir → PDF verificado de punta a
punta con datos reales (correlativo EST-2026-2027-0001, PDF 635 KB válido).
Suite completa: 44/44 tests en verde. Pendiente de aprobación del usuario para
abrir Fase 4 (Controles: permisos, firma delegada, correlativo, auditoría).**

---

## DECISIONES DE FASE 0 (aprobadas)

- **D1 — Editor**: TipTap, ya instalado en `octopus-frontend/package.json`
  (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`,
  `@tiptap/extension-image`), en uso hoy en
  `src/components/sitio/EditorArticulo.jsx`. Se agregan extensiones hermanas:
  `@tiptap/extension-underline`, `extension-text-align`, `extension-font-family`,
  `extension-text-style`. Placeholders = TipTap inline atom node (píldora no
  editable). No es una librería nueva a efectos de §O.5.
- **D2 — PDF**: se renderiza en el **backend**, con **ReportLab** (ya en
  `octopus-api/requirements.txt`) o `fpdf2` si conviene. El membrete sale de
  `secretaria.ConfiguracionSistema` (fila única global, `ImageField`
  `logo_colegio`/`encabezado_personalizado`/`pie_pagina_personalizado`), leído
  directo por filesystem, no por HTTP. La firma del director nunca sale del
  servidor salvo previsualización controlada — patrón a copiar:
  `octopus-api/pagos_comunes/media_views.py` (`ComprobanteProtegidoView`,
  `X-Accel-Redirect` en producción).
- **D3 — Correlativo**: replica el patrón de
  `cobranza.SolvenciaRepresentante.numero` (`cobranza/models.py:657`) y su
  generador `_generar_numero` en `cobranza/solvencia.py`: prefijo por tipo de
  constancia + año escolar + secuencial de 4 dígitos, dentro de
  `transaction.atomic()` + `select_for_update()`. **Global**, no por sede.
  **Sin código de verificación impreso en esta fase** (no hay vista pública de
  verificación en el sistema hoy — se puede agregar después).
- **D4 — Datos**: confirmado por el usuario que **no existe multisede activa**
  en este colegio. Por eso `ConfiguracionFirmante` es un modelo global de una
  sola fila (no por sede), igual que `ConfiguracionSistema`. Sueldo: fuente
  canónica **`nomina.Empleado.sueldo_base_ves`** (no `rrhh.Empleado.sueldo_base`).

## ✅ Vacíos de Fase 1 — resueltos por el usuario el 2026-09-08

1. **`{{alumno.cedula}}`**: **APROBADA migración.** El agente 2A agrega a
   `secretaria.Alumno` el campo `cedula` (`CharField(max_length=15, blank=True)`)
   + `cedula_nacionalidad` (`CharField(max_length=1, choices=[('V','V'),('E','E')],
   default='V', blank=True)`), mismo patrón que `ConfiguracionFirmante.cedula`/
   `.nacionalidad`. Campo opcional (`blank=True`): no todos los alumnos tienen
   cédula propia. El placeholder `{{alumno.cedula}}` devuelve vacío + advertencia
   si no está cargada (igual que el resto del motor, nunca revienta).
2. **`{{trabajador.tipo_contrato}}`**: **APROBADA migración.** El agente 2A
   agrega a `nomina.Empleado` el campo `tipo_contrato`
   (`CharField(max_length=20, choices=[('fijo','Fijo'),('temporal','Temporal'),
   ('honorarios','Honorarios')], blank=True)`). Igual que arriba, vacío +
   advertencia si no está cargado.

---

## CONTRATO DE FASE 1 (congelado)

### 1. Modelo de datos

App Django nueva: `constancias`, modelos en `octopus-api/constancias/models.py`.

#### `constancias.ConfiguracionFirmante` (global, fila única)

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | `CharField(max_length=200)` | |
| `cedula` | `CharField(max_length=15)` | Sin prefijo `V-`/`E-` |
| `nacionalidad` | `CharField(max_length=1, choices=[('V','V'),('E','E')], default='V')` | |
| `cargo` | `CharField(max_length=150)` | |
| `firma_imagen` | `ImageField(upload_to='constancias/firmas/', null=True, blank=True)` | Almacenamiento privado, nunca URL pública |
| `sello_imagen` | `ImageField(upload_to='constancias/sellos/', null=True, blank=True)` | Ídem |
| `estampado_global_activo` | `BooleanField(default=True)` | |
| `actualizado_en` | `DateTimeField(auto_now=True)` | |
| `actualizado_por` | `ForeignKey(AUTH_USER_MODEL, on_delete=SET_NULL, null=True, blank=True)` | |

#### `constancias.PlantillaConstancia`

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | `CharField(choices=[('estudio','Estudio'),('conducta','Buena Conducta'),('retiro','Retiro'),('trabajo','Trabajo')])` | Catálogo cerrado |
| `nombre` | `CharField(max_length=150)` | |
| `destinatario` | `CharField(choices=[('alumno','Alumno'),('trabajador','Trabajador')])` | Determina grupos de placeholders ofrecidos |
| `cuerpo_html` | `TextField()` | Párrafo "Quien suscribe…" NO va aquí, se compone en render |
| `anexo_html` | `TextField(blank=True, default='')` | |
| `anexo_habilitado` | `BooleanField(default=False)` | |
| `permite_estampado` | `BooleanField(default=False)` | Interruptor por plantilla |
| `activa` | `BooleanField(default=True)` | Soft toggle |
| `creada_en` / `actualizada_en` | `DateTimeField` | auto_now_add / auto_now |
| `creada_por` | `ForeignKey(AUTH_USER_MODEL, SET_NULL, null=True, blank=True)` | |

#### `constancias.ConstanciaEmitida` (histórico, snapshot inmutable)

| Campo | Tipo | Notas |
|---|---|---|
| `numero` | `CharField(max_length=30, unique=True, editable=False)` | Correlativo D3 |
| `tipo` | `CharField(choices=...)` | Copiado al emitir, no FK |
| `plantilla` | `FK(PlantillaConstancia, PROTECT)` | |
| `alumno` | `FK('secretaria.Alumno', PROTECT, null=True, blank=True)` | Si destinatario=alumno |
| `trabajador` | `FK('nomina.Empleado', PROTECT, null=True, blank=True)` | Si destinatario=trabajador |
| `html_renderizado` | `TextField()` | Snapshot ya resuelto, incluye anexo |
| `datos_capturados` | `JSONField(default=dict, blank=True)` | Horario, grado/nivel/año de promoción |
| `salio_firmada` | `BooleanField(default=False)` | |
| `emitida_por` | `FK(AUTH_USER_MODEL, PROTECT)` | |
| `fecha_emision` | `DateTimeField(auto_now_add=True)` | |
| `periodo_escolar` | `CharField(max_length=20)` | Snapshot del período activo |

Constraints: `numero` unique; índice en `(tipo, periodo_escolar)`; validar en
`clean()`/serializer que exactamente uno de `alumno`/`trabajador` esté poblado
según `plantilla.destinatario`.

### 2. Endpoints (prefijo real: `/api/constancias/...`, `ROOT_URLCONF` = `config/urls.py`)

- `GET/POST/PUT/DELETE /constancias/plantillas/` — DELETE captura `ProtectedError` → 409 sugiriendo desactivar.
- `GET /constancias/placeholders/?destinatario=alumno|trabajador|representante`
- `POST /constancias/previsualizar/` — no persiste, devuelve `html_renderizado` + `advertencias[]` (fallbacks de género, tokens desconocidos), nunca falla por dato faltante.
- `POST /constancias/emitir/` — crea `ConstanciaEmitida`, responde con `numero`, `pdf_url`, etc.
- `GET /constancias/emitidas/` — paginado, filtros `tipo/alumno_id/trabajador_id/numero/desde/hasta`. Necesita también detalle `GET /constancias/emitidas/<id>/` (no listado explícito en el prompt original pero necesario, anotado para 3A).
- `GET/PUT /constancias/firmante/` — singleton sin `<id>` en la URL, igual que `secretaria/configuracion/`. Imágenes nunca como URL pública directa.

Ejemplos de request/response por endpoint:

**`GET /constancias/plantillas/`** → 200
```json
{
  "count": 4,
  "results": [
    {
      "id": 1, "tipo": "estudio", "nombre": "Constancia de Estudio 2025-2026",
      "destinatario": "alumno",
      "cuerpo_html": "<p>hace constar que {{alumno.nombres}} {{alumno.apellidos}}, {{sexo:inscrito|inscrita}} en el {{alumno.grado}} de {{alumno.nivel}}, sección {{alumno.seccion}}, para el año escolar {{alumno.anio_escolar}}.</p>",
      "anexo_html": "<p>Fecha de nacimiento: {{alumno.fecha_nacimiento}}. Madre: {{familia.madre_nombres}} {{familia.madre_apellidos}}, C.I. {{familia.madre_cedula}}. Padre: {{familia.padre_nombres}} {{familia.padre_apellidos}}, C.I. {{familia.padre_cedula}}.</p>",
      "anexo_habilitado": true, "permite_estampado": true, "activa": true,
      "creada_en": "2026-08-01T10:00:00Z", "actualizada_en": "2026-08-01T10:00:00Z",
      "creada_por": { "id": 3, "nombre": "María Pérez" }
    }
  ]
}
```
`POST`/`PUT` devuelven el objeto individual (201/200). `DELETE` → 204, o 409 si tiene histórico:
`{ "detail": "No se puede eliminar: esta plantilla tiene constancias emitidas. Desactívala en vez de borrarla." }`

**`GET /constancias/placeholders/?destinatario=alumno`** → 200
```json
{
  "grupos": [
    { "grupo": "alumno", "etiqueta": "Alumno", "placeholders": [
      { "token": "{{alumno.nombres}}", "etiqueta": "Nombres del alumno", "ejemplo": "María José" },
      { "token": "{{alumno.apellidos}}", "etiqueta": "Apellidos del alumno", "ejemplo": "Rodríguez Pérez" }
    ]},
    { "grupo": "familia", "etiqueta": "Familia", "placeholders": [
      { "token": "{{familia.madre_nombres}}", "etiqueta": "Nombres de la madre", "ejemplo": "Ana" }
    ]},
    { "grupo": "institucion", "etiqueta": "Institución", "placeholders": [
      { "token": "{{institucion.nombre_colegio}}", "etiqueta": "Nombre del colegio", "ejemplo": "Colegio Ejemplo" }
    ]},
    { "grupo": "documento", "etiqueta": "Documento", "placeholders": [
      { "token": "{{documento.numero}}", "etiqueta": "Número de constancia", "ejemplo": "EST-2025-2026-0042" }
    ]}
  ],
  "sexo": {
    "sintaxis": "{{sexo:variante_masculina|variante_femenina}}",
    "pares_sugeridos": [["el","la"],["alumno","alumna"],["ciudadano","ciudadana"],["portador","portadora"],["inscrito","inscrita"],["trabajador","trabajadora"],["nacido","nacida"],["promovido","promovida"],["representado","representada"],["hijo","hija"]]
  }
}
```
(Lista truncada por brevedad; el catálogo completo a implementar es el de la sección 3 de este archivo.)

**`POST /constancias/previsualizar/`** — body:
```json
{ "plantilla_id": 1, "alumno_id": 245, "datos_capturados": { "horario": "Lunes a Viernes, 7:00 a.m. a 12:00 m.", "grado_promocion": "", "nivel_promocion": "", "anio_escolar_promocion": "" } }
```
(para trabajador se usa `"trabajador_id"` en vez de `"alumno_id"`). Respuesta 200:
```json
{
  "html_renderizado": "<div class=\"constancia\">...<p>hace constar que María José Rodríguez Pérez, inscrita en el 3er Grado de Educación Primaria, sección \"A\", para el año escolar 2025-2026.</p>...</div>",
  "advertencias": ["El alumno no tiene sexo/género cargado como esperado; se usó la variante masculina por defecto en {{sexo:inscrito|inscrita}}."]
}
```
`advertencias` siempre es array (vacío si no hubo fallback). 400 si `plantilla_id` no existe, `plantilla.activa=False`, o falta `alumno_id`/`trabajador_id` según destinatario.

**`POST /constancias/emitir/`** — mismo body que previsualizar. Respuesta 201:
```json
{
  "id": 88, "numero": "EST-2025-2026-0042", "tipo": "estudio",
  "fecha_emision": "2026-09-08T14:32:10Z", "salio_firmada": true,
  "html_renderizado": "<div class=\"constancia\">...</div>",
  "pdf_url": "/api/constancias/emitidas/88/pdf/",
  "alumno": { "id": 245, "nombres": "María José", "apellidos": "Rodríguez Pérez" }
}
```
`pdf_url` queda congelado desde ya aunque su implementación exacta la resuelve 3B. Errores: 400 datos incompletos; 403 si es plantilla de trabajador con sueldo/bono y el usuario no tiene rol de nómina:
`{ "detail": "No tienes permiso para emitir constancias con datos de sueldo/bono de alimentación." }`

**`GET /constancias/emitidas/`** — filtros `?tipo=&alumno_id=&trabajador_id=&numero=&desde=&hasta=`. Respuesta 200:
```json
{
  "count": 1,
  "results": [{
    "id": 88, "numero": "EST-2025-2026-0042", "tipo": "estudio",
    "plantilla": { "id": 1, "nombre": "Constancia de Estudio 2025-2026" },
    "alumno": { "id": 245, "nombres": "María José", "apellidos": "Rodríguez Pérez", "cedula_escolar": "EA-2024-0113" },
    "trabajador": null, "salio_firmada": true,
    "emitida_por": { "id": 3, "nombre": "María Pérez" },
    "fecha_emision": "2026-09-08T14:32:10Z", "periodo_escolar": "2025-2026",
    "pdf_url": "/api/constancias/emitidas/88/pdf/"
  }]
}
```
El listado NO expone `html_renderizado` completo (payload pesado); agregar detalle `GET /constancias/emitidas/<id>/` para eso (convención estándar del resto del sistema, no listado explícito en el prompt original pero necesario — anotado para 3A).

**`GET/PUT /constancias/firmante/`** — singleton, sin `<id>` (igual que `secretaria/configuracion/`). `GET` 200:
```json
{
  "nombre": "Carlos Andrés Gómez", "cedula": "12345678", "nacionalidad": "V",
  "cargo": "Director", "firma_imagen_url": null, "sello_imagen_url": null,
  "estampado_global_activo": true, "actualizado_en": "2026-08-01T09:00:00Z"
}
```
`firma_imagen_url`/`sello_imagen_url` nunca son URLs públicas directas a `/media/`; si no son `null`, apuntan a un endpoint protegido tipo `ComprobanteProtegidoView` (ej. `/api/constancias/firmante/firma/`), autenticado y con permiso.
`PUT` body (multipart si incluye imágenes, JSON si no):
```json
{ "nombre": "Carlos Andrés Gómez", "cedula": "12345678", "nacionalidad": "V", "cargo": "Director", "estampado_global_activo": true }
```
Respuesta: mismo shape que `GET`, 200.

### 3. Catálogo canónico de placeholders

`origen` usa exactamente: modelo.campo real, `"capturado al emitir"`, o `"requiere migración"`.

| token | etiqueta | grupo | ejemplo | origen |
|---|---|---|---|---|
| `{{alumno.nombres}}` | Nombres del alumno | Alumno | María José | `secretaria.Alumno.nombre` |
| `{{alumno.apellidos}}` | Apellidos del alumno | Alumno | Rodríguez Pérez | `secretaria.Alumno.apellido` |
| `{{alumno.cedula_escolar}}` | Cédula escolar | Alumno | EA-2024-0113 | `secretaria.Alumno.cedula_escolar` |
| `{{alumno.cedula}}` | Cédula de identidad | Alumno | V-30123456 | `secretaria.Alumno.cedula` + `.cedula_nacionalidad` — campos nuevos (migración 2A), opcionales |
| `{{alumno.fecha_nacimiento}}` | Fecha de nacimiento | Alumno | 12/03/2012 | `secretaria.Alumno.fecha_nacimiento` |
| `{{alumno.edad}}` | Edad | Alumno | 13 años | calculado de `fecha_nacimiento` (no persistido) |
| `{{alumno.grado}}` | Grado cursado | Alumno | 3er Grado | derivado de `secretaria.Inscripcion.grado_seccion` / `secretaria.Alumno.grado_seccion` |
| `{{alumno.nivel}}` | Nivel cursado | Alumno | Educación Primaria | derivado de grado_seccion (mapeo grado→nivel) |
| `{{alumno.seccion}}` | Sección | Alumno | A | derivado de grado_seccion (se parsea) |
| `{{alumno.anio_escolar}}` | Año escolar cursado | Alumno | 2025-2026 | `secretaria.Inscripcion.periodo_escolar` |
| `{{alumno.horario}}` | Horario | Alumno | Lunes a Viernes, 7:00 a.m. a 12:00 m. | "capturado al emitir" |
| `{{alumno.grado_promocion}}` | Grado al que fue promovido | Alumno | 4to Grado | "capturado al emitir" |
| `{{alumno.nivel_promocion}}` | Nivel al que fue promovido | Alumno | Educación Primaria | "capturado al emitir" |
| `{{alumno.anio_escolar_promocion}}` | Año escolar de la promoción | Alumno | 2026-2027 | "capturado al emitir" |
| `{{alumno.estatus}}` | Estatus del alumno | Alumno | Activo | `secretaria.Alumno.activo` (mapeado a Activo/Retirado) |
| `{{familia.madre_nombres}}` | Nombres de la madre | Familia | Ana | **requiere migración** |
| `{{familia.madre_apellidos}}` | Apellidos de la madre | Familia | García | **requiere migración** |
| `{{familia.madre_cedula}}` | Cédula de la madre | Familia | V-15234567 | **requiere migración** |
| `{{familia.padre_nombres}}` | Nombres del padre | Familia | Luis | **requiere migración** |
| `{{familia.padre_apellidos}}` | Apellidos del padre | Familia | Rodríguez | **requiere migración** |
| `{{familia.padre_cedula}}` | Cédula del padre | Familia | V-14567890 | **requiere migración** |
| `{{familia.representante_nombres}}` | Nombres del representante | Familia | Ana | `secretaria.Representante.nombre` |
| `{{familia.representante_apellidos}}` | Apellidos del representante | Familia | García | `secretaria.Representante.apellido` |
| `{{familia.representante_cedula}}` | Cédula del representante | Familia | V-15234567 | `secretaria.Representante.cedula` (formateada con nacionalidad) |
| `{{familia.parentesco}}` | Parentesco con el alumno | Familia | Madre | `secretaria.Alumno.parentesco` |
| `{{trabajador.nombres}}` | Nombres del trabajador | Trabajador | Pedro | `nomina.Empleado.nombre` |
| `{{trabajador.apellidos}}` | Apellidos del trabajador | Trabajador | Suárez | `nomina.Empleado.apellido` |
| `{{trabajador.cedula}}` | Cédula del trabajador | Trabajador | V-9876543 | `nomina.Empleado.cedula` |
| `{{trabajador.cargo}}` | Cargo | Trabajador | Docente | `nomina.Empleado.tipo_personal` (choices genérico; si se necesita texto más específico, requiere migración) |
| `{{trabajador.fecha_ingreso}}` | Fecha de ingreso | Trabajador | 01/09/2015 | `nomina.Empleado.fecha_ingreso` |
| `{{trabajador.antiguedad}}` | Antigüedad | Trabajador | 10 años, 4 meses | calculado (no persistido) |
| `{{trabajador.tipo_contrato}}` | Tipo de contrato | Trabajador | Fijo | `nomina.Empleado.tipo_contrato` — campo nuevo (migración 2A), opcional, choices fijo/temporal/honorarios |
| `{{trabajador.sueldo}}` | Sueldo | Trabajador | Bs. 1.850,00 | `nomina.Empleado.sueldo_base_ves` — dato sensible, solo roles de nómina, formatear con utilidad de moneda existente |
| `{{trabajador.bono}}` | Bono de alimentación | Trabajador | Bs. 320,00 | `nomina.RegistroNomina.bono_usd` — mismo control de sensibilidad |
| `{{institucion.nombre_colegio}}` | Nombre del colegio | Institución | Colegio Ejemplo | `secretaria.ConfiguracionSistema.nombre_colegio` |
| `{{institucion.afiliacion}}` | Afiliación | Institución | AVEC | `secretaria.ConfiguracionSistema.afiliacion_nombre` |
| `{{institucion.firmante_nombre}}` | Nombre del firmante | Institución | Carlos Andrés Gómez | `constancias.ConfiguracionFirmante.nombre` |
| `{{institucion.firmante_cedula}}` | Cédula del firmante | Institución | V-12345678 | `ConfiguracionFirmante.cedula` + `.nacionalidad` |
| `{{institucion.firmante_cargo}}` | Cargo del firmante | Institución | Director | `ConfiguracionFirmante.cargo` |
| `{{institucion.direccion}}` | Dirección | Institución | Av. Principal, Sector X | `secretaria.ConfiguracionSistema.direccion_colegio` |
| `{{institucion.ciudad}}` | Ciudad | Institución | Barquisimeto | `secretaria.ConfiguracionSistema.municipio` (no hay "ciudad" separado) |
| `{{institucion.estado}}` | Estado | Institución | Lara | `secretaria.ConfiguracionSistema.estado_colegio` |
| `{{institucion.sede}}` | Sede | Institución | *(no aplica)* | no hay multisede activa, token reservado, siempre vacío |
| `{{institucion.rif}}` | RIF | Institución | J-12345678-9 | `secretaria.ConfiguracionSistema.rif` |
| `{{documento.numero}}` | Número de constancia | Documento | EST-2025-2026-0042 | `constancias.ConstanciaEmitida.numero` (en previsualización pura muestra "(se asigna al emitir)") |
| `{{documento.fecha_numero}}` | Fecha de emisión en números | Documento | 08/09/2026 | `ConstanciaEmitida.fecha_emision` |
| `{{documento.fecha_letras}}` | Fecha de emisión en letras | Documento | ocho de septiembre de dos mil veintiséis | derivado de `fecha_emision` (utilidad nueva del motor, sin dependencia externa) |

**Mapeo notación vieja `❴❴campo❵❵` → token nuevo:**

| Vieja | Nueva |
|---|---|
| `❴❴apellidos❵❵` | `{{alumno.apellidos}}` / `{{trabajador.apellidos}}` según destinatario |
| `❴❴nombres❵❵` | `{{alumno.nombres}}` / `{{trabajador.nombres}}` |
| `❴❴CI❵❵` | `{{alumno.cedula}}` / `{{trabajador.cedula}}` / `{{familia.representante_cedula}}` según contexto |
| `❴❴CIE❵❵` | `{{alumno.cedula_escolar}}` |
| `❴❴edad❵❵` | `{{alumno.edad}}` |
| `❴❴grado❵❵` / `❴❴gradoa❵❵` | `{{alumno.grado}}` |
| `❴❴nivel❵❵` / `❴❴nivela❵❵` | `{{alumno.nivel}}` |
| `❴❴añoescolara❵❵` | `{{alumno.anio_escolar}}` |
| `❴❴gradop❵❵` | `{{alumno.grado_promocion}}` |
| `❴❴nivelp❵❵` | `{{alumno.nivel_promocion}}` |
| `❴❴horario❵❵` | `{{alumno.horario}}` |
| `❴❴fecha❵❵` | `{{documento.fecha_numero}}` |
| `❴❴fechanac❵❵` | `{{alumno.fecha_nacimiento}}` |
| `❴❴cargo❵❵` | `{{trabajador.cargo}}` o `{{institucion.firmante_cargo}}` según contexto (resuelto por destinatario de la plantilla, no adivinado) |
| `❴❴fechaingreso❵❵` | `{{trabajador.fecha_ingreso}}` |
| `❴❴sueldo❵❵` | `{{trabajador.sueldo}}` |
| `❴❴bono❵❵` | `{{trabajador.bono}}` |
| `❴❴apellidosmadre❵❵` | `{{familia.madre_apellidos}}` |
| `❴❴nombresmadre❵❵` | `{{familia.madre_nombres}}` |
| `❴❴cimadre❵❵` | `{{familia.madre_cedula}}` |
| `❴❴apellidospadre❵❵` | `{{familia.padre_apellidos}}` |
| `❴❴nombrespadre❵❵` | `{{familia.padre_nombres}}` |
| `❴❴cipadre❵❵` | `{{familia.padre_cedula}}` |

### 4. Sintaxis de plantilla (cerrada)

1. `{{grupo.campo}}` — sustitución simple. `grupo` ∈ `{alumno, familia, trabajador, institucion, documento}`. Token no reconocido → cadena vacía + advertencia, nunca falla.
2. `{{sexo:variante_a|variante_b}}` — masculino primero. Pares que ofrece el selector del editor: `el/la, alumno/alumna, ciudadano/ciudadana, portador/portadora, inscrito/inscrita, trabajador/trabajadora, nacido/nacida, promovido/promovida, representado/representada, hijo/hija`. El motor acepta cualquier par tecleado en ese formato (no valida diccionario), pero el editor solo ofrece estos diez.
3. Resolución de sexo: lee `secretaria.Alumno.genero` para alumnos; fallback fijo (primera variante) para trabajador (nómina no tiene campo de sexo salvo que se agregue en migración) y para cualquier caso sin dato cargado. Nunca lanza excepción.
4. Cédulas siempre devueltas ya formateadas con nacionalidad (`V-`/`E-`); default `V-` donde el modelo no distinga nacionalidad (`Alumno`, `Empleado`, `Representante` no tienen ese campo hoy).
5. **Prohibido**: condicionales, loops, motores de plantilla genéricos (Jinja2/Django Template Engine) sobre `cuerpo_html`/`anexo_html`. Solo el sustituidor de tokens propio de 2B. HTML de TipTap se sanitiza con whitelist de tags (`p, strong, em, u, ul, ol, li, span[style limitado], br, h1-h3`) antes de guardar y antes de renderizar.

### 5. Archivos compartidos (solo el orquestador los toca, en la compuerta 2→3)

| Archivo | Qué se agrega | Patrón a replicar |
|---|---|---|
| `octopus-api/config/urls.py` | `path('api/constancias/', include('constancias.urls')),` | Idéntico a `path('api/cobranza/', include('cobranza.urls')),` ya presente. **Este es el `ROOT_URLCONF` real** (`config/settings.py:109`). El `octopus-api/urls.py` de la raíz del repo es un archivo huérfano que NO se ejecuta y usa rutas sin prefijo `api/` — ignorarlo por completo, no tocarlo. |
| `octopus-frontend/src/App.jsx` | Rutas `constancias/*` envueltas en `<ProtectedRoute allowedRoles={...}>` | Bloque de rutas de Cobranza (líneas ~231-261) |
| `octopus-frontend/src/components/Sidebar.jsx` | Entrada nueva en `navSections`, shape `{ name, path, icon, roles }` | Entradas de la sección Finanzas/Principal (líneas 21-46) |
| `octopus-frontend/src/constants/roles.js` | Grupo de roles nuevo si hace falta distinguir "editar plantilla" de "solo emitir" | Grupos existentes `SECRETARIA_ADMIN`, `ADMIN_CENTRAL` (líneas 81-131) |

---

## Notas para el futuro (NO implementar ahora)

- Código de verificación impreso / vista pública de verificación: no existe hoy, se puede agregar después usando `ConstanciaEmitida.numero` como base.

---

## Próximo paso

**Compuerta 1→2: superada el 2026-09-08.** Usuario aprobó el contrato y ambos
vacíos (migración en los dos casos). Se lanzan los 4 agentes paralelos de la
Fase 2 (2A datos/migraciones, 2B motor de render, 2C estructura frontend, 2D
editor TipTap + placeholders), según el ANEXO — Mapa de propiedad de archivos
de `PROMPT_MODULO_CONSTANCIAS.md`.
