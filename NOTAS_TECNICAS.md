# NOTAS TÉCNICAS — OCTOPUS FRONTEND

Deuda técnica detectada durante auditorías y refactorings.

## MÓDULO COBRANZA

### 🔴 CRÍTICO

1. **Componente Monolítico (1100+ líneas)** — ✅ RESUELTO
   - Cobranza.jsx reducido a ~470 líneas (solo orquestación/lógica)
   - CobranzaStep1.jsx, CobranzaStep2.jsx, ResumenPago.jsx extraídos e integrados

2. **Manejo de Estado Fragmentado** — ⏳ PENDIENTE
   - 12+ useState calls, cascadas de re-renders (11 setXxx en serie tras registrar pago)
   - Solución propuesta: `useReducer` para agrupar transiciones de reset/selección
   - No implementado: cambio de mayor riesgo, requiere pruebas de regresión más profundas

### 🟡 MEDIO

3. ✅ Sticky sidebar sin max-height — corregido (`maxHeight: calc(100vh - 82px)` + scroll)
4. ✅ Grid 3 columnas se comprime en 360px — corregido (`grid-cols-2 sm:grid-cols-3`)
5. ✅ Validación de tasa BCV — ya estaba guardada con `tasa > 0` en todos los puntos de división
6. ✅ Errores genéricos en catch — mensaje específico para error de red sin respuesta
7. ✅ Búsqueda sin feedback visual completo — borde azul en input mientras `loadingBusqueda`

### 🟢 MENOR

8. ✅ Duplicación de fmt/fmtN/fmtZ — centralizado en `utils/formato.js`
9. ⏳ Sin skeleton loaders en Step 1 — pendiente (spinner simple es aceptable por ahora)
10. ⏳ Casos edge sin testing — pendiente (no hay suite de tests en el proyecto)

## FASE 2 — SMARTDATEINPUT ✅

Componente SmartDateInput.jsx con máscara, autocorrección, validación.
Lint limpio, patrón de sincronización de estado corregido (sin `useEffect`+`setState`).

Aplicado en: Cobranza (PasoAlumno), Inscripciones, Auditoria, y ahora **ListaAlumnos**
(ModalEditarAlumno, ModalRegistrarAlumno — campo "Fecha de Nacimiento").

Aplicar a otros módulos (pendiente, fuera de alcance de esta auditoría):
Boletín, Asistencia

## MÓDULO LISTA ALUMNOS

Auditoría 2026-07-02. Resuelto en esta pasada:
- ✅ Migración de `DatePickerES` (sin portal, se recortaba en modales con `overflow-y-auto`) a `SmartDateInput` en ModalEditarAlumno y ModalRegistrarAlumno.
- ✅ Focus trap + cierre con Escape agregado a ModalRetirar y ModalConfirmarReactivar (antes inconsistente con el resto de modales del módulo).
- ✅ Cierre al hacer click fuera del modal, homologado en los 6 modales del módulo (antes solo lo tenía SidebarFichaAlumno).
- ✅ `handleExportExcel` (useAlumnos.js) usa `parseApiError` en vez de mensaje genérico fijo.
- ✅ `sincronizarTasa` (cobranza.service.js) ahora acepta `signal` opcional, consistente con el resto del servicio.

### 🟢 MENOR — pendiente, fuera de alcance

- `useMensualidadesAlumno.handleOpenModal` no usa `AbortController`: si el usuario abre la ficha de un alumno y rápido abre la de otro, la respuesta tardía puede sobrescribir los datos mostrados (condición de carrera de bajo impacto).
- No existe `alumnos.service.js`: las llamadas a `secretaria/alumnos/...` están inline en `useAlumnos.js`, a diferencia del dominio "cobranza" que sí tiene capa de servicio dedicada.
- Arrays/objetos literales recreados en cada render sin memoizar (array de campos del representante en `ModalRegistrarAlumno`, "Detalles Académicos" en `SidebarFichaAlumno`) — costo trivial, no urgente.
- Tabla de alumnos usa `overflow-x-auto` + `min-w-[700px]`: funciona pero implica scroll horizontal obligatorio en <700px, sin vista de tarjetas alternativa para mobile puro.

## MÓDULO NOMINA

