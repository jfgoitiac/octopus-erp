# NOTAS TÉCNICAS — Deuda técnica detectada

> Regla: solo documentar, no implementar hasta que sea aprobado.

---

## MultiSedeDashboard / Módulo Multi-Sede

- [DEUDA] `SedeContext.cargarSedes()` hace `GET multisede/sedes/` y `useMultiSedeDashboard`
  hace `GET multisede/dashboard/`, ambos populan `sedes` en el mismo estado global.
  Si el backend cambia la forma del objeto sede entre ambos endpoints, el estado
  compartido puede quedar inconsistente. Evaluar si `getDashboardConsolidado` puede
  reemplazar completamente a `getSedes` en el contexto, o definir un tipo canónico
  de sede compartido.

- [DEUDA] Los umbrales de alerta de morosos (`UMBRAL_PELIGRO = 15`, `UMBRAL_ADVERTENCIA = 8`)
  están hardcodeados en `SedeCard.jsx`. Deberían venir del perfil del colegio en la API
  para que cada institución configure sus propios límites.

- [DEUDA] `fmt` en `utils/format.js` usa `toLocaleString('es-VE')`, que depende de la
  configuración regional del navegador del cliente. En navegadores sin soporte completo
  de ICU, el formato puede diferir. Migrar a `Intl.NumberFormat` con locale fijo
  garantizaría consistencia cross-browser.

- [DEUDA] `SedeContext` silencia todos los errores no-401 de `cargarSedes` (catch vacío).
  Un error de red genuino queda tragado sin feedback al usuario. Distinguir 403
  (sin permisos multi-sede, comportamiento esperado) de errores de red reales.

- [DEUDA] El botón "Ver detalle" de `SedeCard` usa hover con clases Tailwind de CSS
  variables (`hover:bg-[var(--pb)]`). Si Tailwind no purga correctamente estas clases
  dinámicas en producción, el hover desaparecerá. Verificar que las clases con
  `var(--…)` aparezcan en el bundle de producción al hacer el build.

- [DEUDA] `PagosTable.jsx` usa `metodo_pago` como sustituto del campo `estado` porque
  el backend aún no expone ese campo. Cuando el backend añada `estado`
  (pagado/pendiente/rechazado), separar en dos columnas y actualizar la badge de color.
  (Ver comentario en línea 11 de `PagosTable.jsx`.)

- [DEUDA] `MorososList.jsx` no muestra `deuda_usd` cuando el campo es `null`. El backend
  debería exponer siempre `deuda_usd` por moroso. Cuando esté disponible, agregar
  columna con `fmt(m.deuda_usd, 2)`.

---

## Morosos

- [DEUDA] `fetchDeudas` en `useMorosos.js` hace una petición `GET cobranza/buscar/{cedula}/` por
  cada alumno en mora (patrón N+1). Con 80+ morosos genera 80 requests simultáneos al backend.
  El backend debe exponer un endpoint batch, ej: `GET cobranza/deudas-batch/?cedulas=CE001,CE002`
  que devuelva `{ CE001: 150.00, CE002: 320.50 }`. Hasta entonces, considerar `p-limit` para
  controlar la concurrencia máxima (ej. 5 requests en vuelo a la vez).

- [DEUDA] `Morosos.jsx` pasa `cedulaEscolar` como `location.state` al navegar a `/cobranza`.
  La página `Cobranza.jsx` aún no lee `useLocation().state?.cedulaEscolar` para precargar
  la búsqueda. Implementar el consumo del estado en `Cobranza.jsx` para que el flujo
  "Ver moroso → Cobrar" sea directo sin tener que buscar al alumno manualmente.

- [DEUDA] `InitialsAvatar` usa el color `#dc2626` (rojo mora) hardcodeado en `MorososRow`.
  Cuando esté disponible el perfil del colegio en la API, leer el color primario desde ahí
  y usarlo como prop de `InitialsAvatar` en todos los contextos de mora.

