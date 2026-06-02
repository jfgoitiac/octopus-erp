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

## Auth / ApiClient

- [DEUDA] `apiClient.js` redirige a `/login` con `window.location.href` en caso de 401
  sin refresh token. Esto rompe la integración con el portal de representantes que usa
  `/portal/login` como ruta de autenticación separada. Al implementar el portal,
  diferenciar el redirect según el tipo de token (admin vs. representante).

- [DEUDA] `failedQueue` en `apiClient.js` es una variable de módulo (singleton). Si el
  usuario abre dos pestañas y ambas hacen refresh simultáneo, la cola puede corromperse.
  Refactorizar a un patrón basado en promesa compartida por pestaña.