Auditoría 2026-07-02. Resuelto en esta pasada:
- ✅ `fecha_ingreso` (Docente/Administrativo/Apoyo) migrado de `<input>` texto plano a `SmartDateInput` en `EmpleadoForm.jsx`. El estado se guarda como ISO (`yyyy-MM-dd`), igual que la API — se eliminó `normalizeFechas` en `useNomina.js`, que quedó obsoleta.
- ✅ Bug latente corregido de paso: al editar un empleado existente, `handleOpenEditModal` volcaba `emp.fecha_ingreso` (ISO, tal como lo devuelve la API) directamente al campo, pero `calcularAnosServicio` parseaba con formato `dd/MM/yyyy` — el cálculo de "años de servicio" fallaba silenciosamente en modo edición hasta que el usuario retipeaba la fecha. Ahora ambos usan ISO consistentemente.
- ✅ Cierre por clic en backdrop + focus trap (`useFocusTrap`, ya existente en el proyecto) agregado a `EmpleadoModal` y `ReciboModal` — antes solo cerraban con Escape o el botón X.
- ✅ `jsPDF`/`jspdf-autotable` (vía `utils/nominaPDF.js`) ahora se cargan con `import()` dinámico dentro de `handleGenerar` en `ReciboModal.jsx`, en vez de estar en el bundle inicial de la página Nomina. `fmtBs` se extrajo a `constants/nominaFmt.js` (sin dependencia de jsPDF) para que la UI en vivo del modal no dependa de la carga diferida. Verificado con `vite build`: `nominaPDF-*.js` (17.4 kB) quedó en un chunk separado del de `Nomina-*.js` (40.8 kB).
- ✅ Skeleton loader (`components/nomina/SkeletonFila.jsx`) reemplazó el spinner genérico de página completa en la carga inicial — ahora el header y las stat cards se muestran con placeholders en vez de ocultar toda la página.
- ✅ Validación inline por campo (nombre/apellido/cédula/cargo) en `EmpleadoForm.jsx`, además del toast existente — antes solo había `toast.warning` sin marcar el campo específico.

### 🟢 MENOR — pendiente, fuera de alcance

- Tabla de empleados sin paginación ni virtualización — aceptable para el volumen típico de nómina de un colegio, pero si algún colegio supera unos cientos de empleados convendría paginar.
- `ReciboModal` no se probó en un viewport real de 360-390px con teclado numérico abierto (solo revisión de código) — el diseño con `maxHeight: 92vh` + grillas responsive debería funcionar pero falta verificación manual en dispositivo/emulador.
- `eslint` reporta `react-hooks/set-state-in-effect` en `useNomina.js:90-94` (el `useEffect` de carga inicial llama `fetchData` directamente, que hace `setState` de forma síncrona). Es un patrón preexistente no introducido por esta auditoría; el mismo aviso ya se documentó como resuelto en Cobranza vía SmartDateInput — aplicar el mismo patrón de corrección aquí queda pendiente.
- `utils/nominaPDF.js.bak` — archivo de respaldo suelto en el repo, no debería estar versionado.

## CHECKLIST

✅ DecimalInput extraído
✅ maxForLine memoizado
✅ aria-label agregado
✅ construirItemsRecibo helper
✅ Componentes de pasos extraídos e integrados en Cobranza.jsx
✅ Correcciones responsive (grid móvil, sticky sidebar)
✅ Centralizar formato (fmt/fmtN/fmtZ)
✅ Build y lint verificados sin errores nuevos
⏳ Hooks personalizados (useCobranzaBusqueda, useCobranzaPago) — no implementado
⏳ useReducer para estado fragmentado — no implementado
⏳ Verificación en navegador — no realizada (requiere backend + datos de prueba)

**Nota de verificación**: Esta refactorización solo reorganiza JSX/lógica existente
en componentes; no cambia comportamiento. Validado con `eslint` y `vite build`
exitosos. No se ejecutó prueba end-to-end en navegador por falta de backend
corriendo con datos de prueba en este entorno.

Actualización: 2026-07-02

---

# BACKEND — GENERACIÓN AUTOMÁTICA DE MENSUALIDADES (2026-07-02)

Deuda técnica detectada al implementar la generación automática de mensualidades
(cobranza/services.py + tarea mensual de Celery + comando de backfill). Solo se
anota, no se tocó:

1. **`GenerarAnualidadView` usa año calendario, no período escolar** —
   genera Ene–Dic (incluye agosto/vacaciones), mientras el resto del sistema
   (búsqueda de cobranza, servicio nuevo) trabaja con el período Sep–Jul.
   Conviven dos definiciones de "año". Migrar la vista al servicio
   `cobranza.services.generar_mensualidades` cuando se pueda validar el impacto
   en el frontend que la consume.

2. **Doble vía de notificaciones de cobranza** — la señal `post_save` de
   `Mensualidad` programa avisos con countdown (días 0/5/10/15 desde la creación)
   y además la tarea diaria `revisar_y_programar_notificaciones_pendientes`
   dispara por días desde el vencimiento real. Una mensualidad creada
   individualmente (get_or_create en `GenerarAnualidadView`) puede notificar dos
   veces. El servicio nuevo usa `bulk_create` (sin señales) y deja las
   notificaciones solo a la tarea diaria, que es el criterio correcto.

3. **`Inscripcion.save()` no valida cuota de inscripción impaga** — el bloqueo
   por deuda de inscripción vive en `InscripcionSerializer` (cubre los dos
   endpoints de la API), pero una inscripción creada por admin de Django o
   shell lo esquiva. Considerar mover la validación al modelo.

4. **5 tests de `portal` fallan de forma preexistente** (verificado contra main
   sin cambios): 2 de comprobantes ahora exigen número de referencia
   (`"Debe ingresar el número de referencia"`) y 3 de Stripe webhook. Los tests
   quedaron desactualizados respecto a validaciones agregadas después.

5. **Los tests de portal dejan archivos basura** en `media/comprobantes/` al
   correr (PNGs de prueba). Usar un `MEDIA_ROOT` temporal en los tests.