- [DEUDA] La lista de morosos no tiene paginación del lado del servidor. Con colegios de
  500+ alumnos, el `GET secretaria/alumnos/?estatus=mora` puede ser muy pesado. Implementar
  paginación con cursor o page-number en el backend y adaptar `useMorosos` para cargar páginas.

- [DEUDA] No hay indicador visual de fallo parcial cuando algunos requests de deuda fallan
  (el alumno muestra `—` igual que si no tuviera deuda registrada). Considerar un ícono de
  advertencia `⚠` en la celda de deuda con tooltip "No se pudo obtener la deuda".

---

## Horarios

- [DEUDA] `HORAS_INICIO`/`HORAS_FIN` asumen bloques de hora exacta (HH:00). Si el backend
  almacena clases con horarios libres (ej. `07:30`), el select de ModalClase mostrará
  la celda sin valor preseleccionado y la grilla no encontrará la clase en `getClaseEnCelda`.
  Requiere que backend y frontend acuerden un contrato estricto de formato.

- [DEUDA] `window.print()` en Horarios.jsx imprime toda la página sin CSS de impresión
  dedicado. Agregar un bloque `@media print` que oculte header, sidebar y botones,
  y amplíe la grilla a ancho completo para impresión en hoja apaisada (A4/Letter).

- [DEUDA] No hay validación de solapamiento de horarios en el frontend: el usuario puede
  guardar dos clases en el mismo grado, día y hora (el backend es quien rechaza el conflicto).
  Agregar verificación client-side en `guardar()` del hook antes de llamar a la API para
  dar feedback inmediato sin round-trip.

- [DEUDA] `reemplazar_existente` en ModalGenerador borra todas las clases del grado sin
  un segundo nivel de confirmación. Si el usuario marca la opción por error y presiona
  Generar, pierde todo el horario sin posibilidad de deshacer. Considerar modal de
  confirmación adicional cuando `reemplazar_existente === true`.

---

## Inscripciones

- [DEUDA] El campo `genero` en el formulario de nuevo alumno solo ofrece "masculino/femenino".
  Algunos países de LATAM exigen más opciones por normativa. Cuando el cliente lo solicite,
  agregar "otro / prefiero no decir" y actualizar el modelo del backend en consecuencia.

- [DEUDA] `cedula_escolar` en el formulario de nuevo alumno es opcional (no se valida).
  Aclarar con el cliente si es un campo requerido o puede dejarse vacío y completarse después
  desde el módulo Alumnos. Si es requerido, añadir validación en `PasoAlumno`.

- [DEUDA] La lista de alumnos vinculados al representante no tiene paginación del lado del
  servidor. Si un representante institucional tiene muchos hijos registrados, el GET carga
  todos de golpe. Implementar paginación en `GET secretaria/alumnos/?buscar=` cuando sea
  necesario.

- [DEUDA] `periodo_escolar` se obtiene del endpoint de configuración y se copia a `datos`
  en `PasoConfiguracion`. Si el usuario tarda en completar el wizard y el período cambia
  en el servidor (cierre de año), el valor en `datos` quedaría obsoleto. Considerar leerlo
  de nuevo al confirmar en lugar de cachearlo en el state del wizard.

- [DEUDA] La `BarraProgreso` no permite navegar hacia atrás haciendo clic en un paso ya
  completado. Pequeña limitación de UX: el usuario debe usar el botón "Volver". Evaluar
  si el cliente necesita esta funcionalidad antes de implementarla.

- [DEUDA] `setTimeout(() => URL.revokeObjectURL(url), 5000)` en `useInscripcion.descargarPDF`
  no tiene referencia para limpieza si el componente desmonta antes de los 5 s. El riesgo
  es mínimo (5 s vs 60 s originales), pero para mayor corrección podría usarse un `useRef`
  con cleanup en un `useEffect` del componente raíz.

