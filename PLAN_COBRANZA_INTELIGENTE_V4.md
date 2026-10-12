# Plan — Cobranza Inteligente v4: módulo unificado + Conversaciones

**Objetivo:** que el sistema le diga al cobrador qué hacer cada día y converse con las familias por WhatsApp, en lugar de esperar instrucciones. El cobrador entra, ve "Hoy", ejecuta las acciones sugeridas y puede tomar cualquier conversación (takeover) para hablar en vivo con el representante. "Gestión inteligente" y "Resultados cobranza" dejan de existir como pantallas separadas: todo queda en un solo módulo, **Cobranza Inteligente**.

**Base:** construye sobre la v3 ([PLAN_COBRANZA_INTELIGENTE.md](PLAN_COBRANZA_INTELIGENTE.md)), que ya está implementada en el backend: ciclos, motor de reglas, bandeja con puntaje, convenios, dashboard, toggle por sede y modo sombra. La v4 **no reescribe el motor**: agrega una cara nueva, el canal de entrada de WhatsApp y nuevas acciones sobre lo existente.

---

## 0. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Proveedor de WhatsApp | **Meta Cloud API** (envío + recepción por webhook, botones nativos) |
| Equipo | **Un cobrador** por colegio. No hay asignación de cartera, metas ni reparto. El campo `responsable` existente se usa solo para registrar quién tomó una conversación |
| Unificación | **"Gestión inteligente" y "Resultados cobranza" se fusionan en un solo módulo: Cobranza Inteligente.** Vive en la ruta que ya existe, `/cobranza/inteligente`, con una sola entrada en el menú. Sus funciones (bandeja, pagos en revisión, convenios, resultados, línea base) pasan a las pestañas del nuevo módulo (ver §1.0) |
| Pantallas viejas | **Conviven.** Morosos, Cobranza, CobranzaDashboard, Comprobantes, RevisionComprobantes y HistorialMensajesWhatsApp no se tocan. Todo el módulo sigue detrás del toggle de Cobranza Inteligente |
| IA | **No.** Toda automatización es por reglas y árboles de botones |
| Tiempo real | **Polling cada 10–15 s** con Axios (sin dependencias nuevas). Se pausa cuando la pestaña no está visible |
| Fuera de alcance | Integración con Solvencias y Constancias ("consecuencias por deuda"): requiere revisión legal (LOPNNA) |
| Dependencias nuevas | **Ninguna.** Frontend: React, Tailwind, recharts, date-fns, lucide, toastify ya presentes. Backend: `requests` (ya usado para Meta) |

---

## 1. Qué se construye (alcance funcional)

### 1.0 Unificación: de dónde sale cada cosa

Hoy existen dos pantallas piloto separadas: **Gestión inteligente** (`CobranzaInteligenteGestion.jsx`, con las pestañas Bandeja / Pagos en revisión / Convenios) y **Resultados cobranza** (`CobranzaInteligenteDashboard.jsx`). Ambas se absorben en el módulo único **Cobranza Inteligente**:

| Hoy está en | Pasa a | Cómo |
|---|---|---|
| Gestión → **Bandeja** (casos con puntaje) | **Hoy** | Cada caso es una tarjeta de acción; se reutiliza `ModalAccion` (registrar llamada, nota, pausar, reclamo, cerrar) |
| Gestión → **Pagos en revisión** | **Hoy** (tarjetas) + **Cartera** (filtro "Con pago en revisión") | Mismo endpoint `pagos-revision/` |
| Gestión → **Convenios** | **Cartera** (filtro "Con convenio" y sección en la ficha) | Se reutiliza `ModalConvenio`; las promesas de pago (§1.5) usan el mismo modal en modo "una sola cuota" |
| **Resultados** (efectividad, cartera por etapa, envíos 7 días, recuperado, cola de trabajo) | **Reportes**, y los KPIs principales también en **Hoy** | Mismo endpoint `dashboard/` |
| Resultados → **Línea base** | **Reportes** (sección "Línea base") | Mismo endpoint `linea-base/` |
| Configuración → Cobranza Inteligente (toggle, modo sombra, etapas) | **Se queda en Configuración** y se enlaza desde **Automatizaciones** | Encender/apagar es una decisión de dirección, no del día a día del cobrador |

Al terminar la Fase A se borran `CobranzaInteligenteGestion.jsx`, `CobranzaInteligenteDashboard.jsx` y su test. Sus subcomponentes (`ModalAccion`, `ModalConvenio`, `LineaBase`) se mueven a `components/cobranzaInteligente/` antes de borrar, así no se pierde nada. Los endpoints del backend no cambian.

### 1.1 Módulo Cobranza Inteligente — ruta `/cobranza/inteligente`, 5 pestañas

