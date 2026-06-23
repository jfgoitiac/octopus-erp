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