- [RESUELTO 2026-07-02] `PasoAlumno.jsx` usaba `DatePickerES` (solo calendario, sin
  autocorrección) para `fecha_nacimiento`. Se migró a `SmartDateInput`, que ahora soporta
  además un ícono de calendario con popper de `react-datepicker` vía `withPortal` (útil si
  en el futuro este paso se muestra dentro de un modal). El contrato de `SmartDateInput`
  es `onChange(date: Date|null)`, distinto al patrón `onChange({target:{name,value}})` del
  resto del formulario — se agregó un handler dedicado `handleFechaNacimiento` y un
  `useMemo` para mantener estable la identidad del `Date` pasado como `value` (ver nota de
  Auditoría más abajo sobre por qué esto es necesario).

- [DEUDA] La cédula del representante (`PasoRepresentante.jsx:36`) dispara la búsqueda con
  solo `cedulaInput.length > 6` como guarda, sin validar que sea numérica/formato cédula.
  No rompe nada (el backend responde `existe:false`), pero genera peticiones innecesarias
  si el usuario pega texto no numérico.

---

## Auth / ApiClient

- [DEUDA] `apiClient.js` redirige a `/login` con `window.location.href` en caso de 401
  sin refresh token. Esto rompe la integración con el portal de representantes que usa
  `/portal/login` como ruta de autenticación separada. Al implementar el portal,
  diferenciar el redirect según el tipo de token (admin vs. representante).

- [DEUDA] `failedQueue` en `apiClient.js` es una variable de módulo (singleton). Si el
  usuario abre dos pestañas y ambas hacen refresh simultáneo, la cola puede corromperse.
  Refactorizar a un patrón basado en promesa compartida por pestaña.

---

## Auditoría integral 2026-06-13

### Seguridad / Auth

- [DEUDA ALTA] `portal_token` y `portal_refresh_token` se guardan en `localStorage`
  (`portalClient.js:24`, `PortalAuthContext.jsx:30,54-55`). Expuesto a robo por XSS.
  El panel admin usa `httpOnly cookie` (correcto). Migrar el portal a `httpOnly cookie`
  requiere cambios en Django pero es el fix definitivo. Mientras tanto: CSP estricto.
  Ya comentado en `portalClient.js:1-11`.

- [DEUDA MEDIA] `PortalAuthContext.login()` setea `user` con campos del payload de la
  respuesta (`representante_id, nombre, apellido`), pero `extractUserData()` también lee
  `cedula` del JWT. Los dos paths producen objetos de usuario con forma distinta.
  Unificar: siempre llamar `extractUserData(access)` al hacer login.

- [DEUDA BAJA] `apiClient.js:67` redirige a `/login` sin verificar si el request viene
  del contexto del portal — si en el futuro se usa `apiClient` accidentalmente desde el
  portal, el redirect irá al login incorrecto. Añadir check
  `window.location.pathname.startsWith('/portal')` antes de decidir destino.

### Accesibilidad (WCAG 2.1 AA)

- [DEUDA ALTA] 6 modales sin `role="dialog"`, `aria-modal`, `aria-labelledby` ni
  `useFocusTrap`: `ConfirmDeleteModal`, `ModalRegistrarAlumno`, `ModalEditarAlumno`,
  `ModalAsignarGrado`, `ModalAjustarMensualidades`, `ComprobantePagoModal` (portal).
  El patrón completo ya existe en `ModalClase.jsx:53,81-83` — replicar.

- [DEUDA ALTA] `aria-invalid` ausente en los 14 formularios del sistema. Screen readers
  no detectan qué campos tienen error. Propuesta: componente `<Field label error>` que
  aplique automáticamente `aria-invalid={!!error}`, `aria-describedby` y texto de error.

- [DEUDA MEDIA] ~40 botones icon-only (tablas, toolbars) sin `aria-label`. Usuarios de
  teclado/screen reader no saben qué hace el botón. Agregar `aria-label` descriptivo.

- [DEUDA MEDIA] Ningún formulario implementa foco automático al primer campo con error
  ni desplazamiento al campo inválido. Implementar en `handleSubmit` de cada formulario.

### Formularios

- [DEUDA MEDIA] Campos de cédula y teléfono en formularios del portal y secretaría no
  tienen `inputMode="numeric"` o `"tel"` — en móvil el teclado muestra QWERTY en vez
  del numérico. Aplicar en `PortalLogin.jsx`, `ModalRepresentante.jsx`,
  `ModalRegistrarAlumno.jsx` y todos los campos de identificación.