| Pestaña | Ruta | Contenido |
|---|---|---|
| **Hoy** (entrada) | `/cobranza/inteligente` | Frase de resumen + tarjetas de acción priorizadas (incluye la antigua Bandeja) + KPIs + gráficos + actividad automática |
| **Cartera** | `/cobranza/inteligente/cartera` | Tabla por representante con etapa, saldo, último contacto, próxima acción automática, convenios y pagos en revisión; ficha 360° en panel lateral |
| **Conversaciones** | `/cobranza/inteligente/conversaciones/:id?` | Bandeja tipo WhatsApp Web, takeover, respuestas rápidas, notas internas |
| **Automatizaciones** | `/cobranza/inteligente/automatizaciones` | Línea de tiempo de reglas editable, vista previa del mensaje, simulador "qué saldría hoy", enlace a la configuración del toggle |
| **Reportes** | `/cobranza/inteligente/reportes` | Todo lo de la antigua pantalla Resultados + línea base + rendimiento por plantilla |

`/cobranza/inteligente/resultados` redirige a `/cobranza/inteligente/reportes`, para que los enlaces y marcadores viejos sigan funcionando.

Con el toggle apagado, toda la ruta muestra la pantalla existente "Cobranza Inteligente está apagada".

### 1.2 Pestaña "Hoy": qué tarjetas genera el sistema

Cada tarjeta trae **por qué** aparece (el puntaje explicado de `gestion.calcular_bandeja`) y **un botón con la acción sugerida**.

| Tarjeta | Origen | Acción sugerida |
|---|---|---|
| Caso prioritario / crítico sin gestión reciente | `calcular_bandeja` (existe) | Abrir chat · Registrar llamada · Pausar |
| Promesa de pago vencida sin pago | Promesa (§1.5) | Escribir · Volver al ciclo |
| Comprobante recibido por WhatsApp sin asignar | Adjunto entrante (§1.4) | Asignar a mensualidad y aprobar · Rechazar |
| Pago en revisión hace más de N días | `pagos_en_revision` (existe) | Ir a conciliar |
| Conversación esperando respuesta humana | Conversación con `requiere_humano` o sin respuesta > 2 h | Abrir chat |
| Conversación tomada sin actividad | Takeover sin mensajes del cobrador > 24 h | Responder · Devolver al automático |
| Envío fallido 3 veces | `EnvioCobranza` estado fallido (existe) | Ver detalle · Corregir teléfono |
| Representante sin teléfono ni email válido | Cartera | Editar representante |

Encabezado: *"Hoy: 6 casos requieren acción · 3 comprobantes por aprobar · 2 promesas vencen. El sistema enviará 41 recordatorios a las 8:00."* La cifra de envíos sale de una **evaluación en seco** del motor (misma lógica que el modo sombra, sin crear registros).

Al marcar una tarjeta como hecha se registra un `EventoCiclo` y la tarjeta desaparece hasta que la regla vuelva a dispararla.

### 1.3 Conversaciones y takeover

- **Una conversación por número de WhatsApp** (no por alumno). Se vincula al `Representante` por teléfono normalizado; si el número coincide con varios representantes o con ninguno, queda como **"Sin vincular"** y el cobrador la asocia a mano. Nunca se adivina.
- **Estados de la conversación:**
  - `automatico`: el motor y el árbol de botones responden.
  - `humano`: tomada por el cobrador. **El motor omite los envíos a ese representante** (nuevo motivo de omisión `conversacion_humana` en `procesar_envio`) y el árbol de botones no responde.
  - Vuelve a `automatico` con el botón "Devolver al automático" o **sola tras 3 días sin mensajes del cobrador** (tarea diaria).
- **Ventana de 24 h de Meta:** si el último mensaje del representante tiene menos de 24 h, el cobrador escribe libre. Si no, el compositor cambia a "Enviar plantilla" y solo permite plantillas aprobadas. La UI muestra el tiempo restante de la ventana.
- **Respuestas rápidas** con variables (`{nombre}`, `{saldo_usd}`, `{saldo_bs}`, `{alumnos}`, `{link_portal}`, `{datos_bancarios}`), administradas en Automatizaciones.
- **Notas internas** en el hilo (el representante no las ve) y **adjuntar estado de cuenta en PDF** (jsPDF ya existe; se reutiliza `enviar_whatsapp_documento`).
- **Estados de entrega** (enviado / entregado / leído / fallido) actualizados por el webhook de Meta.
- **Palabras de baja** ("BAJA", "STOP", "NO MAS"): crean `BajaCobranza` de WhatsApp (modelo existente) y se confirma al representante.

### 1.4 Comprobantes recibidos por WhatsApp

