# CONTEXTO DEL PROYECTO
Software SaaS de gestión escolar para colegios privados en Latinoamérica.
El sistema actual maneja: inscripciones, facturación, cobros y reportes básicos en PDF.

## Stack Frontend (existente — no cambiar sin consultarme):
- React 19 + Vite 8
- react-router-dom v7 (routing)
- Tailwind CSS v4 (estilos)
- Axios (HTTP client)
- lucide-react (íconos)
- react-toastify (notificaciones)
- jsPDF + jspdf-autotable (generación de PDFs)
- xlsx (exportación Excel)
- date-fns + react-datepicker (manejo de fechas)
- jwt-decode (auth local)

## Preguntas que debes hacerme antes de empezar:
1. ¿Cuál es el stack del backend/API? (necesito saberlo para las rutas, modelos y jobs)
2. ¿Dónde vive el estado global hoy? (Context API, Zustand, Redux, etc.)
3. ¿Existe ya un sistema de rutas protegidas por rol? ¿Cómo están estructurados los roles actuales?
4. ¿Hay variables de entorno (.env) ya configuradas para la API base URL y JWT secret?

---

# FASE 1 — PORTAL DE REPRESENTANTES (prioridad máxima)

## Plan antes de codificar
Antes de escribir una sola línea de código, preséntame:
- Árbol de carpetas y archivos nuevos a crear
- Nuevas rutas en react-router-dom v7 (con lazy loading si aplica)
- Componentes nuevos y cuáles existentes reutilizar
- Decisiones de arquitectura (manejo de estado, autenticación separada)
- Cambios necesarios en el backend/BD
Espera mi aprobación antes de continuar.

## Requerimientos funcionales:

### 1. Autenticación separada para representantes
- Login propio en ruta `/portal` con cédula/email + contraseña
- JWT distinto al del panel administrativo — decodificar con jwt-decode
- Rutas protegidas: si no está autenticado, redirigir a `/portal/login`
- Guardar token en localStorage con clave `portal_token` (separado del admin)

### 2. Dashboard del representante
Página principal del portal mostrando:
- Saldo actual y deuda pendiente (resaltado en rojo si hay mora)
- Lista de facturas vencidas con días de atraso
- Próximos vencimientos (usar date-fns para calcular y formatear fechas)
- Historial de pagos paginado con fecha, monto y estado
- Si tiene varios hijos en el colegio: tabs o selector para cambiar entre estudiantes

### 3. Pago online
- Alternativa manual: botón "Pagar por transferencia" que abre un modal con datos bancarios + uploader de comprobante (imagen o PDF)
- Mostrar estado del comprobante: Pendiente / Aprobado / Rechazado
- Usar react-toastify para confirmar acciones al usuario

### 4. Notificaciones automáticas de cobranza (backend)
Implementar en el backend el siguiente flujo automático por cada factura impaga:
- Día 0: email al generar la factura
- Día 5: recordatorio por email al representante
- Día 10: segundo aviso por email
- Día 15: alerta al director del colegio
Dejar el código preparado con comentarios para conectar WhatsApp 
(Twilio o Meta Business API) en el futuro — sin implementarlo aún.

### 5. Diseño y UX
- Mobile-first obligatorio — el representante abre esto desde su celular
- Usar Tailwind CSS v4 con los colores del colegio (leer desde perfil del colegio en la API)
- Íconos de lucide-react consistentes con el resto del sistema
- Skeleton loaders mientras cargan los datos (no spinners genéricos)
- Manejo de errores con react-toastify en todas las llamadas Axios

## Entregables de la Fase 1:
- [ ] Módulo `/portal` completo con rutas protegidas en react-router-dom v7
- [ ] Componentes de autenticación separada para representantes
- [ ] Dashboard con estado financiero del estudiante
- [ ] Flujo de pago Stripe end-to-end (frontend + instrucciones backend)
- [ ] Uploader de comprobante con preview
- [ ] Jobs de recordatorio automático en el backend
- [ ] Archivo `NOTAS_TECNICAS.md` con deuda técnica detectada (solo anotar, no implementar)

---

# FASE 2 — MÓDULO ACADÉMICO (después de aprobar Fase 1)
- Registro de notas por materia y lapso
- Boletines en PDF automáticos usando jsPDF + jspdf-autotable (ya en el stack)
- Control de asistencia diaria con react-datepicker para filtros
- Horarios de clases por grado

---

# FASE 3 — MULTI-SEDE (después de aprobar Fase 2)
- Un directivo gestiona varios planteles desde una cuenta
- Dashboard consolidado con métricas por sede
- Permisos granulares por sede

---