- [DEUDA BAJA] `ModalAjustarMensualidades` no valida montos negativos en el cliente.
  Agregar `min={0}` en los inputs numéricos de monto.

### Hooks / Rendimiento

- [DEUDA MEDIA] `cargarDashboard` en `PortalDashboard.jsx:65` definida sin `useCallback`
  y referenciada en dos `useEffect([])`. Viola `react-hooks/exhaustive-deps`. Si en el
  futuro la función cierra sobre estado, creará loop silencioso. Convertir a
  `useCallback(async () => { ... }, [])`.

- [DEUDA MEDIA] `cargarDashboard` en `PortalDashboard.jsx` no tiene AbortController —
  si el representante navega mientras carga, el `setState` se ejecuta en componente
  desmontado. Agregar AbortController con cleanup en useEffect.

### Endpoints

- [DEUDA MEDIA] `useAlumnos.js:117` usa `cobranza/buscar/${cedula}/` para autocompletar
  el representante al registrar un alumno. Este endpoint es del módulo de cobranza y
  puede devolver `representante: null` si el alumno no tiene mensualidades.
  Usar en su lugar `secretaria/representante/${cedula}/` que es el endpoint canónico.

- [DEUDA BAJA] `useTasaBCV.js` llama a `cobranza/stats/` (endpoint pesado de KPIs) solo
  para extraer `tasa_bcv`. Solicitar al backend endpoint `GET /cobranza/tasa-bcv/`.

### Duplicidad / Deuda de código

- [DEUDA MEDIA] ~80 líneas de lógica de refresh JWT (`isRefreshing`, `failedQueue`,
  `processQueue`) duplicadas entre `apiClient.js:22-74` y `portalClient.js:34-106`.
  Extraer a `utils/createRefreshInterceptor.js` con firma:
  `createRefreshInterceptor(client, getToken, setToken, refreshUrl, onLogout)`.

- [DEUDA BAJA] 3 `console.error/warn` olvidados en utilidades de impresión:
  `printComprobanteCompacto.jsx:143`, `printReciboCobranza.jsx:290`,
  `reportGenerator.js:6`. Eliminar o reemplazar con toast de error.

- [DEUDA BAJA] `ComprobantePagoModal.jsx:78-80` usa `setTimeout(handleClose, 1500)` tras
  éxito sin limpiar el timer si el modal se cierra manualmente antes — produce cierre
  doble silencioso. Guardar la referencia del timer y cancelarla en `handleClose`.

### Z-index / Estilos

- [DEUDA BAJA] Escala de z-index inconsistente entre modales: `z-50`, `z-[100]`, `z-40`
  y sin definir. Definir en CSS global: `--z-overlay: 40; --z-modal: 50; --z-toast: 9999`
  y referenciar desde Tailwind con `z-[var(--z-modal)]`.

---

## Mejoras UI/UX detectadas — 2026-06-23

### Recibos

- [DEUDA MEDIA] `DynamicRows.handleRemove` en `Recibos.jsx` usa `window.confirm()` nativo
  para confirmar la eliminación de filas de asignaciones/retenciones. No sigue el sistema
  de diseño. Reemplazar con un mini-modal o un estado `pendingDelete` en el componente
  para mostrar una confirmación inline con los estilos del proyecto.

- [DEUDA MEDIA] `Recibos.jsx` asume layout de escritorio (sidebar `w-[400px]` + preview
  A4 de `595px`). En viewport móvil (<768px) el contenido se desborda sin scroll
  horizontal ni diseño alternativo. Evaluar si el colegio usa este módulo desde celular;
  si es así, agregar un layout apilado (formulario arriba, preview abajo) usando `md:flex`.

### Pagos (Nómina/Cesta)

