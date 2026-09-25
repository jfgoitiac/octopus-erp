# PROMPT — Módulo "Cobros por WhatsApp"

Trabaja en C:\Octopus. Vamos a construir el módulo **Cobros por WhatsApp**.
El correo ya no se usa para cobrar (no funcionó en la práctica); WhatsApp pasa a
ser el canal principal de cobranza hacia los representantes.

**Antes de escribir código, preséntame el plan** (archivos nuevos/modificados,
modelos y migraciones, endpoints, componentes, decisiones) y espera mi
aprobación. Sigue CLAUDE.md: patrones existentes, commits pequeños en español,
estándar responsive, fechas con date-fns `es`, deuda técnica solo anotada en
NOTAS_TECNICAS.md.

---

## 1. Lo que YA existe y debes reutilizar (no reimplementar)

Verifica cada punto en el código antes de usarlo:

- `octopus-api/notificaciones/services.py` → `enviar_whatsapp(telefono, mensaje, tipo, representante_cedula, alumno_nombre)`
  ya envía por **Twilio** o **Meta Cloud API** según la configuración y registra
  todo en `NotificacionLog`. También `_normalizar_telefono()` (formato +58).
- `octopus-api/notificaciones/models.py` → `ConfiguracionNotificaciones` (singleton)
  ya guarda `whatsapp_activo`, `whatsapp_proveedor` y credenciales cifradas
  (`EncryptedTextField`). `NotificacionLog` ya tiene canal `whatsapp`.
- `octopus-frontend/src/pages/Configuracion.jsx` ya tiene la tarjeta de estado de
  WhatsApp y el "mensaje de prueba".
- `octopus-frontend/src/components/constancias/PlaceholderRichEditor.jsx` +
  `pages/constancias/plantillaTokens.js` → editor con **píldoras** de variables
  (el usuario nunca ve `{{ }}`). Es el modelo a seguir para el editor de mensajes.
- `octopus-api/cobranza/views.py::ListaMorososView` + `cobranza/mora.py` → fuente
  de verdad de quién está en mora, cuánto debe, meses y días de atraso.
- `octopus-frontend/src/pages/Morosos.jsx` + `components/morosos/MorososRow.jsx`
  → la tabla donde va el nuevo botón.
- `src/components/ui/Modal.jsx` y `TablaScroll.jsx` (obligatorios).

Nota: `twilio` **no está en requirements.txt** (solo `requests`, que basta para
Meta). Si propones agregarlo, consúltame primero.

---

## 2. Decisión técnica que debes resolver en el plan (IMPORTANTE)

WhatsApp Business API **no permite enviar texto libre** a alguien que no le
escribió al colegio en las últimas 24 h: los mensajes que inicia la empresa
deben usar una **plantilla aprobada por Meta** (aplica también a Twilio).
El `enviar_whatsapp` actual manda `type: text`, que fuera de esa ventana falla.

Plantéame las opciones con pros y contras, y tu recomendación:

- **Modo A — Enlace directo (wa.me), sin API:** el botón abre WhatsApp
  (web o app) con el mensaje ya escrito para ese representante; la secretaria
  solo pulsa "Enviar". Gratis, funciona hoy, sin aprobación de Meta. Se registra
  en el log como envío manual.
- **Modo B — API automática:** envío desde el servidor con plantilla aprobada
  (`type: template` con parámetros). Permite envío masivo, pero el texto
  editable se limita a los huecos que permita la plantilla aprobada.
- **Modo híbrido:** A por defecto; B se activa solo si `ConfiguracionNotificaciones`
  tiene WhatsApp activo y una plantilla aprobada registrada.

El módulo debe funcionar desde el primer día aunque no haya cuenta de Meta/Twilio.

---

## 3. Requerimientos funcionales

### 3.1 Editor de plantillas de mensaje (ruta nueva en Configuración o Cobranza)
- Pensado para personas de **40 a 60 años**: letra grande (mínimo `text-base`),
  botones grandes con texto (no solo íconos), cero jerga técnica, pocos pasos.