# REGLAS DE TRABAJO
- No cambies librerías del stack sin consultarme — si necesitas algo nuevo, propónlo primero
- Commitea en pasos pequeños y lógicos con mensajes descriptivos en español
- Si encuentras deuda técnica o código mejorable, anótalo en NOTAS_TECNICAS.md sin tocarlo
- Usa los patrones que ya existen en el proyecto (revisa primero cómo están hechos otros módulos)
- Toda fecha visible al usuario debe formatearse con date-fns en español (es locale)
- Toda interfaz nueva o modificada debe cumplir el ESTÁNDAR DE DISEÑO RESPONSIVE (ver al final de este archivo) — es criterio de aceptación, no una recomendación

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

# ESTÁNDAR DE DISEÑO RESPONSIVE (obligatorio en todo el proyecto)

Toda interfaz nueva o modificada — panel administrativo, portal de
representantes, cantina y sitio institucional — debe ser responsive dinámica:
se adapta al dispositivo real, no a medidas fijas elegidas a mano.
Esto no es una preferencia estética: una pantalla con contenido inalcanzable
es un defecto funcional y bloquea la entrega.

## Principios

1. **Mobile-first.** Se escribe primero el layout de 360px y se amplía con
   breakpoints hacia arriba. Nunca al revés.
2. **Fluido antes que fijo.** Los contenedores se dimensionan con `w-full`,
   `max-w-*`, `flex` y `grid`. Un ancho o alto absoluto solo se admite si es
   un mínimo de legibilidad dentro de un contenedor que ya scrollea.
3. **El desborde se contiene, no se propaga.** El scroll horizontal vive
   siempre DENTRO del elemento ancho (tabla, grilla, carrusel). El `<body>`
   nunca scrollea en horizontal, en ningún tamaño.
4. **Nada queda fuera de alcance.** Todo control accionable — sobre todo los
   botones de confirmar, guardar y eliminar — debe ser visible y clicable en
   los cuatro tamaños de referencia.

## Parámetros

- **Breakpoints:** solo los de Tailwind v4 ya en uso — base < `sm`(640) <
  `md`(768) < `lg`(1024) < `xl`(1280). Prohibido inventar breakpoints nuevos
  o escribir media queries sueltas en CSS.
- **Tamaños de referencia obligatorios:** 360×640 (celular), 768×1024
  (tablet), 1366×768 (laptop), 1920×1080 (escritorio). Los cuatro deben
  funcionar antes de dar una pantalla por terminada.
- **Alturas de viewport:** usar `dvh`, nunca `vh`. En móvil la barra del
  navegador rompe el cálculo de `vh` y corta el contenido.
- **Grillas:** ninguna `grid-cols-N` sin breakpoint. Reglas por defecto:
  - `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
  - `grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  - `grid-cols-4` → `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4`
  Única excepción: grupos de botones cortos (teclado numérico, selector de
  montos), donde 2–3 columnas sí caben en 360px.
- **Barras de filtros y acciones:** `flex flex-col gap-2 sm:flex-row
  sm:items-center sm:gap-3`; el botón de acción principal, `w-full sm:w-auto`.
- **Tipografía y espaciado:** escalar con breakpoints (`text-sm sm:text-base`,
  `p-3 sm:p-5`). No fijar tamaños en px salvo casos justificados.

## Componentes obligatorios

No se reimplementan estos patrones a mano. Todo lo nuevo los reutiliza:

- `src/components/ui/Modal.jsx` — único contenedor de modal permitido.
  Slots `header` / `body` (scrollable) / `footer`, prop `size`, cierre con
  Escape y con click en el overlay. Ningún componente debe volver a escribir
  `fixed inset-0` por su cuenta.
- `src/components/ui/TablaScroll.jsx` — envuelve toda tabla que pueda superar
  el ancho del viewport. La tabla conserva su `min-w-*`: se scrollea, no se
  comprime.

## Excepciones declaradas

- **`sitio/EditorVisual/`**: editor drag & drop, no adaptable a celular. Por
  debajo de `lg` muestra el aviso "Editor disponible solo en pantallas de
  escritorio" en lugar del editor.
- **`cantina/` (POS)**: su uso real es pantalla de caja o tablet. Objetivo
  mínimo 768×1024 sin cortes; en 360px basta con que nada quede inalcanzable.
- **`portal/` (representantes)**: mobile-first estricto, es la zona de mayor
  prioridad — el representante entra desde su celular.

Cualquier excepción nueva debe consultarse antes, no decidirse sobre la marcha.

## Criterio de aceptación

Una pantalla no está terminada hasta haberla abierto en el navegador en los
cuatro tamaños de referencia y confirmado que: nada queda cortado ni
inalcanzable, los botones de todo modal son visibles y clicables, el `<body>`
no scrollea en horizontal, no hay texto solapado y la consola no arroja
errores nuevos. "Debería funcionar" no es una verificación.