- [DEUDA MEDIA] `handleSaveCestaConfig` en `Pagos.jsx` no tiene estado de carga mientras
  guarda (`saving`). Si el usuario hace doble clic en "Guardar configuración" puede enviar
  dos PUT simultáneos. Agregar `const [savingConfig, setSavingConfig] = useState(false)`
  y deshabilitar el botón mientras la petición está en curso.

---

## Auditoría del módulo Inscripciones — 2026-07-02

### Bug crítico corregido (efecto colateral de la auditoría, fuera del módulo)

- [RESUELTO 2026-07-02] `Auditoria.jsx` usaba `SmartDateInput` con
  `onChange={e => setFechaInicio(e.target.value)}`, asumiendo un objeto evento. Pero
  `SmartDateInput.onChange` siempre entregó un `Date` (o `null`) directamente, nunca un
  evento — por lo que escribir o seleccionar una fecha en los filtros "Desde"/"Hasta" de
  Auditoría lanzaba `TypeError: Cannot read properties of undefined (reading 'value')`.
  Además, el `value` inicial se pasaba como string `'yyyy-MM-dd'`, pero `SmartDateInput`
  espera un `Date` para su `format()` interno, así que el campo arrancaba en blanco en
  vez de mostrar la fecha de hoy. Se corrigió: `fechaInicio`/`fechaFin` siguen
  almacenándose como string ISO (lo que usa el backend), pero se derivan a `Date` con
  `useMemo` (identidad estable) para alimentar `SmartDateInput`, y el `onChange` ahora
  recibe el `Date` directamente. Este bug se detectó porque `SmartDateInput` es un
  componente compartido y se tocó para agregarle el ícono de calendario (ver abajo).

### Mejora aplicada

- [RESUELTO 2026-07-02] `SmartDateInput.jsx` (compartido) solo permitía escribir la
  fecha a mano, sin opción de calendario visual. Se agregó un ícono de calendario que
  abre un `react-datepicker` en modo `withPortal` (overlay centrado, seguro dentro de
  modales y con teclado móvil abierto). El contrato público (`value: Date|null`,
  `onChange(date: Date|null)`) no cambió — es retrocompatible con el uso existente en
  `Auditoria.jsx`. Se añadió también soporte de prop `id` para asociar correctamente
  `<label htmlFor>`.

### Deuda técnica anotada, no implementada

- [DEUDA BAJA] `SmartDateInput` no expone `aria-describedby` hacia su mensaje de error
  interno (`role="alert"` sin `id` referenciado desde el input). Funciona para lectores
  de pantalla que anuncian regiones `alert`, pero no es tan robusto como el patrón
  `aria-describedby` usado en los demás campos del wizard de Inscripciones.
- [DEUDA BAJA] El botón de calendario de `SmartDateInput` no cierra el popper al
  presionar Tab (solo con Escape o clic afuera). Verificar navegación por teclado
  completa si se usa en formularios con muchos campos.

---

## Revisión de ListaAlumnos / useAlumnos — 2026-07-07

### Mejoras aplicadas

- [RESUELTO 2026-07-07] `fetchData` en `useAlumnos.js` volvía a pedir
  `cobranza/configuracion/` cada vez que cambiaba `busqueda` o `mostrarInactivos`
  (iba en el mismo `Promise.all` que la lista de alumnos), aunque los montos de
  configuración no dependen del filtro. Se separó en un `useEffect` propio que
  carga la configuración una sola vez al montar el hook.
- [RESUELTO 2026-07-07] El panel "Configuración" en `ListaAlumnos.jsx` no se
  cerraba al hacer click afuera ni con Escape. Se agregó `ref` + listeners de
  `mousedown`/`keydown` para cerrarlo como cualquier dropdown estándar.
- [RESUELTO 2026-07-07] `ListaAlumnos.jsx` tenía una función local
  `handleAsignarGrado` con el mismo nombre que `alumnos.handleAsignarGrado`
  (del hook). Funcionaban por estar en namespaces distintos, pero el nombre
  duplicado confundía la lectura. Renombrada a `handleAbrirAsignarGrado`.

### Deuda técnica anotada, no implementada