1. El representante envía una imagen o un PDF.
2. El webhook descarga el archivo de Meta y lo guarda como adjunto del mensaje.
3. El representante queda con **"comprobante pendiente"**: el motor omite sus envíos (nuevo motivo `comprobante_pendiente`).
4. Aparece una tarjeta en Hoy. El cobrador elige la mensualidad (o varias) y lo convierte en un `ComprobantePago` del portal existente → entra al flujo actual de revisión y aprobación. No se duplica el flujo. También puede descartarlo con motivo.
5. Respuesta automática: *"Recibimos tu comprobante, lo revisaremos en las próximas horas."*

### 1.5 Promesas de pago

- **Se reutiliza `ConvenioPago`** con un nuevo campo `tipo` (`convenio` | `promesa`). Una promesa es un convenio de una sola cuota: pausa los ciclos incluidos hasta la fecha y, si no se cumple, `revisar_convenios` (existe) los devuelve al ciclo.
- Se crean de dos formas: el cobrador desde la ficha o el chat, o el representante con el botón "Necesito un acuerdo" (§1.6).
- Al incumplirse, aparece la tarjeta "Promesa vencida" en Hoy.

### 1.6 Botones interactivos (árbol simple, sin IA)

Los recordatorios del motor pasan a ser **plantillas de Meta con botones de respuesta rápida**:

| Botón | Respuesta del sistema |
|---|---|
| **Ya pagué** | "Envíanos la foto o el PDF del comprobante por aquí." → espera adjunto (§1.4) |
| **Necesito un acuerdo** | Mensaje interactivo de lista con 3 fechas (+3, +7, +14 días) → crea la promesa → confirma la fecha |
| **Hablar con alguien** | Marca la conversación `requiere_humano` → tarjeta en Hoy → "Te escribiremos en horario de atención" |

Cualquier texto libre que no sea botón ni palabra de baja marca la conversación como `requiere_humano`. No se intenta "entender" el texto.

### 1.7 Otras mejoras incluidas

- **Link al portal en cada mensaje**, que abre la sección de pago del representante.
- **Perfil de pagador** (fase D): según los últimos 6 meses, *Puntual*, *Paga tarde pero paga*, *Moroso nuevo*, *Crónico*. Visible en la ficha y la cartera. Opcional por regla: recordatorio extra en −3 solo para "Paga tarde".
- **Proyección de caja de la semana** (fase D): promesas vigentes + cuotas de convenios + probabilidad histórica por perfil.
- **Comparación de plantillas A/B** (fase D): dos variantes por regla, asignación alternada por representante, medición de recuperado a 7 días.

### 1.8 Control de todos los recordatorios de cobro (email y WhatsApp)

**Regla:** con el toggle **encendido** en una sede, **todo mensaje de cobro a familias de esa sede, por email o por WhatsApp, automático o manual, pasa por Cobranza Inteligente.** Así se respetan las mismas protecciones: baja voluntaria, horario, tope semanal, pago o comprobante en revisión, conversación tomada, y un solo mensaje por día. Con el toggle **apagado**, todo funciona exactamente como hoy.

Inventario de lo que existe hoy y qué pasa con cada cosa:

| Flujo actual | Dónde | Con el toggle encendido |
|---|---|---|
| Avisos automáticos de mora por email y WhatsApp (día 0, recordatorio 1 y 2, alerta al director) | señal `al_crear_mensualidad` + tarea `revisar_y_programar_notificaciones_pendientes` (`notificaciones/tasks.py`), días en `ConfiguracionNotificaciones` | **Ya se desactivan** por sede desde la v3 (excluyentes con el motor). Se mantiene y se cubre con prueba. Las reglas del motor (−5 … +30) los reemplazan |
| Cobro manual por WhatsApp desde Morosos, Modo A (wa.me) | `PrevisualizarCobroWhatsAppView`, `RegistrarEnvioManualCobroWhatsAppView` | **Sigue disponible** (hay personas que usan Morosos), pero **coordinado**: el envío se registra en la conversación del representante y como `EventoCiclo` del ciclo, cuenta para el tope semanal, y si el representante tiene baja, conversación tomada o comprobante pendiente, se avisa antes de abrir wa.me |
| Cobro manual por WhatsApp desde Morosos, Modo B (API) | `EnviarCobroWhatsAppView` | **Se enruta por Cobranza Inteligente**: aplica las mismas verificaciones del motor antes de enviar (bloquea con baja, comprobante pendiente o pago en revisión; avisa si ya recibió un mensaje automático hoy y pide confirmar). El saliente queda en la conversación |
| Plantillas de cobro (`PlantillaWhatsApp`, tipo cobro) | Pantalla PlantillasWhatsApp | Siguen sirviendo al cobro manual de Morosos. Los textos de los recordatorios automáticos se administran en **Automatizaciones** |
| Días de recordatorio en Configuración → Notificaciones | `ConfiguracionNotificaciones.dias_recordatorio_1/2`, `dias_alerta_director` | La pantalla muestra un aviso: *"Con Cobranza Inteligente encendida, estos días no se usan. Los recordatorios se configuran en Cobranza Inteligente → Automatizaciones"*, con enlace. Los campos quedan en solo lectura |