- El usuario escribe el mensaje normal y pulsa botones como
  **"+ Nombre del representante"**, **"+ Nombre del alumno"**, **"+ Monto que debe"**,
  **"+ Meses que debe"**, **"+ Días de atraso"**, **"+ Nombre del colegio"**,
  **"+ Enlace al portal"**, **"+ Datos bancarios"** → se inserta una píldora.
  Reutiliza el mecanismo de píldoras de constancias, adaptado a **texto plano**
  (WhatsApp no usa HTML): guardar como texto con tokens `{{representante.nombre}}`.
- Botones **Negrita** y **Cursiva** que aplican el formato de WhatsApp (`*texto*`, `_texto_`).
- **Vista previa en vivo** con aspecto de burbuja de WhatsApp, rellenada con
  datos de un moroso real de ejemplo.
- Varias plantillas con nombre ("Recordatorio amable", "Segundo aviso", "Aviso final"),
  una marcada como **predeterminada**. Plantilla inicial ya creada, por ejemplo:
  "Hola *{nombre representante}*, le saludamos de {colegio}. Le recordamos que
  tiene un saldo pendiente de *{monto}* correspondiente a {meses} de {alumno}…"
- Si hay varios hijos con deuda, el mensaje debe **agrupar** (un solo mensaje por
  representante con el total y la lista de alumnos), no uno por hijo.
- Validaciones claras: no guardar vacío, avisar si pasa de ~1000 caracteres.

### 3.2 Botón de WhatsApp en Morosos
- En cada fila de `MorososRow` agregar un botón con **ícono de WhatsApp verde**
  junto a "Cobrar". lucide-react no trae el logo oficial: propón un SVG propio
  en `components/ui/` (consúltame si prefieres `MessageCircle`).
- Al pulsarlo se abre un `Modal` con: plantilla seleccionada (desplegable),
  mensaje final ya rellenado y **editable solo para ese envío**, teléfono de
  destino y un botón grande **"Enviar por WhatsApp"**.
- Si el representante no tiene teléfono válido: botón deshabilitado con el
  motivo visible ("Sin teléfono registrado").
- Mostrar en la fila **"Último aviso: hace 3 días"** (desde `NotificacionLog`).
- **Anti-spam:** si ya se le envió un cobro en las últimas 24 h, pedir
  confirmación antes de reenviar.
- Opcional (proponlo, no lo asumas): selección múltiple + "Enviar a seleccionados"
  (solo tiene sentido en Modo B).
- Confirmaciones y errores con react-toastify.

### 3.3 Backend
- Modelo nuevo `PlantillaWhatsApp` (nombre, cuerpo, tipo, predeterminada, activa,
  y para Modo B: `nombre_plantilla_meta`, idioma, orden de parámetros).
- Servicio único `renderizar_mensaje_cobro(representante, plantilla)` que arma el
  contexto con datos de `mora.py` (agrupado por representante). El frontend
  **no** calcula montos.
- Endpoints (en `notificaciones/` o `cobranza/`, justifica cuál): CRUD de plantillas,
  lista de variables disponibles, `POST previsualizar`, `POST enviar-cobro`
  (Modo B) y `POST registrar-envio-manual` (Modo A). Permisos con `ROLE_GROUPS.MORA`
  y filtrado por sede (`filtrar_por_sede`), igual que `ListaMorososView`.
- Nuevo tipo en `NotificacionLog.TIPOS`: `cobro_whatsapp` (+ migración).
- En Modo B, extender `enviar_whatsapp` para soportar `type: template` sin romper
  los usos actuales (mora día 5/10/15, bienvenida, pago exitoso).
- Tests en el estilo de `cobranza/tests.py`: render de variables, agrupación por
  hijos, teléfono inválido, anti-duplicado, permisos por rol y sede. Mockear HTTP.

### 3.4 Historial
- Vista simple "Mensajes enviados" (fecha, representante, plantilla, estado)
  paginada, reutilizando `LogNotificacionesView` si sirve.

---

## 4. Criterios de aceptación
- Una secretaria sin capacitación crea una plantilla y envía un cobro en
  **menos de 1 minuto** y con **máximo 3 clics** desde Morosos.
- Funciona sin credenciales de API (Modo A).
- Los montos del mensaje coinciden exactamente con los de la tabla de Morosos.
- Responsive en 360×640, 768×1024, 1366×768 y 1920×1080; el botón "Enviar" del
  modal siempre visible; el `<body>` sin scroll horizontal.
- `python manage.py test` y `npm run build` / lint pasan; `graphify update .` al final.