- [DEUDA MEDIA] `useAlumnos.js` (hook único de ~390 líneas) mezcla ocho
  responsabilidades: lista, configuración de montos, export a Excel, registro,
  edición, asignar grado, retiro y reactivación. Son +50 propiedades retornadas
  en un solo objeto. Se recomienda dividir en hooks más chicos
  (`useAlumnosList`, `useAlumnoRegistro`, `useAlumnoEdicion`,
  `useAlumnoAcciones` para grado/retiro/reactivar) que `ListaAlumnos.jsx`
  componga. Es un refactor de superficie amplia (toca el único consumidor del
  hook por completo) — requiere aprobación antes de tocarlo.
- [DEUDA MEDIA] La tabla de `ListaAlumnos.jsx` no tiene paginación: `GET
  secretaria/alumnos/` trae todos los alumnos del colegio de una sola vez.
  Con colegios grandes (500+ alumnos) esto puede ser pesado. Requiere que el
  backend exponga paginación (cursor o page-number) antes de adaptar el
  frontend — coordinar con backend primero.

## Portal Docente — Seguridad (corregido)

- [RESUELTO 2026-08-04] Auditoría del portal docente encontró que cuatro
  endpoints GET en `academico/views.py` no filtraban por ownership del
  docente (solo sus `POST`/`DELETE` sí lo hacían), permitiendo que un docente
  autenticado leyera notas, asistencia o material de estudio de una
  materia/sección que no era suya con solo cambiar `materia_id` o
  `grado_seccion` en la query string:
  - `NotasGradoView.get`: se agregó el mismo chequeo de ownership que ya
    tenía su `.post` (secretaria+ sin restricciones, o docente dueño de
    `Materia`) antes de armar la respuesta.
  - `AsistenciaView.get`: se agregó el chequeo vía
    `IsDocenteAsignadoOrSecretariaOrAbove`. Fue necesario ajustar
    `_grado_seccion_objetivo` (compartido con `.post`) para que también lea
    `grado_seccion` desde `request.query_params`, ya que antes solo miraba
    `request.data` (vacío en un GET sin body).
  - `MaterialEstudioListCreateView.get`: con `materia_id` en query params se
    valida ownership igual que `.post`. Sin `materia_id` (listado general) se
    decidió no exigir el parámetro como 400 sino restringir el queryset a
    `materia__docente=request.user` cuando el rol es docente, para no romper
    el listado general existente del frontend; secretaria+ sigue viendo todo.
  - `MaterialEstudioDetailView.get`: se agregó el mismo chequeo de ownership
    que ya tenía `.delete` de la misma vista.
  Verificado con `python -c "import ast; ast.parse(...)"` y
  `python manage.py check` (ambos sin errores).

- [RESUELTO 2026-08-04] `WidgetCalendario.jsx` usaba `violet-*` (botón
  agregar evento, día seleccionado, día actual, eventos personales) en vez
  de `var(--docente-primary)`, el único lugar del portal docente que se
  apartaba del color de marca. Se unificó a `var(--docente-primary)` /
  `var(--docente-primary-dark)`; se conservó `amber-*` solo para eventos de
  evaluación (`solo_lectura`), ya que esa sí es una distinción de categoría
  legítima (evaluación vs. evento personal), consistente con otras alertas
  ámbar del sistema.

## Sidebar dinámico — Favoritos y grupos colapsables — 2026-08-28

- [DEUDA] `useSidebarPrefs.js` persiste favoritos y grupos colapsados en
  `localStorage` bajo la clave `octopus_sidebar_prefs_<username>`. Esto es
  local al navegador: si el usuario cambia de dispositivo o borra datos del
  sitio, pierde sus preferencias. Migrar a un endpoint de perfil de usuario
  (`GET/PATCH secretaria/mi-perfil/preferencias-sidebar/` o similar) para que

## MainLayout — Branding y shell con redondeo — 2026-08-29