**No cambia** (no son cobros): bienvenida al portal, confirmación de pago exitoso / recibo, comprobante de inscripción, circulares, aviso de mensaje nuevo, notificaciones push del portal y los recordatorios a **proveedores** de Cuentas por Pagar (`ConfiguracionRecordatorios`).

**Visibilidad:** el historial de cada representante en la Cartera y en Conversaciones muestra **todos** sus mensajes de cobro, sin importar el origen (motor, botón de Morosos, cobrador), con una etiqueta que indica de dónde salió.

**Al apagar el toggle:** los envíos pendientes del motor se cancelan (ya existe), los avisos automáticos viejos vuelven a correr y el cobro manual de Morosos vuelve a su comportamiento actual, sin las verificaciones extra.

---

## 2. Backend (Django, `octopus-api`)

### 2.1 Modelos nuevos y cambios

**En `notificaciones` (dueño del canal WhatsApp):**

```text
ConversacionWhatsApp
  telefono (E.164, único)            representante (FK null)  sede (FK null)
  estado: automatico | humano        requiere_humano (bool)
  tomada_por (FK user null)          tomada_en
  ultimo_entrante_en                 ultimo_saliente_en
  no_leidos (int)                    actualizado_en (índice; base del polling)
  esperando: '' | comprobante | fecha_acuerdo   (paso del árbol de botones)

MensajeWhatsApp
  conversacion (FK)   direccion: entrante | saliente | nota
  tipo: texto | imagen | documento | boton | lista | plantilla | sistema
  cuerpo              payload (JSON: botón/lista/variables de plantilla)
  wa_message_id (único, null) — idempotencia del webhook
  estado_entrega: enviado | entregado | leido | fallido
  adjunto (FileField, null)   estado_adjunto: '' | pendiente | convertido | descartado
  enviado_por (FK user null; null = sistema)
  envio_cobranza (FK null) — enlaza el recordatorio automático
  creado_en

RespuestaRapida
  sede (FK null)  titulo  cuerpo (con variables)  activa  orden
```

Cambios a modelos existentes (migraciones reversibles):

| Modelo | Cambio |
|---|---|
| `ConfiguracionNotificaciones` | `meta_app_secret` (EncryptedTextField), `meta_webhook_verify_token`, `meta_waba_id` |
| `ConvenioPago` | `tipo` (`convenio` \| `promesa`, default `convenio`), `origen` (`cobrador` \| `whatsapp`) |
| `ReglaCobranza` | `plantilla_meta` (nombre de la plantilla aprobada, opcional); `plantilla_meta_b` en fase D |
| `EnvioCobranza` | sin cambios de esquema; nuevos motivos de omisión `conversacion_humana` y `comprobante_pendiente` |

`NotificacionLog` **no** se modifica (deuda ya anotada en la v3).

### 2.2 Webhook de Meta

`notificaciones/webhook_meta.py` + vistas en `notificaciones/urls.py`:

- `GET  /api/notificaciones/whatsapp/webhook/`: verificación (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- `POST /api/notificaciones/whatsapp/webhook/`: sin JWT, **con verificación de firma `X-Hub-Signature-256`** (HMAC-SHA256 con `meta_app_secret`; si no coincide, 403). Responde 200 de inmediato y delega a una **tarea Celery** (`procesar_webhook_meta`).
- Procesamiento **idempotente** (`wa_message_id` único: Meta reintenta) para:
  - `messages`: texto, imagen, documento, `button` (respuesta de plantilla), `interactive` (lista).
  - `statuses`: actualiza `estado_entrega`; un `failed` alimenta el reintento del motor.
- Descarga de media: `GET /{media_id}` → URL temporal → descarga con token → `adjunto`. Mismos límites de tamaño y tipos que el portal.
- Requiere URL pública HTTPS (nginx ya existe). Guía de configuración en `octopus-api/WHATSAPP_META_WEBHOOK.md`.

### 2.3 Servicios

| Archivo | Responsabilidad |
|---|---|
| `notificaciones/conversaciones.py` | Vincular por teléfono, registrar entrantes/salientes, ventana de 24 h, takeover/devolver, envío libre o por plantilla, lista interactiva |
| `cobranza/flujo_botones.py` | Árbol de §1.6: responde según botón o paso `esperando`; crea promesa; marca `requiere_humano` |
| `cobranza/hoy.py` | Arma las tarjetas de Hoy reutilizando `calcular_bandeja`, `pagos_en_revision`, convenios, conversaciones y envíos fallidos; evaluación en seco del motor |
| `cobranza/motor.py` (cambio acotado) | Dos verificaciones nuevas antes de enviar (conversación `humano`, comprobante pendiente). Envío por plantilla de Meta con botones si la regla tiene `plantilla_meta` (resuelve el `TODO_META_TEMPLATES` existente). Registro del saliente en la conversación |
| `cobranza/control_envios.py` | **Puerta única** de §1.8: `puede_enviar_cobro(representante, canal, origen, ahora)` devuelve si se puede enviar y por qué no (baja, horario, tope semanal, pago o comprobante en revisión, conversación tomada, ya recibió mensaje hoy). La usan el motor (se extraen ahí sus verificaciones actuales, sin cambiar su comportamiento) y las vistas de cobro manual de `notificaciones/views.py` cuando el toggle de la sede está encendido. `registrar_cobro(...)` deja el `EventoCiclo` y el mensaje en la conversación |
| `cobranza/perfil_pagador.py` (fase D) | Clasificación por historial |

Tareas Celery nuevas: `procesar_webhook_meta`, `devolver_conversaciones_inactivas` (diaria).

### 2.4 Endpoints nuevos (bajo `cobranza/inteligente/`, mismos permisos y respuesta "módulo apagado" que los existentes)

| Método | Ruta | Uso |
|---|---|---|
| GET | `hoy/` | Resumen + tarjetas + KPIs + actividad |
| POST | `hoy/tarjetas/<clave>/hecha/` | Marcar tarjeta como resuelta |
| GET | `contadores/` | Badge del sidebar: no leídos + tarjetas urgentes (polling liviano) |
| GET | `conversaciones/?desde=<iso>&filtro=` | Lista; con `desde` devuelve solo lo cambiado |
| GET | `conversaciones/<id>/mensajes/?desde=<iso>` | Hilo incremental |
| POST | `conversaciones/<id>/mensajes/` | Texto libre o adjunto (valida ventana de 24 h) |
| POST | `conversaciones/<id>/plantilla/` | Enviar plantilla aprobada |
| POST | `conversaciones/<id>/nota/` | Nota interna |
| POST | `conversaciones/<id>/tomar/` · `devolver/` | Takeover |
| POST | `conversaciones/<id>/vincular/` | Asociar a representante |
| POST | `conversaciones/<id>/leida/` | Resetear no leídos |
| POST | `adjuntos/<mensaje_id>/convertir-comprobante/` · `descartar/` | Comprobante entrante |
| GET/POST/PATCH | `respuestas-rapidas/` | CRUD |
| GET | `motor/simulacion/?fecha=` | Qué saldría ese día (evaluación en seco) |
| POST | `promesas/` | Crear promesa (`crear_convenio` con `tipo='promesa'`) |

Se reutilizan sin cambios: `cartera/`, `representantes/<id>/expediente/`, `ciclos/<id>/acciones/`, `pagos-revision/`, `convenios/`, `dashboard/`, `linea-base/`, `envios/`, `configuracion/`.

---

## 3. Frontend (`octopus-frontend`)

### 3.1 Árbol de archivos nuevos

```text
src/
  api/
    cobranza.service.js                # se amplía el bloque BASE_INT existente con los endpoints de §2.4
  hooks/
    usePolling.js                      # 10–15 s, pausa con document.hidden, backoff ante error
    useCobranzaHoy.js
    useConversaciones.js
    useHiloConversacion.js
  pages/
    CobranzaInteligente.jsx            # layout con pestañas + <Outlet/>; chequea toggle
                                       # REEMPLAZA a CobranzaInteligenteGestion.jsx y CobranzaInteligenteDashboard.jsx
  components/cobranzaInteligente/
    CobranzaInteligenteTabs.jsx
    shared/
      ModalAccionCiclo.jsx             # movido desde CobranzaInteligenteGestion (ModalAccion)
      ModalConvenio.jsx                # movido desde CobranzaInteligenteGestion; modo "promesa" = 1 cuota
      ModuloApagado.jsx                # pantalla "Cobranza Inteligente está apagada" (hoy duplicada en 2 páginas)
    hoy/
      HoyResumen.jsx                   # frase "Hoy tienes que…"
      TarjetaAccion.jsx
      ListaTarjetas.jsx
      KpisCobranza.jsx                 # grid-cols-2 sm:grid-cols-2 lg:grid-cols-4
      GraficoEstadoPagos.jsx           # dona (recharts)
      GraficoMoraAntiguedad.jsx        # barras (recharts)
      ActividadAutomatica.jsx
      HoySkeleton.jsx
    cartera/
      TablaCartera.jsx                 # TablaScroll; en móvil, lista de tarjetas
      FiltrosCartera.jsx
      FichaRepresentante.jsx           # panel lateral
      CarteraSkeleton.jsx
    conversaciones/
      BandejaConversaciones.jsx        # 3 columnas en xl, 2 en lg, navegación por pantallas en móvil
      ItemConversacion.jsx
      HiloMensajes.jsx
      BurbujaMensaje.jsx
      Compositor.jsx                   # texto / adjunto / respuestas rápidas / plantilla según ventana 24 h
      BannerTakeover.jsx               # "Automático" vs "Atendido por…"
      ModalEnviarPlantilla.jsx
      ModalConvertirComprobante.jsx
      ModalVincularRepresentante.jsx
      ConversacionesSkeleton.jsx
    automatizaciones/
      LineaTiempoReglas.jsx
      EditorRegla.jsx
      VistaPreviaMensaje.jsx
      SimuladorEnvios.jsx
      RespuestasRapidas.jsx
    reportes/
      ReportesCobranza.jsx             # contenido de la antigua pantalla Resultados (dashboard/)
      LineaBase.jsx                    # movido desde CobranzaInteligenteDashboard
```

**Se borran al cerrar la Fase A:** `pages/CobranzaInteligenteGestion.jsx`, `pages/CobranzaInteligenteGestion.test.jsx` (sus casos se migran a `CobranzaInteligente.test.jsx`) y `pages/CobranzaInteligenteDashboard.jsx`.

**Se reutilizan:** `ui/Modal.jsx`, `ui/TablaScroll.jsx`, `morosos/EtapaCobranza.jsx`, `ProtectedRoute`, `DatePickerES`, `cobranza.service.js` y el generador de estado de cuenta en PDF existente.

### 3.2 Rutas (react-router-dom v7, lazy)

Se reemplazan las dos rutas actuales (`cobranza/inteligente` y `cobranza/inteligente/resultados`) por una ruta anidada:

```jsx
const CobranzaInteligente = lazy(() => import('./pages/CobranzaInteligente'));
// roles: los mismos que hoy tiene Gestión inteligente
// (DIRECTOR, ADMINISTRADOR, COBRANZA, CAJERO, SISTEMAS)
<Route path="cobranza/inteligente" element={<ProtectedRoute …><CobranzaInteligente/></ProtectedRoute>}>
  <Route index element={<Hoy/>} />
  <Route path="cartera" element={<Cartera/>} />
  <Route path="conversaciones/:conversacionId?" element={<Conversaciones/>} />
  <Route path="automatizaciones" element={<Automatizaciones/>} />  {/* DIRECTOR, ADMINISTRADOR, SISTEMAS */}
  <Route path="reportes" element={<Reportes/>} />                  {/* DIRECTOR, ADMINISTRADOR, SISTEMAS (como hoy Resultados) */}
  <Route path="resultados" element={<Navigate to="../reportes" replace />} />
</Route>
```

Las pestañas a las que el rol no tiene acceso no se muestran (por ejemplo, el cajero ve Hoy, Cartera y Conversaciones).

**Sidebar:** las entradas "Gestión inteligente" y "Resultados cobranza" se reemplazan por **una sola: "Cobranza Inteligente"** (`/cobranza/inteligente`, ícono `Sparkles` como hoy), con un badge de no leídos + urgentes desde `contadores/`. La entrada de Configuración → Cobranza Inteligente se mantiene.

**`MainLayout.jsx`:** los títulos "Gestión de cobranza" y "Resultados de cobranza" se reemplazan por "Cobranza Inteligente" para todas las subrutas.

### 3.3 Polling

- `usePolling(fn, { intervalo: 12000 })`: no corre con la pestaña oculta y refresca al volver; ante error, backoff 12 → 30 → 60 s y un solo toast, no uno por intento.
- Lista e hilo piden solo lo cambiado (`?desde=`).
- Al enviar, el mensaje se inserta de forma optimista y se reconcilia con el siguiente poll.

### 3.4 Diseño y responsive

- Cumple el **ESTÁNDAR DE DISEÑO RESPONSIVE** (360 / 768 / 1366 / 1920, `dvh`, sin scroll horizontal del body, `Modal` y `TablaScroll` obligatorios).
- Móvil: Hoy es una lista de tarjetas; Cartera usa tarjetas en vez de tabla; Conversaciones navega lista → hilo → ficha con botón atrás; el compositor queda fijo abajo con `dvh`.
- Bordes semi redondeados y look moderno, colores de etapa consistentes con `EtapaCobranza`.
- Skeletons en todas las cargas; errores de Axios con react-toastify; fechas con date-fns `es` ("hace 5 min", "12 oct").

---

## 4. Fases y entregables

Cada fase se libera sola, detrás del toggle, con commits pequeños en español.

### Fase A — Unificación + Hoy + Cartera + Reportes (sin dependencias externas)

1. Mover `ModalAccion`, `ModalConvenio`, `LineaBase` y la pantalla "módulo apagado" a `components/cobranzaInteligente/`, sin cambiar su comportamiento (commit aparte, fácil de revisar).
2. Layout `CobranzaInteligente` con pestañas + ruta anidada + redirección de `/resultados` + **una sola entrada en el sidebar** + títulos en `MainLayout`.
3. Pestaña **Reportes** con el contenido de Resultados y la línea base → se borra `CobranzaInteligenteDashboard.jsx`.
4. Backend `cobranza/hoy.py` + `hoy/`, `contadores/`, `motor/simulacion/` + pruebas.
5. `usePolling` + pestaña **Hoy** (tarjetas que incluyen la antigua Bandeja y los pagos en revisión, KPIs, gráficos, actividad, skeleton).
6. Pestaña **Cartera** + ficha 360° (sobre `cartera/` y `expediente/`), con convenios y pagos en revisión.
7. Promesas de pago (`ConvenioPago.tipo`) usando `ModalConvenio` en modo una cuota + tarjeta de promesa vencida.
8. Migrar los tests de `CobranzaInteligenteGestion.test.jsx` → se borra `CobranzaInteligenteGestion.jsx`.
9. **Control de recordatorios (§1.8):** `cobranza/control_envios.py` (extraer las verificaciones del motor sin cambiar su comportamiento), conectar el cobro manual de Morosos (Modo A y Modo B) cuando el toggle está encendido, aviso y solo lectura en Configuración → Notificaciones, historial unificado con etiqueta de origen.

**En paralelo:** enviar a Meta las plantillas de §6 (la aprobación tarda y bloquea la Fase C).

**Criterio de salida:** todo lo que se podía hacer en Gestión inteligente y en Resultados se puede hacer en el módulo unificado (checklist: registrar llamada, nota, pausar, reanudar, reclamo, cerrar, crear y cancelar convenio, marcar cuota pagada, ver pagos en revisión, ver resultados, cargar línea base); el menú tiene una sola entrada; `/cobranza/inteligente/resultados` redirige; Morosos sigue idéntico.

### Fase B — Conversaciones y takeover

1. Modelos `ConversacionWhatsApp`, `MensajeWhatsApp`, `RespuestaRapida` + campos Meta en configuración.
2. Webhook (verificación, firma, tarea Celery idempotente, statuses, media) + pruebas con payloads de ejemplo de Meta.
3. Registro de salientes del motor y de `cobro_whatsapp.py` en la conversación.
4. Takeover en el motor (`conversacion_humana`) + devolución automática.
5. Endpoints + pantalla Conversaciones (lista, hilo, compositor, ventana de 24 h, notas, respuestas rápidas, plantillas, vincular).
6. Palabras de baja.

**Dependencia externa:** app de Meta con el número del colegio, webhook HTTPS configurado, `app_secret` cargado.

**Criterio de salida:** un mensaje entrante aparece en ≤ 15 s; con la conversación tomada, el motor no envía nada a ese representante (prueba automatizada); un webhook repetido no duplica mensajes.

### Fase C — Botones, comprobantes por WhatsApp, link al portal

1. `ReglaCobranza.plantilla_meta` + envío por plantilla en el motor.
2. `flujo_botones.py` (Ya pagué / Acuerdo / Hablar) + lista interactiva de fechas.
3. Comprobantes entrantes: adjunto → pausa → tarjeta → convertir/descartar.
4. Link al portal en las variables del mensaje.

**Criterio de salida:** con un comprobante pendiente no sale ningún recordatorio a ese representante; "Necesito un acuerdo" crea la promesa y pausa el ciclo.

### Fase D — Inteligencia por reglas

1. Perfil de pagador + recordatorio extra opcional para "Paga tarde".
2. Proyección de caja de la semana en Hoy y Reportes.
3. A/B de plantillas + reporte por variante.
4. Pestaña Automatizaciones completa (línea de tiempo editable, vista previa, simulador por fecha).

---

## 5. Pruebas (automatizadas, fijando `hoy`)

- Webhook: firma inválida → 403; mismo `wa_message_id` dos veces → un solo mensaje; status `read` actualiza la entrega.
- Takeover: con conversación `humano`, `procesar_envio` omite con `conversacion_humana`; tras 3 días sin actividad vuelve a `automatico`.
- Ventana de 24 h: texto libre fuera de ventana → 400; plantilla → permitido.
- Un comprobante entrante pausa los envíos del representante hasta convertirlo o descartarlo.
- Botones: cada rama del árbol; texto libre → `requiere_humano`; "BAJA" → `BajaCobranza`.
- Promesa: cumplida cierra; incumplida devuelve los ciclos a su etapa y genera tarjeta.
- Hoy: con el toggle apagado → "módulo apagado"; las tarjetas coinciden con `calcular_bandeja`.
- Control de recordatorios: con el toggle encendido, la tarea vieja de avisos y la señal no envían nada a esa sede; el cobro manual Modo B se bloquea con baja / comprobante pendiente / pago en revisión y pide confirmación si ya hubo mensaje hoy; Modo A registra el evento y cuenta para el tope semanal. Con el toggle apagado, el cobro manual se comporta exactamente como hoy (mismo resultado en los tests existentes de `tests_cobro_whatsapp.py`). Bienvenida, recibos, circulares y push no se ven afectados.
- Frontend (Vitest, como los `.test.jsx` existentes): Hoy renderiza tarjetas y skeleton; el compositor cambia a modo plantilla fuera de ventana; `usePolling` no consulta con la pestaña oculta.
- Responsive: verificación estática del agente (clases, `dvh`, `TablaScroll`/`Modal`); la validación visual en los 4 tamaños la hace el usuario.

---

## 6. Plantillas de Meta a tramitar (borrador, categoría *Utility*)

| Nombre | Uso | Botones |
|---|---|---|
| `cobro_preventivo` | −5, −1 | Ya pagué · Necesito un acuerdo · Hablar con alguien |
| `cobro_vence_hoy` | 0 | ídem |
| `cobro_seguimiento` | +3, +7 | ídem |
| `cobro_prioritario` | +15 | ídem |
| `reabrir_conversacion` | Cobrador fuera de la ventana de 24 h | — |

Variables: nombre del representante, alumnos, saldo USD, referencia en Bs (tasa al enviar), fecha de vencimiento, link al portal. El aviso al director (+30) sigue por el canal actual.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Meta demora o rechaza plantillas | Tramitarlas al inicio de la Fase A; mientras tanto, texto libre dentro de la ventana y email |
| El cobrador toma una conversación y la olvida → la familia deja de recibir recordatorios | Tarjeta "Conversación tomada sin actividad" a las 24 h + devolución automática a los 3 días |
| Webhook expuesto públicamente | Firma HMAC obligatoria, sin datos sensibles en la respuesta, rate limit en nginx |
| Número compartido por dos representantes | Conversación "Sin vincular" hasta que el cobrador decida |
| Polling cargando el servidor | Consultas incrementales con `?desde=` e índice en `actualizado_en`; pausa con la pestaña oculta |
| Cobrar a quien ya mandó comprobante | Pausa automática por adjunto entrante, además de las verificaciones de la v3 |
| Confusión por pantallas duplicadas durante la prueba | Gestión inteligente y Resultados desaparecen (fusionadas); Morosos y demás no cambian; el módulo está detrás del toggle |
| Al fusionar se pierde alguna acción que hoy existe en Gestión o Resultados | Checklist de equivalencia en el criterio de salida de la Fase A y tests migrados antes de borrar los archivos viejos |
| Usuarios con el marcador `/cobranza/inteligente/resultados` | Redirección a `/reportes` |
| Una familia recibe el recordatorio automático y, el mismo día, un cobro manual desde Morosos | Puerta única `control_envios`: el cobro manual avisa y pide confirmar; queda todo en el mismo historial |
| Con el toggle encendido, alguien cambia los días en Configuración → Notificaciones creyendo que surte efecto | Aviso visible + campos en solo lectura + enlace a Automatizaciones |

---

## 8. Fuera de alcance

IA (resúmenes, sugerencias, clasificación) · WebSockets · asignación de cartera, metas y SLA multi-cobrador · integración con Solvencias y Constancias (requiere revisión legal, LOPNNA) · reemplazo o retiro de Morosos y demás pantallas viejas · pagos en línea nuevos · conceptos distintos de mensualidades (igual que la v3).

## 9. Deuda técnica a anotar en `NOTAS_TECNICAS.md`

- Tras unificar Gestión inteligente y Resultados, la cobranza sigue repartida en 6 pantallas fuera del módulo (Cobranza, CobranzaDashboard, Morosos, Comprobantes, RevisionComprobantes, HistorialMensajesWhatsApp). Evaluar integrarlas a Cobranza Inteligente al terminar el piloto.
- `NotificacionLog` y `MensajeWhatsApp` registran envíos en paralelo; unificar al retirar el flujo antiguo.
- `ConfiguracionNotificaciones` es un único registro (`pk=1`): un número de WhatsApp por instalación, no por sede.