- [DEUDA BAJA] `MainLayout.jsx` usa `height: '100vh'` en el flex-col que contiene
  el header y main. Según el estándar responsive obligatorio (CLAUDE.md D10),
  debe ser `dvh` (dynamic viewport height) para evitar corte en móviles donde la
  barra del navegador reduce la altura de `vh`. Cambiar a `style={{ height: '100dvh', overflow: 'hidden' }}`.
  Nota: esto es código preexistente (anterior al cambio de branding), solo se
  anota para corregir cuando se audite responsive.

- [DEUDA BAJA] El botón BCV en estado normal (background `rgba(255,255,255,0.10)`
  sobre un gradiente dinámico) puede no cumplir WCAG AA (4.5:1) en puntos claros
  del degradado. En el peor caso (sobre #0c828d más claro) el contraste es ~3.54:1.
  No es un cambio nuevo (código preexistente), pero se anotó para auditar. Si se
  requiere cumplimiento AA estricto, oscurecer el fondo del botón a
  `rgba(255,255,255,0.15)` o `rgba(255,255,255,0.20)` y verificar de nuevo.

- [RESUELTO 2026-08-29] El estado de error del botón BCV (texto `#dc2626` sobre
  fondo `#fef2f2`) tenía contraste ~4.42:1, por debajo de 4.5:1 WCAG AA. Se
  cambió el color del texto a `#991b1b` (~7.6:1), oscureciendo el texto en vez
  de aclarar el fondo, consistente con el resto de la barra.

- [RESUELTO 2026-08-29] El chip de BCV en estado normal pasó de fondo blanco
  10% (`rgba(255,255,255,0.10)`) a fondo negro 18% (`rgba(0,0,0,0.18)`) sobre
  el degradado, siguiendo la referencia visual de marca (chips oscuros tipo
  "Schools"). Esto también resuelve el riesgo de contraste anotado antes:
  con negro 18% el peor caso (sobre `#0c828d`, el extremo más claro) da
  ~6.27:1 para texto blanco, muy por encima de 4.5:1.

- [DEUDA BAJA] El fondo de los chips (fecha, BCV, avatar) usa
  `rgba(0,0,0,0.18)` fijo, no la variable `--topbar-hover` definida en
  `index.css` (que quedó en `rgba(255,255,255,0.10)` según la especificación
  original del PASO 2). Es una divergencia intencional para igualar la
  referencia visual de marca, pero deja el token `--topbar-hover` sin uso real
  en el código. Si el diseño de chips oscuros se confirma como definitivo,
  evaluar renombrar o redefinir el token para que refleje el valor realmente
  usado.

- [DEUDA BAJA] El avatar del header ahora usa fondo `rgba(0,0,0,0.18)` con
  texto `var(--topbar-fg)` (blanco), en vez de "fondo blanco con iniciales en
  var(--pb)" como pedía la especificación escrita original. Cambio hecho para
  igualar la captura de referencia que el usuario proporcionó como objetivo
  visual definitivo.

- [DEUDA BAJA] `useEffect(() => { setSidebarOpen(false); }, [location.pathname])`
  en `MainLayout.jsx` (línea preexistente, no tocada en la sesión de branding)
  genera un error del linter `react-hooks/set-state-in-effect` (setState
  síncrono dentro de un efecto). Es deuda previa a este cambio — no se
  corrigió por estar fuera de alcance (solo tokens/branding de la barra).
  las preferencias sigan al usuario entre dispositivos. El campo `version: 1`
  en el objeto guardado ya está pensado para permitir esa migración de
  formato sin romper a los usuarios existentes.

- [DEUDA] La clave de persistencia usa `username` en vez de un `id` numérico
  estable, porque `AuthContext.extractUserData()` no expone `user.id` (el
  JWT decodificado solo se lee para `username`, `rol` y `nombre` — ver
  `AuthContext.jsx:11-26`). Si en el futuro se permite renombrar el
  `username` de un usuario, sus preferencias de sidebar quedarían huérfanas
  bajo la clave vieja. Si se agrega `user.id` al JWT/AuthContext más
  adelante, migrar la clave de `octopus_sidebar_prefs_<username>` a
  `octopus_sidebar_prefs_<id>`.
