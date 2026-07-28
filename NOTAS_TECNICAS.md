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

### Cambio de negocio 2026-07-11 — Fecha de nacimiento ya no es obligatoria

- Alcance: crear alumno (`ModalRegistrarAlumno`) y editar alumno (`ModalEditarAlumno`) desde Lista de Alumnos. **No** se tocó el wizard de inscripción (`PasoAlumno.jsx`, `ModalCompletarAlumno.jsx`, `inscripcionValidacion.js`), que sigue exigiéndola — decisión explícita del usuario, pendiente de confirmar si también debe relajarse ahí.
- Backend: `Alumno.fecha_nacimiento` pasó de `DateField()` a `DateField(null=True, blank=True)` (migración `secretaria/0012_alumno_fecha_nacimiento_opcional.py`, aplicada). `AlumnoSerializer` (creación) hereda `required=False`/`allow_null=True` automáticamente del modelo; `AlumnoUpdateSerializer` ya lo permitía.
- Se corrigió `cobranza/utils.py` (generación de PDF de ficha del alumno): llamaba `alumno.fecha_nacimiento.strftime(...)` sin guardas — ahora muestra "No especificada" si es `None`.
- `useAlumnos.js::handleRegister` ahora envía `null` en vez de `""` cuando el campo queda vacío (mismo patrón que `handleSaveEdit`, que ya lo hacía).
- 🟡 Pendiente de revisar si aplica: cualquier otro reporte/PDF/exportación que asuma `fecha_nacimiento` no nulo (se auditó `cobranza/utils.py`; no se encontraron otros usos de `.strftime()`/aritmética directa sobre el campo en el backend al momento de este cambio, pero conviene revisar de nuevo si se agregan reportes nuevos).

### Bugs corregidos 2026-07-11

- ✅ **Fecha de nacimiento "desaparecía" al reabrir Editar Información**: no era un problema de guardado — `SmartDateInput.jsx` inicializaba su estado interno `display` en `""` y solo lo sincronizaba con la prop `value` cuando ésta *cambiaba* tras el montaje. Como `ModalEditarAlumno` se desmonta/remonta en cada apertura (render condicional en `ListaAlumnos.jsx`), cada apertura era un "primer render" y el campo nunca se pintaba con la fecha ya persistida en el backend. Corregido con inicialización perezosa de `display` a partir de `value`. Afecta también a `ModalRegistrarAlumno` y el wizard de inscripción, que comparten el componente.
- ✅ **Modal de Editar Información se cerraba solo mientras se editaba**: el fondo (`backdrop`) usaba `onClick={onClose}`, que se dispara con cualquier `click` — incluido el que el navegador genera cuando el usuario selecciona texto arrastrando el mouse desde un input (ej. "Dirección") y suelta el botón fuera del modal. Corregido en `ModalEditarAlumno.jsx` con detección `mousedown`+`mouseup` sobre el backdrop mismo (`e.target === e.currentTarget` en ambos eventos), en vez de un solo `onClick`.

## PAGINACIÓN DE LISTADOS 2026-07-12

### Alcance implementado

Paginación server-side (DRF `PageNumberPagination`, `page_size=20`, `page_size_query_param=page_size`, `max_page_size=100`) en las 3 listas de mayor volumen:

- **Alumnos** (`AlumnoListView`, `secretaria/alumnos/`) + `useAlumnos.js` + `ListaAlumnos.jsx`
- **Representantes** (`RepresentanteViewSet`, `secretaria/representantes/`) + `useRepresentantes.js` + `Representantes.jsx`
- **Morosos** (`ListaMorososView`, `cobranza/morosos/` — es `APIView`, se paginó manualmente instanciando el paginador) + `useMorosos.js` + `Morosos.jsx`

Clase de paginación centralizada en `octopus-api/config/pagination.py` (`StandardResultsPagination`), reutilizable para futuras listas.
Componente reutilizable `octopus-frontend/src/components/shared/Pagination.jsx` (Anterior/Siguiente + números de página, mismo estilo visual que ya usaba `Comprobantes.jsx`).

Cambiar la búsqueda o cualquier filtro reinicia siempre a la página 1 (wrapeando los setters de `busqueda`/`mostrarInactivos`/`minHijos` dentro de cada hook). Si la página actual queda fuera de rango tras una mutación (ej. retirar el último alumno de la última página → DRF responde 404 "Invalid page"), el hook vuelve automáticamente a la página 1 en vez de mostrar un error.

**Morosos — cuidado con las tarjetas de resumen financiero**: `MorososSummary` (deuda total, solvencia adeudada) mostraba totales calculados con `.reduce()` sobre el array `alumnos` en el frontend. Al paginar, ese array pasó a contener solo la página actual (20 filas), lo que habría mostrado montos truncados/incorrectos. Se corrigió agregando `total_deuda_usd` y `total_solvencia_usd` al backend (`qs.aggregate(Sum(...))` sobre el queryset completo, antes de paginar) y el frontend ahora lee esos campos en vez de recalcular sobre la página visible. Si se pagina alguna otra lista con tarjetas de totales agregados, revisar el mismo patrón.

Se detectaron y corrigieron dos consumidores adicionales de `secretaria/alumnos/` que esperaban un array plano y se habrían roto con la respuesta paginada `{count, next, previous, results}`: `PasoAlumno.jsx` (wizard de inscripción, búsqueda de hijos por representante) y `useBoletin.js` (búsqueda de alumno para boletín). Ambos ahora leen `res.data?.results ?? res.data ?? []`.

### Fuera de alcance (decisión explícita, no paginado)

- **Nómina/Empleados** (`EmpleadoViewSet`, `useNomina.js`): dataset típicamente pequeño (personal de un colegio) y ya usa tabs (Docente/Apoyo/Administrativo) con filtrado client-side sobre el array completo (`empleadosPorTab` en `useNomina.js`). Paginar el endpoint rompería ese filtrado por tab sin una relectura de arquitectura (habría que paginar por tab en el backend). Se dejó fuera por desproporción costo/beneficio; revisar si la nómina crece significativamente.
- **Notas** (`NotasGradoView`) y **Asistencia** (`AsistenciaView`), en `academico/views.py`: no son listados generales, son grillas acotadas a un solo `grado_seccion` (típicamente ≤40 alumnos) que el docente carga y guarda en bloque de una sola vez. Paginar rompería el flujo de "ver y guardar todo el curso junto".

### 🟡 Pendiente — mismo patrón de cierre en otros modales

El `onClick={onClose}` en el backdrop (vulnerable a la misma selección-de-texto-que-cierra) sigue presente, sin corregir, en ~19 modales más del proyecto (`ModalAjustarMensualidades`, `ModalRegistrarAlumno`, `ModalAjustarInscripcion`, `ModalRetirar`, `ModalAsignarGrado`, `ModalRepresentante`, modales de horarios/nómina/sistemas, etc.). No se tocaron en esta pasada por estar fuera del alcance solicitado (solo Lista de Alumnos). Si se repite la queja en otro módulo, aplicar el mismo fix de `mousedown`/`mouseup`, idealmente extrayéndolo a un hook o componente `ModalBackdrop` reutilizable en vez de duplicarlo modal por modal.

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
   — ✅ Los 3 de Stripe webhook se eliminaron en el housekeeping de Fase 0
   (2026-07-27, ver sección al final de este archivo); quedan pendientes solo
   los 2 de comprobantes.

5. **Los tests de portal dejan archivos basura** en `media/comprobantes/` al
   correr (PNGs de prueba). Usar un `MEDIA_ROOT` temporal en los tests.

---

# AUDITORÍA INSCRIPCIONES Y ALUMNOS (2026-07-07)

Auditoría técnica de solo lectura del flujo de inscripción y el módulo de alumnos.
Solo se anota deuda técnica, no se implementó ninguna corrección.

## Hallazgos

| Sev. | Archivo:línea | Descripción | Impacto | Solución propuesta |
|---|---|---|---|---|
| 🔴 Alto | `secretaria/models.py:274-296` (Inscripcion.clean) + `serializers.py:330` | No existe `unique_together`/`UniqueConstraint` en BD para (alumno, periodo_escolar). La protección contra doble inscripción es solo un `filter().exists()` en `clean()` y en el serializer, sin `select_for_update`. Dos requests POST simultáneos a `inscripcion-nueva/` para el mismo alumno pueden pasar ambos la validación antes de que el primero haga commit. | Un alumno queda con 2 registros de `Inscripcion` activos en el mismo período; `Alumno.estado_inscripcion` y reportes de matrícula quedan inconsistentes; se factura doble cuota de inscripción en casos de red lenta con doble click/reintento. | Agregar `UniqueConstraint(fields=['alumno','periodo_escolar'])` a nivel de modelo como red de seguridad real (la validación de aplicación queda como UX, pero la constraint de BD es la que realmente previene la condición de carrera). |
| 🔴 Alto | `secretaria/serializers.py:277-288` y `models.py:285-296` | El chequeo de cupo disponible (`cupos_disponibles <= 0`) se hace por lectura simple sin `select_for_update()`, a diferencia de `Alumno.reactivar()` que sí usa locking (`models.py:156-183`). Dos inscripciones concurrentes cerca del límite de cupo pueden pasar ambas la validación y sobrevender el cupo. | Un grado/sección queda con más alumnos matriculados que `cupos_maximos`, rompiendo el supuesto que usa `PasoConfiguracion.jsx` (barra de progreso de cupos) y bloqueando reportes de matrícula por grado. | Envolver la lectura+validación de `ConfiguracionGrado` con `select_for_update()` dentro de la misma transacción atómica del `create()` del serializer. |
| 🟠 Medio | `secretaria/urls.py` (`inscripcion-existente/`) + `octopus-frontend/src/api/inscripciones.service.js:15-16` | `InscripcionExistenteView` (`secretaria/views.py:750-772`) existe en el backend y está registrada en `urls.py`, pero el frontend **nunca la invoca**: `useInscripcion.js:75` llama siempre a `crearInscripcion()`, que apunta únicamente a `secretaria/inscripcion-nueva/` — tanto para alumnos nuevos como para alumnos ya existentes seleccionados en `PasoAlumno.jsx`. Es lógicamente inofensivo porque ambas vistas delegan en el mismo `InscripcionSerializer`, pero es un endpoint completo sin ningún caller real. | Código muerto que confunde a futuros mantenedores (parece que hay dos flujos distintos cuando en realidad solo uno está vivo); superficie de API innecesaria. | Decidir: si de verdad no hace falta distinguir "nuevo" vs "existente" en el backend (el serializer ya usa `update_or_create` por cédula), eliminar `InscripcionExistenteView` y su ruta; si se pensaba usar para lógica distinta, conectarla desde el frontend cuando `datos.esAlumnoNuevo === false`. |
| 🟠 Medio | `secretaria/models.py:302-305` (`Inscripcion.save`) | Al crear/actualizar una inscripción, se fuerza `alumno.estatus_financiero = 'solvente'` incondicionalmente. Pero la fuente de verdad real del estatus financiero es `cobranza/mora.py` (`annotate_en_mora`, `sincronizar_estatus_alumno`), que lo calcula en vivo a partir de mensualidades/cuotas impagas. El campo persistido en `Alumno.estatus_financiero` queda "congelado" en 'solvente' hasta la próxima sincronización manual. | Un alumno puede figurar como "solvente" en el modelo (usado en exports Excel, badges de UI que lean el campo persistido en vez de la anotación en vivo) mientras `mora.py` ya lo considera en mora al mes siguiente, hasta que algo dispare `sincronizar_estatus_alumno`. Doble fuente de verdad = riesgo de mostrar datos desactualizados según qué vista/endpoint se consulte. | Documentar claramente cuál es la fuente canónica (`mora.py`) y evitar escribir `estatus_financiero='solvente'` en `Inscripcion.save()`; si se necesita el campo persistido por rendimiento, sincronizarlo explícitamente llamando a `sincronizar_estatus_alumno(alumno)` en vez de hardcodear el valor. |
| 🟠 Medio | `secretaria/views.py` (`AlumnoListView.get_queryset`) + `octopus-frontend/src/components/alumnos/TablaAlumnos.jsx` | Ni el endpoint `secretaria/alumnos/` ni `TablaAlumnos.jsx` implementan paginación (confirmado: `REST_FRAMEWORK` en `config/settings.py:158-174` no define `DEFAULT_PAGINATION_CLASS`). Toda la matrícula del colegio se trae y renderiza en una sola respuesta/tabla. | Con colegios grandes (varios cientos/miles de alumnos) esto degrada el tiempo de respuesta del endpoint y el render de la tabla; también afecta `ExportarAlumnosExcelView` que reutiliza el mismo patrón de queryset completo (aceptable ahí porque es un export, no una vista interactiva). | Agregar `PageNumberPagination` al `AlumnoListView` y paginación/virtualización en `TablaAlumnos.jsx` cuando el volumen de alumnos lo justifique; no urgente para colegios pequeños/medianos actuales. |
| 🟡 Bajo | `secretaria/models.py:140-183` | `Alumno.retirar()` decrementa `ConfiguracionGrado.cupos_utilizados` con `F()` (atómico) pero sin `select_for_update`, mientras que `reactivar()` sí usa `select_for_update()`. Asimetría de patrón de concurrencia entre dos operaciones simétricas del mismo modelo. | Bajo riesgo práctico (retirar es una operación menos frecuente y concurrente que inscribir), pero es una inconsistencia de patrón que puede confundir al próximo desarrollador que copie el patrón equivocado. | Unificar ambos métodos usando el mismo patrón de locking, aunque sea por consistencia de código más que por riesgo real. |
| 🟢 Info | General | Fortalezas confirmadas: el flujo completo de inscripción (`InscripcionSerializer.create`, `serializers.py:290-414`) SÍ está envuelto en `transaction.atomic()` de punta a punta — representante, alumno, inscripción y `CuotaInscripcion` se crean o revierten todos juntos; no se detectaron registros huérfanos posibles por fallos a mitad de camino en este flujo. Las validaciones de negocio (cuotas impagas, mensualidades vencidas, duplicados, cupos) están centralizadas en el serializer y se replican como defensa adicional en `Inscripcion.clean()`. | — | — |

## Top 5 riesgos priorizados

1. **Condición de carrera en doble inscripción** (sin constraint de BD) — el más crítico porque puede corromper datos de facturación (doble cuota de inscripción) sin que el usuario lo note; solo se manifiesta bajo concurrencia real (doble-click, reintentos de red), difícil de reproducir en QA manual.
2. **Sobreventa de cupos por condición de carrera** — mismo patrón de causa raíz que el #1 (falta de locking), pero con impacto visible para el colegio (matrícula por encima del límite físico del aula).
3. **`InscripcionExistenteView` sin uso** — bajo riesgo técnico inmediato, pero genera confusión de mantenimiento y es fácil de "arreglar" (eliminar o conectar) con bajo costo.
4. **Estatus financiero de doble fuente de verdad** — riesgo de mostrar "solvente" en una pantalla y "en mora" en otra para el mismo alumno el mismo día, dependiendo de si la vista lee el campo persistido o la anotación en vivo.
5. **Falta de paginación en alumnos** — hoy bajo impacto (volumen pequeño de alumnos por colegio), pero es el tipo de deuda técnica que se vuelve un incidente de producción sin aviso previo cuando un colegio grande se sube a la plataforma.

### Resolución (2026-07-07, pasada de fixes)

1. 🔴 Alto — Doble inscripción sin constraint de BD — ✅ RESUELTO
   - `UniqueConstraint(fields=['alumno','periodo_escolar'], name='unica_inscripcion_por_periodo')` agregada a `Inscripcion.Meta` + migración `0010_inscripcion_unica_inscripcion_por_periodo` aplicada.
   - Verificado antes de migrar: no existían duplicados (alumno, periodo_escolar) en la BD actual.
   - `InscripcionSerializer.create` ahora captura el `IntegrityError` de esa constraint específica y devuelve "ya está inscrito/a para el período" en vez del mensaje genérico de conflicto.

2. 🔴 Alto — Sobreventa de cupos sin `select_for_update` — ✅ RESUELTO
   - Dentro del mismo `transaction.atomic()` de `InscripcionSerializer.create`, se relee `ConfiguracionGrado` con `select_for_update()` justo antes de crear la `Inscripcion` (mismo patrón que `Alumno.reactivar()`). La validación de `validate()` queda solo como UX preventiva.
   - Tests agregados en `secretaria/tests.py` (`InscripcionLockingCuposTest`): uno confirma que `select_for_update()` se invoca sobre `ConfiguracionGrado`, otro simula la condición de carrera (dos serializers que pasan la validación temprana con el cupo aún libre, pero solo el primero en llegar al `create()` bajo lock logra inscribirse).

3. 🟠 Medio — `InscripcionExistenteView` sin uso — ✅ RESUELTO
   - Confirmado por grep que ningún componente del frontend ni test la invocaba. Se eliminó la vista (`views.py`) y su ruta (`urls.py`).

4. 🟠 Medio — Estatus financiero de doble fuente de verdad — ✅ RESUELTO
   - `Inscripcion.save()` ya no fuerza `alumno.estatus_financiero = 'solvente'`; ahora llama a `cobranza.mora.sincronizar_estatus_alumno(alumno)`, el mismo criterio canónico usado tras registrar pagos.
   - Verificado (grep) que las pantallas/exports que muestran el estatus ya priorizan la anotación en vivo (`estatus_financiero_actual` / `en_mora`) sobre el campo persistido; no se detectaron consumidores rotos por este cambio.

5. 🟡 Bajo — Asimetría de locking en `retirar()` vs `reactivar()` — ✅ RESUELTO
   - `Alumno.retirar()` ahora usa `@transaction.atomic` + `select_for_update()` sobre `ConfiguracionGrado`, igual que `reactivar()`.

6. 🟠 Medio — Falta de paginación en alumnos — ⏳ PENDIENTE (fuera de alcance de esta pasada, a propósito).

Verificación: `python manage.py test secretaria cobranza` → 31 tests, todos OK. No se tocó código de frontend en esta pasada, así que no se corrió `eslint`/`vite build`.

---

## Auditoría Inscripciones y Alumnos (fecha 2026-07-07)

Auditoría de solo lectura, complementaria a la sección anterior (misma fecha), con
trazado end-to-end línea por línea del wizard de inscripción, comparación completa
de rutas frontend vs endpoints backend, y verificación de manejo de errores/fechas.
No se modificó ningún archivo de código; esta es la única escritura realizada.

### Flujo end-to-end (resumen trazado)

`PasoRepresentante.jsx` → `GET secretaria/representante/<cedula>/` (`inscripciones.service.js:3-4` → `secretaria/urls.py:29` → `buscar_representante_por_cedula`, `views.py:708-724`, solo lectura)
→ `PasoAlumno.jsx` → `GET secretaria/alumnos/?buscar=<cedula>` (`inscripciones.service.js:6-7` → router `alumnos`, `urls.py:15` → `AlumnoListView.get_queryset`, `views.py:318-374`, solo lectura)
→ `PasoConfiguracion.jsx` → `GET secretaria/configuracion-grados/` + `GET secretaria/configuracion/` en paralelo (`inscripciones.service.js:9-13`, solo lectura)
→ `PasoConfirmacion.jsx` → `handleConfirmar` en `hooks/useInscripcion.js:72-85` → `POST secretaria/inscripcion-nueva/` (`inscripciones.service.js:15-16` → `urls.py:24` → `InscripcionNuevaView.post`, `views.py:561-591`, delega en `InscripcionSerializer.create()`)
→ `PantallaExito.jsx` → `GET secretaria/inscripciones/<id>/comprobante/` (`inscripciones.service.js:18-19` → `urls.py:26` → `ComprobanteInscripcionView.get`, `views.py:597-615`).

**Punto único de escritura real**: `InscripcionSerializer.create()`, `secretaria/serializers.py:290-414`, envuelto en `transaction.atomic()` desde la línea **297** hasta el `return inscripcion` en la línea **405** (rollback controlado en `except` líneas 407-414). Dentro de ese bloque, en orden: `Representante.objects.get_or_create()` (308-311) → `Alumno.objects.update_or_create()` (318-321) → validaciones de negocio (330-385) → `Inscripcion.objects.create()` (389-393, dispara `full_clean()` + actualización de `cupos_utilizados` vía `F()` en `models.py:274-313`) → `CuotaInscripcion.objects.get_or_create()` (396-403, deuda inicial en cobranza). No se detectaron rutas de código que dejen representante/alumno huérfanos por fallo a mitad del flujo, gracias a este atomic.

No se encontraron componentes del wizard sin ruta registrada (`App.jsx:106-130`, todas lazy-loaded), ni endpoints backend sin registrar en `secretaria/urls.py`, ni mismatches de método+ruta entre `inscripciones.service.js`/`secretaria.service.js` y los endpoints DRF correspondientes.

### Tabla de hallazgos (evidencia adicional a la tabla previa)

| Severidad | Archivo:línea | Descripción | Impacto | Solución propuesta |
|---|---|---|---|---|
| Alto | `secretaria/serializers.py:297-405` (atomic) vs `useInscripcion.js:76` (`if (res.status === 201)`) | La transacción de BD es correcta, pero no hay protección de idempotencia del lado del cliente ante un commit exitoso seguido de corte de red antes de que el frontend reciba la respuesta 201. El reintento manual del usuario no duplica `Inscripcion` (la validación de "ya inscrito" lo evita) pero sí puede crear un segundo `Alumno` si el reintento genera una `cedula_escolar` distinta, ya que `update_or_create` matchea por `cedula_escolar`, no por nombre+representante. | Registros de alumno duplicados con datos casi idénticos ante reintentos por fallo de red post-commit; ensucia reportes y búsquedas de alumnos. | Agregar una clave de idempotencia (ej. UUID generado en el frontend al iniciar el wizard, enviado en el payload y verificado/cacheado en el backend) para que reintentos del mismo intento de inscripción sean no-op. |
| Medio | `secretaria/models.py:113-115` (`Alumno.representante`, `on_delete=CASCADE`) vs `views.py:1087-1095` (`RepresentanteViewSet.destroy`, guardia de aplicación) | La única protección contra borrar un representante con alumnos activos vive en el ViewSet, no en el modelo. Cualquier borrado que no pase por ese endpoint (admin de Django, shell, futuro endpoint) dispara el `CASCADE` real y borra alumnos en cascada sin aviso. | Pérdida de datos de alumnos si se usa el admin de Django o un script de mantenimiento para borrar un representante. | Cambiar `on_delete` a `PROTECT` (o `SET_NULL` si el negocio permite alumnos sin representante) y mover la lógica de "solo permitir borrar si no tiene alumnos activos" a una validación explícita antes del delete, no depender únicamente del guardia del ViewSet. |
| Medio | `cobranza/models.py:275` (`Mensualidad.alumno`, `CASCADE`) y `:294,315` (`CuotaInscripcion`/`CuotaSolvencia.alumno`, `CASCADE`) vs `cobranza/models.py:99` (`Pago.alumno`, `PROTECT`) | Inconsistencia de `on_delete` entre modelos financieros del mismo alumno: la deuda (mensualidades, cuotas) se borra en cascada, pero la evidencia de pago está protegida. Un hard-delete de `Alumno` (si algún día se habilita) dejaría pagos "flotando" sin la deuda que los originó. | Reportes históricos de cobranza inconsistentes si alguna vez se ejecuta un delete real de alumno (hoy mitigado porque el sistema usa soft-delete vía `retirar()`, pero el riesgo del modelo queda latente). | Unificar el criterio: si `Pago` usa `PROTECT` para preservar historial financiero, `Mensualidad`/`CuotaInscripcion`/`CuotaSolvencia` deberían usar el mismo criterio por consistencia, o documentar explícitamente por qué difieren. |
| Bajo | `hooks/useAlumnos.js` (patrón general) y `secretaria.service.js` | No se detectaron llamadas Axios sin manejo de error en el flujo de inscripción — los 5 servicios de `inscripciones.service.js` carecen de `.catch()` propio por diseño (delegan al componente), y los 4 componentes consumidores (`PasoRepresentante`, `PasoAlumno`, `PasoConfiguracion`, `useInscripcion.js`) sí envuelven correctamente en try/catch + `toast.error`. Se documenta como verificación positiva, no como hallazgo de riesgo. | — | Mantener el patrón actual como estándar para nuevos pasos del wizard. |
| Info | `PasoConfirmacion.jsx:6-10`, `ModalAjustarMensualidades.jsx:8-14` | Formateo de fechas visible al usuario usa correctamente `date-fns` (`format`, `parseISO`, locale `es`) en todo el módulo de inscripción/alumnos auditado. Único uso de `.toISOString().split('T')[0]` encontrado (`useAlumnos.js:184`) es para nombrar un archivo de exportación Excel, no una fecha mostrada al usuario — no viola la regla del proyecto. | — | — |
| Info | Nombres de campo | Todos los serializers relevantes (`AlumnoInscripcionSerializer`, `InscripcionSerializer`, `RepresentanteSerializer`) usan snake_case de punta a punta, y el frontend consume los mismos nombres sin mapeo a camelCase (`buildPayload` en `useInscripcion.js:39-64`). No se encontraron mismatches de nombre de campo entre backend y frontend en este flujo. | — | — |

### Riesgos priorizados (complementario al Top 5 previo)

1. Falta de idempotencia ante reintento tras fallo de red post-commit — puede generar alumnos duplicados silenciosamente; se suma a los riesgos de condición de carrera ya documentados arriba (constraint de BD faltante en `Inscripcion`, falta de `select_for_update` en cupos).
2. `on_delete=CASCADE` en `Alumno.representante` con protección solo a nivel de aplicación — riesgo de pérdida de datos si el borrado no pasa por el ViewSet.
3. Inconsistencia de `on_delete` entre `Pago` (`PROTECT`) y el resto de modelos financieros del alumno (`CASCADE`) — riesgo latente, bajo impacto actual por el uso de soft-delete.

---

# NUEVA PLANILLA DE INSCRIPCIÓN — CAPTURA + PDF (2026-07-09)

Deuda técnica detectada al agregar los campos de la planilla física (nacimiento,
salud/procedencia, foto, datos del representante, `nro_solvencia`) y el bloque
"Datos Administrativos" al PDF (`cobranza/utils.py::generar_pdf_inscripcion`,
`cobranza/services.py::calcular_datos_administrativos_inscripcion`). Solo se
anota, no se corrige en esta fase:

1. **`buildPayload` (`useInscripcion.js`) es un whitelist manual que ya se
   desincronizaba del modelo real** — antes de esta fase descartaba en
   silencio `direccion`/`contacto_emergencia_*` del alumno aunque el modelo y
   el serializer ya los soportaban. Con esta fase el whitelist creció a ~20
   campos explícitos; el riesgo de que un campo nuevo del modelo quede fuera
   del payload sin que nadie lo note sigue igual de latente. Un serializer
   compartido/generado a partir del modelo (o al menos un test que compare
   claves de `buildPayload` contra `AlumnoInscripcionSerializer.Meta.fields`)
   evitaría que se repita.

2. **La foto del alumno se sube en una segunda llamada HTTP separada de la
   creación de la inscripción** (`subirFotoAlumno` en
   `inscripciones.service.js`, disparada después del `POST
   secretaria/inscripcion-nueva/` en `useInscripcion.js::handleConfirmar`).
   Motivo: `InscripcionSerializer` escribe `alumno.representante` de forma
   anidada, y DRF no puede parsear objetos anidados desde un body
   `multipart/form-data` (solo desde JSON), así que no se pudo mandar todo en
   un solo request. Si la creación de la inscripción tiene éxito pero la
   subida de la foto falla (red, timeout), la inscripción queda completa pero
   sin foto — el usuario recibe un toast de aviso pero no hay reintento
   automático ni cola de reintento. Es el primer formulario del proyecto que
   combina creación anidada + upload de archivo; documentar este patrón (o
   resolverlo con un endpoint dedicado que acepte multipart con campos planos
   `alumno.representante.nombre`) sirve de referencia para futuros formularios
   similares.

3. **No existe endpoint HTTP dedicado para "Datos Administrativos" fuera del
   PDF** — `calcular_datos_administrativos_inscripcion` se expone como
   `SerializerMethodField` de solo lectura en `InscripcionSerializer`
   (`datos_administrativos`), pensado para una futura vista en pantalla (por
   ejemplo en el portal de representantes), pero hoy solo lo consume
   `generar_pdf_inscripcion`. Si se necesita mostrarlo en el frontend antes de
   imprimir, ya está listo el cálculo; falta enchufarlo en algún componente.

4. **Los modales `ModalRegistrarAlumno`/`ModalEditarAlumno` no incluyen
   uploader de foto** — se agregaron todos los campos de texto nuevos
   (nacimiento, salud, contacto de emergencia, datos del representante) pero
   se dejó la foto fuera de estos dos modales a propósito: ambos envían el
   payload como JSON (`handleRegister` hace `POST` JSON, `handleSaveEdit` hace
   `PATCH` JSON vía `update_info`), y meterle `multipart` a esos dos flujos
   para un caso de uso secundario (alta/edición de alumno fuera del wizard de
   inscripción) no se justificaba en esta fase. La foto solo se puede cargar
   hoy desde el wizard de inscripción (`PasoAlumno.jsx`).

5. **`ImageField` es el primer uso de Pillow como dependencia real en el
   proyecto** (ya estaba en `requirements.txt` pero sin ningún campo que lo
   ejercitara). No hay validación de dimensiones/aspect ratio en el modelo —
   cualquier imagen JPG/PNG/WEBP válida se acepta sin importar su tamaño en
   píxeles, solo se valida tipo MIME y peso (5 MB) del lado del cliente en
   `PasoAlumno.jsx`. Si el colegio necesita fotos tipo carnet con proporción
   fija, faltaría agregar esa validación (client-side y/o server-side).

---

# VALIDACIÓN DE DATOS FALTANTES EN REINSCRIPCIÓN (2026-07-10)

Se detectó que, al seleccionar un alumno o representante **ya existente** en
el wizard de inscripción, `PasoAlumno.jsx`/`PasoRepresentante.jsx` avanzaban
sin validar que sus datos estuvieran completos (`handleContinuar` solo
corría las validaciones de campos requeridos para el caso "nuevo"). Se
implementó:

- `utils/inscripcionValidacion.js`: define los campos "críticos" de alumno
  (fecha de nacimiento, género, dirección, contacto de emergencia completo)
  y representante (nombre, apellido, teléfono, correo, dirección).
- `ModalCompletarAlumno.jsx` / `ModalCompletarRepresentante.jsx`: modal que
  se abre automáticamente al seleccionar un registro existente con campos
  críticos vacíos, y también al presionar "Continuar" como resguardo. No se
  puede avanzar en el wizard hasta guardar el modal con los campos
  obligatorios completos.
- **Backend**: `InscripcionSerializer.create()` (`secretaria/serializers.py`)
  usaba `Representante.objects.get_or_create()` — si el representante ya
  existía, cualquier dato editado en el formulario (incluyendo lo recién
  completado en el modal nuevo) se descartaba en silencio porque
  `get_or_create` no toca una fila existente. Se cambió a `update_or_create`,
  igual que ya se hacía con `Alumno`, para que los datos completados se
  persistan de verdad al confirmar la inscripción.

---

# BUG — INSCRIPCIONES PERMITIDAS CON PERÍODO CERRADO (2026-07-10)

Reportado por el usuario: el wizard de inscripción dejaba registrar alumnos
aunque el período configurado (`ConfiguracionSistema.fecha_inicio/fin_inscripciones`)
ya estuviera cerrado. Verificado: `inscripciones_abiertas` (property del
modelo) solo se leía como badge visual en `Configuracion.jsx` — ni
`InscripcionSerializer.validate()`/`create()` en el backend ni el wizard
(`PasoConfiguracion.jsx`) lo comprobaban antes de crear la `Inscripcion`.

**Corregido:**
- `secretaria/serializers.py::InscripcionSerializer.validate()` ahora rechaza
  la inscripción con `non_field_errors` si `ConfiguracionSistema.inscripciones_abiertas`
  es `False` (mismo patrón que el chequeo de cupos existente en el mismo método).
  Si no hay `ConfiguracionSistema` configurada, no bloquea (mismo criterio que
  el resto del código ante configuración ausente).
- `PasoConfiguracion.jsx` muestra un banner de aviso con las fechas vigentes
  y deshabilita el botón "Revisar Inscripción" cuando `config.inscripciones_abiertas === false`.
- Tests agregados en `secretaria/tests.py` (`InscripcionPeriodoCerradoTest`):
  confirma rechazo con período cerrado y aceptación con período abierto.

**Riesgo relacionado NO corregido (queda anotado, no se tocó):**
`Alumno.objects.update_or_create()` en el mismo método matchea por
`cedula_escolar`. Si el alumno existente seleccionado tiene
`cedula_escolar` vacío (campo opcional, común en alumnos que aún no tienen
cédula escolar asignada), el `create()` le genera una **nueva** cédula
temporal en cada submit (`generate_temporary_cedula_escolar`) antes de hacer
el `update_or_create` — como esa cédula generada no existe todavía, el
`update_or_create` no encuentra coincidencia y **crea un alumno duplicado**
en vez de actualizar el seleccionado. Esto es independiente de esta fase
(ya ocurría antes) pero el nuevo flujo de "completar datos" hace más
probable que un usuario reinscriba alumnos justamente en ese estado
(sin cédula escolar todavía). Solución propuesta: que el frontend envíe el
`id` del alumno seleccionado y que `create()` intente resolver por `id`
antes que por `cedula_escolar` cuando el primero venga presente.

---

# CONTACTO DE EMERGENCIA = DATOS DEL REPRESENTANTE (2026-07-10)

Reportado por el usuario: en el paso de datos del alumno del wizard, la
sección "Contacto de emergencia" pedía retipear nombre/teléfono/parentesco
aunque en la gran mayoría de los casos el contacto de emergencia **es** el
propio representante ya capturado en el paso anterior — duplicación de
tipeo y fuente de errores (datos desincronizados entre representante y
"contacto de emergencia" del mismo alumno).

**Implementado:**
- `utils/inscripcionValidacion.js`: `contactoEmergenciaDesdeRepresentante()`
  deriva `{contacto_emergencia_nombre, contacto_emergencia_telefono,
  contacto_emergencia_parentesco}` a partir del representante. Se
  centralizó también `PARENTESCO_OPTIONS`/`labelParentesco()` (antes
  duplicado como JSX plano en `PasoRepresentante.jsx` y
  `ModalCompletarRepresentante.jsx`).
- `PasoAlumno.jsx` (alumno nuevo): checkbox "Usar los datos del
  representante como contacto de emergencia", marcado por defecto si el
  representante ya tiene nombre+teléfono. Al marcarlo, los 3 campos se
  autocompletan y se deshabilitan; al desmarcarlo quedan editables para
  cargar un contacto distinto.
- `ModalCompletarAlumno.jsx` (alumno existente con datos pendientes): mismo
  checkbox, pero solo se ofrece marcado por defecto si el alumno **no**
  trae ya un contacto de emergencia propio cargado — para no pisar en
  silencio un dato manual distinto que alguien ya haya guardado.

**Bug preexistente relacionado, corregido en la misma pasada:**
La validación inline de `PasoAlumno.jsx::handleContinuar` para alumno
**nuevo** nunca exigió `direccion`/`contacto_emergencia_*` como requerido
(solo nombre/apellido/fecha_nacimiento/género), a diferencia de
`CAMPOS_CRITICOS_ALUMNO` (`inscripcionValidacion.js`) y de
`ModalCompletarAlumno` (que sí lo exige para alumnos ya existentes). Antes
del checkbox esto ya permitía crear un alumno nuevo sin contacto de
emergencia; con el checkbox habría sido aún más fácil pasarlo por alto si
el representante no tiene teléfono (arranca desmarcado) o el usuario lo
desmarca y deja el campo vacío. Se agregaron los 4 campos al bloque `errs`
de `handleContinuar`, con el mismo estilo de borde/mensaje de error que ya
usan `nombre`/`apellido`/etc. en ese mismo formulario.

---

# ELIMINAR REPRESENTANTE — SOFT DELETE EN CASCADA (2026-07-11)

Reportado por el usuario: preguntó si se podía editar/eliminar un representante
ya registrado. Editar ya existía (dos vías: módulo `Representantes` y desde la
ficha del alumno vía `ModalEditarAlumno`). Eliminar existía pero solo
**bloqueaba** el borrado si el representante tenía alumnos activos
(`RepresentanteViewSet.destroy`, `views.py`), sin ofrecer una vía para
eliminarlo junto con sus alumnos. El usuario pidió que sí se pudiera, y eligió
explícitamente la opción de **soft-delete** (retirar al alumno, conservando su
historial) en vez de borrado físico.

**Bug detectado de paso** (relacionado con el hallazgo "Medio" de la auditoría
2026-07-07, línea 228 de este archivo): el guardia de `destroy()` solo
comprobaba `rep.alumnos.filter(activo=True).exists()`. Si el representante
tenía **únicamente alumnos ya retirados** (`activo=False`), el chequeo pasaba
y se ejecutaba `rep.delete()` — como `Alumno.representante` tiene
`on_delete=CASCADE` y no es nullable, eso borraba físicamente esos alumnos
retirados y su historial (mensualidades, cuotas; los pagos vía `PROTECT`
habrían bloqueado el delete solo si tenían pagos asociados; sin pagos, se
perdían sin aviso).

**Implementado:**
- `Representante` ganó soft-delete propio: campos `activo` (default `True`) y
  `fecha_eliminacion` (`secretaria/models.py`, migración
  `0013_representante_activo_representante_fecha_eliminacion`). Esto evita
  depender de `on_delete=CASCADE` para "borrar" — ya no se llama nunca
  `rep.delete()` real desde el endpoint.
- `RepresentanteViewSet.destroy()` ahora, dentro de `transaction.atomic()`:
  retira (`Alumno.retirar()`, soft-delete existente) todos los alumnos activos
  vinculados, y marca el representante como `activo=False` en vez de
  bloquear o borrar físicamente. Se conserva el historial completo de ambos.
- `RepresentanteViewSet.get_queryset()` y `ExportarRepresentantesExcelView`
  filtran `activo=True` para que los representantes eliminados no aparezcan en
  el listado ni en el export Excel.
- Los tres puntos donde se resuelve un representante por cédula
  (`get_or_create`/`update_or_create` en `serializers.py`: creación de alumno,
  `AlumnoUpdateSerializer.update`, `InscripcionSerializer.create`) ahora
  **reactivan** automáticamente al representante si estaba inactivo — cubre el
  caso de que alguien vuelva a inscribir un alumno con la cédula de un
  representante previamente eliminado (la cédula sigue siendo `unique`, así
  que sin esto el alta habría fallado con `IntegrityError` o habría dejado el
  representante reutilizado pero invisible en el listado).
- Frontend: mensaje del modal de confirmación en `Representantes.jsx`
  actualizado para explicar que los alumnos activos vinculados también se
  retirarán automáticamente.

**No implementado / fuera de alcance de esta pasada:**
- No se agregó una vista/filtro en el módulo `Representantes` para ver los
  representantes eliminados ni para "deshacer" la eliminación manualmente
  (sí queda reversible de forma indirecta: basta con reinscribir con la misma
  cédula y se reactiva). Si el negocio necesita un botón explícito de
  "restaurar", falta construirlo.
- El comando de management `borrar_alumnos_representantes.py` sigue haciendo
  `Representante.objects.all().delete()` (hard delete real) — es una
  herramienta de mantenimiento/dev, no parte del flujo de usuario, no se tocó.

---

# IMPORTACIÓN MASIVA DE ESTUDIANTES DESDE EXCEL (2026-07-15)

Se agregó `ImportarEstudiantesView` (`secretaria/views.py`,
`secretaria/import_estudiantes.py`) para cargar la matrícula histórica del
colegio desde un `.xlsx`, con botón en Sistemas › Usuarios › Consola de
mantenimiento. Solo crea Representante + Alumno (Banco de Alumnos, sin
`Inscripcion` ni cuotas — decisión explícita del usuario, es carga
histórica, no una inscripción nueva).

**Deuda técnica anotada, no corregida (son problemas del archivo fuente, no
del sistema):**

1. **El archivo Excel real entregado por el colegio trae errores de
   captura**: en la sección "6to Grado" el teléfono del representante quedó
   tipeado en la columna de correo (el parser lo detecta y recupera
   automáticamente solo para esa sección — `SECCIONES_TELEFONO_DESPLAZADO`
   en `import_estudiantes.py`); en las 4 secciones de "Año" (1ro-4to,
   ~156 estudiantes) no hay fecha de nacimiento capturada en absoluto; y
   varias cédulas de representante llegan con el formato de Excel corrupto
   (ej. `36.111535` en vez de `36.111.535` — el punto de miles sobrante se
   interpretó como separador decimal y se perdió un dígito). El parser
   marca estas filas con `warnings` pero **no puede recuperar el dígito
   perdido**; quedan para corrección manual desde Lista de Alumnos después
   de importar.

2. **`grado_seccion` de preescolar usa la convención por edad** (`Sala 3`,
   `Sala 4`, `Sala 5`), no los nombres literales del Excel (`SALA A/B/C`)
   — decisión explícita del usuario para seguir la misma convención que ya
   usan `secretaria/seeds.py` y `PromocionAlumnosView.MAPA_GRADOS`. Si en
   el futuro el colegio nombra sus salas de otra forma, el mapeo
   `MAPA_SECCIONES` en `import_estudiantes.py` es el único lugar a tocar.

3. **`cupos_maximos` se auto-ajusta durante el import** si la cantidad real
   de estudiantes de un grado supera el cupo configurado (con margen de 5)
   — decisión explícita del usuario para no bloquear la carga histórica.
   Esto significa que tras importar, los cupos configurados reflejan la
   matrícula real ya cargada, no un límite pensado deliberadamente por el
   colegio; conviene que alguien revise y ajuste `cupos_maximos` por grado
   después de la primera carga si se quiere usarlos como tope real de
   inscripción a futuro.

4. **No hay endpoint para deshacer una importación** — si se carga el
   archivo equivocado o dos veces, hay que retirar/eliminar los alumnos
   creados manualmente desde Lista de Alumnos. No se implementó por no ser
   parte del alcance pedido; si el import se usa con frecuencia (cargas
   recurrentes de varios colegios) valdría la pena un botón de
   "deshacer último import" basado en el `LogAuditoria` que ya se registra
   (`accion="IMPORTAR_ESTUDIANTES"`).

---

# MÓDULO PRE-INSCRIPCIÓN — MAIL MERGE SOBRE PLANILLA OFICIAL (2026-07-16)

Se agregó el módulo "Pre-Inscripción": rellena automáticamente
`secretaria/templates_docx/planilla_preinscripcion.docx` (copia de la planilla
física del colegio) con los datos de un alumno, sin generar el documento
desde cero. Backend: `secretaria/utils_preinscripcion.py` (relleno con
`python-docx`, localizando celdas por el texto de su etiqueta dentro de las 3
tablas de la plantilla) + `PlanillaPreinscripcionView` (individual) y
`PlanillaPreinscripcionMasivaView` (.zip con todos los alumnos activos).
Decisiones tomadas explícitamente por el usuario (ver conversación de
aprobación del diseño):

1. **No existe cédula de identidad del alumno en el modelo** — solo
   `cedula_escolar` (matrícula interna). Se decidió NO agregar un campo
   nuevo; el campo "CÉDULA" de la sección Estudiante queda siempre en
   blanco en el documento generado. Si el colegio lo pide más adelante,
   agregar `Alumno.cedula_identidad` y sumarlo a `LABEL_MAP_ESTUDIANTE` en
   `utils_preinscripcion.py`.

2. **El modo masivo genera para el 100% de `Alumno.objects.filter(activo=True)`**,
   sin filtrar por `periodo_escolar_activo` — decisión explícita del
   usuario. Puede incluir alumnos de períodos anteriores que no se
   re-inscribieron en el actual. Si se necesita acotar, filtrar en
   `PlanillaPreinscripcionMasivaView.post` (`views.py`) usando el mismo
   patrón que `AlumnoListView.get_queryset` (anotación contra
   `ConfiguracionSistema.periodo_escolar_activo`).

3. **Generación del .zip masivo es síncrona, en memoria, sin cola de
   trabajo** — el proyecto ya tiene Celery instalado (`requirements.txt`,
   usado para notificaciones de cobranza) pero no se conectó aquí.
   **Verificado con datos reales** (prueba en navegador, 2026-07-16, 451
   alumnos activos del colegio): el backend genera el .zip completo
   (28.8 MB) en ~29s — funciona, pero superaba el timeout global de
   `axiosInstance` (15s, `apiClient.js`), lo que provocaba un
   `net::ERR_FAILED`/broken pipe en el navegador y el usuario veía el
   botón fallar aunque el backend sí hubiera terminado. **Corregido**:
   `descargarPreinscripcionMasivaBlob` (`preinscripcion.service.js`) usa
   un timeout propio de 120s en vez del default de `axiosInstance`. Si el
   colegio crece a varios miles de alumnos y se acerca de nuevo a ese
   límite, ahí sí conviene mover `generar_zip_preinscripciones` a una
   tarea Celery que notifique cuando el .zip esté listo (patrón ya usado
   en notificaciones de cobranza), en vez de seguir subiendo el timeout.
   **Nota relacionada, no corregida**: otros endpoints pesados del
   proyecto (`ImportarEstudiantesView`, `ExportarAlumnosExcelView`) usan
   el mismo `axiosInstance` con el timeout global de 15s y podrían tener
   la misma vulnerabilidad con datasets grandes — no se verificó ni se
   tocó en esta pasada, pero es el mismo patrón de riesgo.

4. **`_resolver_valores` reconstruye "Nº de transferencia"/"Monto
   transferencia"/"Monto efectivo"/bancos a partir de
   `calcular_datos_administrativos_inscripcion()`**, que agrupa pagos por
   método pero solo expone `metodo_display` (texto legible), no el código
   crudo (`transferencia`, `efectivo`, etc.). El emparejamiento se hace
   comparando `metodo_display` contra `dict(Pago.METODOS)[...]`
   (`_buscar_metodo`/`_sumar_montos_efectivo` en `utils_preinscripcion.py`).
   Es correcto mientras los textos de `Pago.METODOS` no cambien, pero es
   un acoplamiento implícito por string en vez de por código — si se
   renombra un método de pago en `cobranza/models.py`, hay que revisar
   este archivo también.

5. **Permiso `IsSecretariaOrAbove`** en ambos endpoints nuevos —
   deliberadamente más restrictivo que el endpoint vecino
   `ComprobanteInscripcionView` (que usa `IsAuthenticated`), porque el
   documento de pre-inscripción expone cédulas y datos personales del
   alumno y del representante juntos. Si se agregan más roles al sistema,
   revisar si `IsSecretariaOrAbove` sigue siendo el criterio correcto para
   este endpoint específico.

6. **La plantilla se rellena localizando celdas por el texto exacto de su
   etiqueta** (`_normalizar_etiqueta` + `LABEL_MAP_ESTUDIANTE/REPRESENTANTE/ADMINISTRATIVO`
   en `utils_preinscripcion.py`), no por marcadores `{{ }}` — se descartó
   `docxtpl` a propósito (ver decisión del usuario) porque habría exigido
   editar manualmente `planilla_preinscripcion.docx` en Word para insertar
   placeholders Jinja, con riesgo de que Word partiera el tag en varios
   `<w:r>` y lo corrompiera. **Consecuencia**: si alguien reemplaza
   `templates_docx/planilla_preinscripcion.docx` por una versión nueva del
   colegio con el texto de las etiquetas modificado (aunque sea un cambio
   de mayúsculas/tildes/espacios), el mapeo deja de encontrar esas celdas
   y el campo queda en blanco sin ningún error visible — no hay validación
   que avise si una etiqueta esperada no se encontró en la plantilla.

7. **Rediseño (mismo día, tras primera revisión del usuario): módulo
   independiente + búsqueda por Alumno, no por Inscripcion.** La primera
   versión colgaba el botón individual de `ConsultaInscripcion.jsx`
   (requería una `Inscripcion` existente) y el masivo de `ListaAlumnos.jsx`.
   El usuario pidió explícitamente que fuera un módulo propio y que el
   individual funcionara **sin que el alumno esté inscrito todavía** (es
   una *pre*-inscripción). Cambios:
   - `PlanillaPreinscripcionView` ahora recibe `pk` de **Alumno**, no de
     `Inscripcion` (`secretaria/urls.py`: `alumnos/<int:pk>/preinscripcion/`,
     antes `inscripciones/<int:pk>/preinscripcion/`). Internamente busca la
     inscripción más reciente del alumno si existe (`Inscripcion.objects.filter(alumno=alumno)...first()`),
     igual que ya hacía `generar_zip_preinscripciones` — el masivo nunca
     tuvo esta limitación, solo el individual.
   - Nueva página `pages/Preinscripcion.jsx` con buscador propio (nombre/
     apellido/cédula, vía `secretaria/alumnos/?buscar=`) que muestra el
     `estado_inscripcion` de cada resultado (Inscrito/Sin inscribir/Retirado)
     y un botón "Generar Pre-Inscripción" por fila, más "Generar para
     todos" arriba. Ruta `/preinscripcion`, entrada propia en el sidebar
     (sección Principal), rol `SECRETARIA_ADMIN`.
   - Se revirtieron por completo los cambios en `ConsultaInscripcion.jsx`
     y `ListaAlumnos.jsx` (sin botones de Pre-Inscripción ahí).
   - Verificado en navegador con datos reales del colegio: búsqueda
     "ACOSTA" → alumno con estado "Sin inscribir" → generación individual
     exitosa (63 KB, campos de estudiante/representante correctos, bloque
     administrativo en blanco por no tener inscripción/pagos) → "Generar
     para todos" desde el nuevo módulo, exitoso (mismo .zip de siempre).

8. **Durante la verificación en navegador se observó, una vez, un campo
   ("Cursará") en blanco en un documento real** pese a que el dato
   (`Alumno.grado_seccion`) existía en la BD. Se investigó a fondo: la
   función de relleno (`_resolver_valores`/`_escribir_valor`) se probó
   correcta en más de media docena de escenarios aislados (llamada
   directa, `Client` de pruebas de Django, réplica exacta del queryset de
   la vista) y **siempre** produjo el valor correcto. Solo falló al pasar
   por un proceso `runserver` que, se descubrió después, no era el único
   escuchando en ese puerto — quedaron procesos duplicados de intentos
   previos de este mismo ciclo de pruebas (`Stop-Process`/`TaskStop` no
   siempre mata al hijo real de Django cuando el autoreload está activo).
   Con un proceso único y limpio el problema no volvió a aparecer en
   ninguna repetición. Se documenta por transparencia, no como bug
   pendiente: no hay evidencia de que el código de producción tenga este
   problema, pero si alguna vez se reporta un campo vacío de forma
   intermitente en producción (sirviendo con `gunicorn`/`uwsgi`, no con
   `runserver`), vale la pena descartar primero múltiples workers con
   conexiones a la BD en estados distintos antes de sospechar de
   `utils_preinscripcion.py`.

---

# PLANTILLA — SEGUNDA PÁGINA EN BLANCO (2026-07-17)

Reportado por el usuario: `planilla_preinscripcion.docx` generaba/mostraba
2 páginas, la segunda completamente vacía. Diagnóstico (sin herramienta de
render disponible por defecto en el entorno — Word estaba instalado en la
máquina, así que se usó `pywin32`/COM para abrir el documento con
`Word.Application`, contar páginas reales con `ComputeStatistics` y
exportar a PDF para inspección visual — más confiable que inferir el
layout leyendo el XML a mano):

- Se descartaron primero las causas obvias: no había `<w:br w:type="page"/>`
  explícito, un solo `sectPr`, sin `pageBreakBefore`, y los 3 objetos
  flotantes (logos + cuadro de texto del encabezado) están anclados cerca
  del borde superior de la página, no fuera de ella. El texto del
  encabezado institucional aparece "duplicado" en el XML, pero es el
  patrón normal `mc:AlternateContent` (versión moderna `wps:txbx` +
  versión de respaldo VML `w:pict` para compatibilidad) — **no** es una
  duplicación real, solo se renderiza una de las dos.
- Causa real, confirmada con Word vía COM (`doc.GoTo` a la página 2 +
  `Information(wdActiveEndPageNumber)` sobre el final de la última
  tabla): el documento entero cabía en la página 1 con margen de sobra,
  pero el **último párrafo del cuerpo** (el que OOXML exige después de la
  tercera tabla, antes de `sectPr`) era el único de todo el documento sin
  formato explícito — heredaba el estilo `Normal` por defecto (11pt,
  interlineado 1.15, 10pt de espacio posterior) mientras el resto de la
  plantilla usa 10pt sin espaciado extra. Ese sobrante, sumado al margen
  inferior original (0.5"), era justo lo suficiente para empujar la marca
  de párrafo final (invisible) a una página 2 nueva y totalmente en
  blanco.
- **Corregido en `templates_docx/planilla_preinscripcion.docx`**: se
  igualó el formato del último párrafo al del resto del documento (10pt,
  vía `w:pPr/w:rPr/w:sz`) y se redujo el margen inferior de la página de
  720 a 500 twips (0.5" → ~0.35", imperceptible e igual dentro del área
  imprimible de cualquier impresora estándar). Con la plantilla vacía
  esto ya alcanzaba para 1 sola página.
- **Segunda causa, encontrada al probar con datos reales**: con la
  plantilla corregida pero rellenada por `generar_planilla_preinscripcion`,
  volvía a aparecer la página 2 en blanco. Motivo: `_escribir_valor()`
  (`utils_preinscripcion.py`) usaba `Pt(9)` para el texto insertado,
  mientras las etiquetas de la plantilla usan 8pt (`w:sz w:val="16"`). En
  las ~14 celdas donde el valor se agrega en el mismo renglón que su
  etiqueta (patrón "append inline", ver punto 6 más arriba), un run de
  9pt conviviendo con uno de 8pt en la misma línea sube la altura de esa
  línea a la del run más alto — repetido en 14 líneas, alcanza para
  desbordar el margen ya ajustado. **Corregido**: el valor insertado ahora
  usa `Pt(8)`, igual que la etiqueta.
- **Verificado**: 1 página con la plantilla vacía, 1 página con datos
  reales típicos, y 1 página en una prueba de estrés con nombres/
  direcciones/institución deliberadamente largos (para simular el peor
  caso de un representante o alumno con datos extensos). Si en el futuro
  se habilitan más campos opcionales muy largos (ej. `alergico` con texto
  extenso) y vuelve a aparecer una página 2, el mismo método de
  diagnóstico (Word vía COM, `ComputeStatistics` + `GoTo`) es el más
  confiable — evita perder tiempo adivinando por XML como se hizo aquí al
  principio.

---

# PLANILLA DE PRE-INSCRIPCIÓN — CAPITALIZACIÓN, ALINEACIÓN Y DOCUMENTO ÚNICO (2026-07-17)

## Capitalización y alineación (`utils_preinscripcion.py`)

- **`_capitalizar_nombre_propio()`** normaliza apellido/nombre/dirección/
  institución de procedencia (estudiante y representante) a Title Case,
  respetando conectores (`de`, `del`, `la`, `las`, `los`, `y`, `e`) que
  quedan en minúscula salvo al abrir el texto. No maneja nombres compuestos
  con guion (`maría-josé` queda `María-josé`, no `María-José`) — no se
  encontraron casos así en los datos del colegio, pero si aparecen habría
  que capitalizar también tras el guion.
- **Alineación**: se reemplazó el separador fijo de 2 espacios por un tab
  stop calculado al 45% del ancho de la celda (`cell.width`), con fallback
  al separador de 2 espacios si `cell.width` es `None` (celdas sin ancho
  explícito en la plantilla, caso raro de `gridSpan`). Con fuente
  proporcional esto alinea mejor que espacios literales porque no depende
  del largo en caracteres de la etiqueta, pero **no se verificó
  visualmente abriendo el .docx en Word/LibreOffice** en este entorno (sin
  acceso a un visor de documentos) — se verificó por código que el
  `w:tab` y el `w:tabs/w:tab` quedan bien formados en el XML resultante,
  pero falta la confirmación visual pedida en los criterios de aceptación,
  especialmente con nombres/direcciones largos que podrían necesitar
  ajustar el 45% si el valor colisiona con el borde de la celda.
- Se probó con datos reales sintéticos (vía Django ORM, alumno con
  apellido/nombre en minúsculas y mayúsculas mezcladas) que el texto se
  capitaliza correctamente y que el documento generado sigue teniendo la
  misma cantidad de tablas/celdas que antes — no se corrió la prueba de
  estrés de "1 sola página" con nombres largos que sí se hizo en la
  auditoría anterior (línea 717 de este archivo); conviene repetirla tras
  este cambio, ya que el tab (`\t{valor}`) es un carácter distinto al
  espacio y en teoría no debería afectar la altura de línea, pero no se
  midió con Word real.

## Documento único combinado (`generar_documento_unico_preinscripciones`)

- Se implementó la combinación **sin agregar `docxcompose`** ni ninguna
  dependencia nueva: `_combinar_documentos()` copia los elementos del
  `<w:body>` de cada `Document` (python-docx) generado dentro del body del
  primero, insertando un salto de página entre cada uno y preservando un
  solo `<w:sectPr>` al final (si se copian los `sectPr` de documentos
  intermedios, Word interpreta cada uno como un salto de **sección**
  nuevo, no de página, y evalúa el layout de forma distinta). Como todos
  los documentos parten de la misma plantilla y es un salto de página
  simple (no de sección), el encabezado con el logo se repite
  automáticamente en cada página sin trabajo adicional.

- **Bug encontrado y corregido durante la verificación**: el orden
  alfabético se calculaba con `sorted(alumnos, key=lambda a: (a.apellido,
  a.nombre))` — comparación case-sensitive por ASCII, donde cualquier
  apellido en mayúsculas (`"BRICEÑO"`) ordena *antes* que cualquiera en
  minúsculas (`"alvarez"`), rompiendo el orden alfabético real esperado
  con datos mixtos (frecuentes en este proyecto, ver
  `_capitalizar_nombre_propio` arriba). Corregido comparando `.lower()`
  en ambos campos.

- **🔴 Bug crítico encontrado en la primera entrega y corregido — el
  `.docx` generado estaba corrupto** (2026-07-17). El usuario adjuntó el
  `.docx` de "documento único" ya generado (451 alumnos,
  `C:\Users\PC\Downloads\preinscripciones.docx`) para revisión. `python-docx`
  lo leía de vuelta sin errores (por eso los tests automáticos con
  `python-docx` de la primera pasada no lo detectaron), pero **Microsoft
  Word se negaba a abrirlo** ("El archivo parece estar corrompido").
  Diagnosticado abriendo el archivo con Word real vía COM (`pywin32`,
  disponible en este entorno) y aislando la causa combinando solo copias
  vacías de la plantilla (sin datos de alumno) hasta reproducir el error
  con el mínimo caso posible:
  - **Causa**: la plantilla trae 3 imágenes embebidas en el cuerpo (el
    logo del colegio), cada una con un `<wp:docPr id="...">` fijo. Como
    los 451 documentos se generan desde la misma plantilla, los 451
    comparten los mismos 3 `docPr id`. Al concatenar sus `<w:body>` en uno
    solo, terminan más de 1300 elementos `docPr` repitiendo solo 3 valores
    de `id` — Word no logra resolver a qué imagen corresponde cada uno y
    marca el archivo como corrupto al abrirlo. `python-docx` no valida
    esto al guardar ni al releer, por lo que el problema pasaba
    inadvertido sin abrir el archivo en Word real.
  - **Corregido**: `_renumerar_docpr()` (nueva función) reasigna un `id`
    único a cada `docPr` de cada documento antes de combinarlos, usando un
    contador (`itertools.count`) compartido entre todos.
  - **Verificado con Word real** (COM): el archivo original de 451
    alumnos, regenerado con el fix, **abre sin errores** y reporta
    exactamente **451 páginas** (antes ni siquiera abría). También se
    probó con 1, 2, 3 y 5 documentos combinados para confirmar el patrón.

- **🟠 Segundo bug encontrado durante el mismo diagnóstico: página en
  blanco entre cada planilla**. Al arreglar la corrupción y volver a medir
  con Word, 3 documentos combinados daban **5 páginas** en vez de 3 (patrón
  exacto: `[planilla][blanco][planilla][blanco][planilla]`). Causa:
  `Document.add_page_break()` crea un `<w:p>` **nuevo** para alojar el
  salto de página. La plantilla está ajustada al límite exacto de 1 página
  por planilla (ver "PLANTILLA — SEGUNDA PÁGINA EN BLANCO", más arriba en
  este archivo: margen inferior y tamaño de fuente recortados a propósito,
  sin margen de sobra) — ese párrafo adicional ya no cabe en la página que
  se acaba de llenar, desborda solo él a la página siguiente, y como es el
  párrafo que contiene el salto, dispara un segundo salto real, empujando
  la siguiente planilla una página más allá y dejando una página casi
  vacía en el medio. **Corregido**: `_insertar_salto_pagina_en_ultimo_parrafo()`
  agrega el `<w:br w:type="page"/>` como un run **dentro del último
  párrafo ya existente** de la planilla anterior (que ya cabía en su
  página) en vez de crear un párrafo nuevo. Verificado con Word real: 1,
  2, 3 y 5 documentos combinados dan exactamente esa cantidad de páginas,
  sin blancos intermedias.

- **Verificado end-to-end con los 451 alumnos reales del colegio**
  (2026-07-17, mismo dataset de la auditoría del .zip del 2026-07-16):
  `generar_documento_unico_preinscripciones` tarda **18s** y produce un
  `.docx` de **3.9 MB** — bien por debajo del timeout de 120s de
  `descargarPreinscripcionMasivaBlob`; el riesgo de timeout que se había
  dejado como pendiente en la primera pasada queda descartado para el
  tamaño actual del colegio. Abierto con Word real: sin errores, 451
  páginas exactas (1 por alumno), orden alfabético correcto.

- El endpoint (`PlanillaPreinscripcionMasivaView`) reordena por
  `.order_by('apellido', 'nombre')` a nivel de queryset (case-sensitive en
  SQLite/Postgres por default) y **además** `generar_documento_unico_preinscripciones`
  reordena en Python con `.lower()` antes de combinar — la ordenación de
  BD queda redundante para el modo `unico` pero se dejó tal cual porque el
  modo `individual` (.zip) sigue dependiendo de ella y cambiarla afecta a
  ambos.

## Pendiente de esta pasada

- **Verificación visual pixel-a-pixel de la alineación con tab stops** —
  se confirmó que el `.docx` combinado abre correctamente en Word real y
  que cada planilla ocupa exactamente 1 página (con datos reales de los
  451 alumnos), pero no se hizo una revisión visual campo por campo de
  que el tab stop al 45% del ancho de celda quede "prolijo" en todos los
  casos (nombres/direcciones muy largos podrían acercarse al borde de la
  celda). Recomendado que alguien lo revise abriendo el archivo en Word
  antes de considerar cerrado ese criterio de aceptación específico.
- **Lección para la próxima vez que se genere/edite un `.docx`
  programáticamente en este proyecto**: `python-docx` NO valida la
  integridad OOXML al guardar ni al releer — un archivo puede "andar" con
  `python-docx` y estar corrupto para Word. Este entorno tiene Word
  instalado (confirmado vía registro de Windows) y se le pudo instalar
  `pywin32` para abrir archivos con Word real por COM y leer
  `ComputeStatistics(wdStatisticPages)` como verificación de que el
  archivo realmente abre y cuántas páginas tiene — usar ese método (no
  solo re-leer con `python-docx`) para verificar cualquier `.docx`
  generado o combinado programáticamente antes de darlo por bueno.

---

# BUG — LOGOS DEL RECIBO NO SE VEÍAN EN OTROS DISPOSITIVOS (2026-07-18)

Reportado por el usuario: el logo del colegio y el de AVEC (Configuración ›
Logos del Recibo de Pago) se veían bien en la PC donde se subieron, pero
"desaparecían" al entrar desde otro dispositivo. Causa confirmada: no era
caché — `useLogosRecibo.js` guardaba los logos como base64 en
`localStorage` (`octopus_logos_recibo`), nunca se enviaban al backend. Cada
dispositivo/navegador tenía su propio `localStorage`, así que solo el que
subió el logo lo tenía.

**Implementado (movidos al backend, VPS Hostinger con disco persistente,
no requiere S3/Cloudinary):**

- `ConfiguracionSistema` (`secretaria/models.py`) ganó `logo_colegio` y
  `logo_avec` (`ImageField(upload_to='configuracion/logos/')`), migración
  `0016_configuracionsistema_logo_avec_and_more`. Se mantuvo `logo_url`
  (URL externa) sin tocar — es un campo distinto, no relacionado.
- `ConfiguracionSistemaSerializer` valida tipo (`image/png|jpeg|webp`) y
  peso (máx. 2 MB) de ambos campos.
- `ConfiguracionSistemaView.post` (`secretaria/views.py`) ya aceptaba
  multipart sin cambios (DRF trae `MultiPartParser` por defecto). Se
  agregó manejo explícito de borrado: DRF's `FileField` rechaza un string
  vacío como dato inválido (no lo interpreta como "borrar el archivo"), así
  que el frontend manda un flag `logo_colegio_clear=true`/`logo_avec_clear=true`
  aparte, y la vista borra el archivo del disco (`.delete(save=False)`)
  y limpia el campo antes de guardar. Las 3 instancias de
  `ConfiguracionSistemaSerializer` en la vista ahora reciben
  `context={'request': request}` para que las URLs de los `ImageField`
  salgan absolutas (con host) en vez de rutas relativas `/media/...`.
- `useLogosRecibo.js` (frontend) reescrito: ya no usa `localStorage`, sube
  el archivo real vía `multipart/form-data` al mismo endpoint de
  configuración (`secretaria/configuracion/`) y lee el estado actual desde
  `config.logo_colegio`/`config.logo_avec` (prop compartida con
  `useConfiguracion`).
- `utils/logosInstitucionales.js` (nuevo): helper con caché en memoria que
  hace `GET secretaria/configuracion/` y descarga cada logo como blob,
  convertido a data-URI (`FileReader.readAsDataURL`). Necesario porque
  `jsPDF.addImage()` (usado en `nominaPDF.js`) solo acepta data-URIs/
  `HTMLImageElement`/`HTMLCanvasElement`, no URLs remotas — así que no basta
  con devolver la URL del backend, hay que descargarla y convertirla antes
  de dibujar el PDF. Se invalida (`invalidateLogosInstitucionalesCache`)
  cada vez que se guardan logos nuevos desde Configuración.
- Consumidores migrados de `localStorage` a este helper:
  `utils/printReciboCobranza.jsx` (ahora `async`, ambos callers —
  `Comprobantes.jsx`, `Cobranza.jsx` — no usaban el valor de retorno, no
  hizo falta tocarlos), `hooks/useRecibo.js` (precarga los logos
  institucionales como valor inicial editable del formulario de recibo de
  nómina, vía `useEffect` en vez de lectura síncrona de `localStorage` en
  el `useState` inicial), `hooks/useInstitucionPDF.js` (ya no delega en
  `useLogosRecibo`, llama directo a `getLogosInstitucionales()`).
- **Migración one-shot de datos existentes**: `useLogosRecibo.js` detecta,
  la primera vez que carga `Configuracion.jsx` tras este cambio, si el
  navegador actual tiene logos guardados en el `localStorage` viejo
  (`octopus_logos_recibo`) y el backend todavía no tiene logos propios —
  en ese caso los sube automáticamente (conversión data-URI → `Blob` vía
  `atob`) y limpia la clave de `localStorage`. Así el usuario no pierde lo
  que ya había configurado en su PC habitual. Si la subida falla (red), no
  borra `localStorage` — reintenta en la próxima carga.

**No corregido / fuera de alcance:**

- No se agregó validación de dimensiones/aspect ratio a `logo_colegio`/
  `logo_avec` (mismo criterio que `Alumno.foto`, ver auditoría
  2026-07-09 más arriba en este archivo) — solo tipo MIME y peso.
- El módulo de nómina (`Recibos.jsx` / `useRecibo.js`) permite seguir
  subiendo un logo **distinto** por recibo individual como override manual
  (comportamiento preexistente, no relacionado con el bug reportado) — ese
  override sigue siendo solo en memoria del formulario, no se persiste en
  ningún lado; es intencional, es un ajuste puntual por documento, no la
  configuración institucional.
- No se probó manualmente en un segundo dispositivo real (solo se verificó
  el flujo de subida/lectura contra el backend) — recomendado que el
  usuario confirme entrando desde su celular u otra PC tras el deploy.

## MÓDULO NOTIFICACIONES — 2026-07-20

### 🔴 CRÍTICO (corregido)

1. **Toast de "prueba enviada" mentía sobre el resultado real** — ✅ RESUELTO
   - `useConfiguracionNotificaciones.js` (`sendTest`) y `useNotificaciones.js`
     (`handleEnviarPrueba`) mostraban `toast.success` con solo recibir un
     200 HTTP, sin mirar `resultados.email === 'fallido'` que ya devolvía
     el backend. Esta es la causa raíz de "dice que funciona pero el
     correo nunca llega" reportado por el usuario — no era problema de
     configuración SMTP.
   - Corregido en ambos hooks: ahora el toast y `testResult.ok` reflejan
     el resultado real por canal.

2. **Sin soporte SSL implícito (puerto 465)** — ✅ RESUELTO
   - `notificaciones/services.py::enviar_email` solo pasaba `use_tls` a
     `get_connection()`, nunca `use_ssl`. Hostinger (y muchos proveedores)
     usan puerto 465 con SSL implícito, no STARTTLS — con la config vieja,
     usar 465 rompía la conexión o silenciosamente no llegaba a intentar
     el envío real. Ahora se detecta `puerto == 465 → use_ssl=True` y se
     ignora el toggle de TLS en ese caso.

### 🟡 MEDIO — arquitectura ampliada, no corregido del todo

3. **Dos implementaciones paralelas de "configuración de notificaciones"** — ⏳ PENDIENTE
   - `pages/Configuracion.jsx` + `hooks/useNotificaciones.js` tiene una
     card de "estado" (líneas ~822-860) que lee `configNotif.email?.activo`,
     `configNotif.email?.host`, etc. — un shape **anidado** que el backend
     nunca devolvió (el endpoint `notificaciones/configuracion/` siempre
     devolvió un dict plano: `email_activo`, `email_host`...). Esa card
     probablemente muestra guiones/vacío desde que se escribió; es código
     muerto o roto, no se tocó porque no es la pantalla real que usa el
     usuario (esa es `ConfiguracionNotificaciones.jsx`).
   - Hay además un formulario de "prueba" duplicado en `Configuracion.jsx`
     (`handleEnviarPrueba`) que apunta al mismo endpoint `notificaciones/probar/`
     que la pantalla real `ConfiguracionNotificaciones.jsx`. Sugerido:
     eliminar la card de estado rota y el formulario de prueba duplicado
     de `Configuracion.jsx`, dejando `ConfiguracionNotificaciones.jsx`
     como única fuente de verdad. No implementado — cambio de UI que
     conviene confirmar con el usuario antes de borrar código visible.

### Ampliación: remitente por área (cobranza / control de estudios)

- Nuevo modelo `PerfilEmailRemitente` (`notificaciones/models.py`) —
  credenciales SMTP independientes por área (`cobranza`,
  `control_estudios`), en vez del singleton único `ConfiguracionNotificaciones`
  que antes servía **todos** los correos del sistema.
- Migración `0003_perfilemailremitente_alter_notificacionlog_tipo.py` copia
  la config SMTP existente al perfil `cobranza` (data migration), así no
  se pierde lo ya configurado en producción.
- `ConfiguracionNotificaciones` (singleton) ahora solo guarda
  `director_email` + campos de WhatsApp — los campos `email_*` quedan en
  el modelo por compatibilidad de la migración de datos pero ya no se
  exponen ni editan vía `ConfiguracionNotificacionesView` (ver
  `CAMPOS_EMAIL` en `notificaciones/views.py`). Podrían eliminarse en una
  migración futura si se confirma que nada más los lee.
- `enviar_email()` ahora recibe `area='cobranza'` (default) y busca el
  perfil correspondiente; se agregó soporte de `adjuntos` (lista de
  tuplas `(nombre, bytes, mimetype)`) para poder mandar el comprobante
  `.docx` de inscripción adjunto.
- `notificar_comprobante_inscripcion()` (nuevo, en `services.py`) se
  dispara vía Celery (`task_notificar_comprobante_inscripcion`) desde
  `InscripcionNuevaView.post` (`secretaria/views.py`) — envía desde el
  perfil `control_estudios` al crear una inscripción. **No** se dispara
  al reimprimir el comprobante desde `ComprobanteInscripcionView` (correcto:
  ese endpoint es solo para descarga manual, no debe reenviar el correo).
- **Pendiente de configurar en producción**: crear la segunda casilla en
  Hostinger (ej. `controldeestudios@clhma.com`) y cargar sus credenciales
  en la pestaña "Control de Estudios" de `ConfiguracionNotificaciones.jsx`
  — sin esto, los comprobantes de inscripción no se envían (el perfil
  queda con `email_activo=False` por default y `enviar_email` no
  intenta la conexión SMTP).
- **No verificado en navegador**: el build de frontend y `manage.py check`
  pasan limpios, pero no se pudo hacer login end-to-end en un servidor de
  desarrollo local para probar clic-a-clic (no había credenciales de un
  usuario con rol autorizado disponibles en este entorno, y no se debe
  resetear contraseñas de usuarios existentes sin permiso explícito).
  Recomendado que el usuario pruebe el flujo completo (pestañas, guardar,
  probar email, crear una inscripción de prueba) antes de darlo por
  cerrado.

# COMPROBANTE DE INSCRIPCIÓN — PAGOS FUERA DE TRANSFERENCIA/EFECTIVO NO APARECÍAN (2026-07-22)

Bug encontrado al revisar por qué el comprobante no mostraba "todos los datos
disponibles en el sistema": `_buscar_metodo()` (`secretaria/utils_preinscripcion.py`)
solo buscaba el método `transferencia` para rellenar "Nº DE TRANSFERENCIA" y
los bancos. Un pago hecho por **Pago Móvil, Punto de Venta, Zelle o Stripe**
quedaba completamente fuera del documento — ni monto ni referencia en ningún
campo — aunque el pago existiera y estuviera registrado.

- **Decisión del usuario**: la planilla física solo tiene casillas de
  "TRANSFERENCIA" y "EFECTIVO" (no hay campo propio para Pago Móvil/Zelle/
  Stripe), así que se decidió tratar Pago Móvil, Punto de Venta, Zelle y
  Stripe como "transferencia" a efectos del documento — se suman sus montos
  y referencias en `_combinar_metodos_transferencia()` (reemplaza a
  `_buscar_metodo()`), y el banco de origen/destino se toma del primer
  método que sí tenga banco asociado (Pago Móvil/Punto de Venta/
  Transferencia; Zelle y Stripe no tienen banco en
  `calcular_datos_administrativos_inscripcion`, `cobranza/services.py`).
- El campo "CÉDULA" del estudiante se revisó también (candidato obvio a
  "dato faltante") pero se mantuvo en blanco a propósito — decisión
  reconfirmada por el usuario, ver punto 1 de la sección "MÓDULO
  PRE-INSCRIPCIÓN" más arriba: no existe cédula de identidad del alumno en
  el modelo, solo `cedula_escolar` (matrícula interna).
- No se tocó `_sumar_montos_efectivo()` (efectivo/efectivo_ves siguen igual).
- **No verificado en navegador**: no se generó un comprobante real con un
  pago por Zelle/Pago Móvil en este entorno para confirmar visualmente el
  resultado — se validó por lectura de código (`py_compile` limpio). Se
  recomienda que el usuario reimprima el comprobante de un alumno con un
  pago no-transferencia/no-efectivo para confirmar que ahora aparece.

---

# FASE 0 — HOUSEKEEPING (2026-07-27)

Primera fase de `docs/PLAN_EXPANSION_V2.md`. Alcance: eliminar inconsistencias
de documentación y código muerto de Stripe (pago en línea descontinuado, fuera
de alcance por decisión del cliente) antes de sumar los módulos nuevos. Sin
modelos ni migraciones.

**Implementado:**
- `README.md`: quitado "Stripe Checkout" del listado de stack y toda la
  sección de setup de Stripe CLI/webhook.
- `octopus-api/.env.example` y `octopus-frontend/.env.example`: quitadas
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PUBLISHABLE_KEY` y
  `VITE_STRIPE_PUBLISHABLE_KEY` — ninguna la lee `config/settings.py` (grep
  sin resultados), eran variables muertas.
- `authentication/views.py:375`: corregido el docstring de
  `ActivarPortalMasivoView`, que decía `POST /api/auth/activar-portal-masivo/`
  cuando la ruta real (`authentication/urls.py:12` + `config/urls.py:11`) es
  `/api/authentication/activar-portal-masivo/`.
- `portal/tests.py`: eliminada la clase `StripeWebhookTests` completa (3 tests
  que fallaban de forma preexistente, ver punto 4 más arriba en este archivo —
  posteaban a `/api/portal/stripe/webhook/`, ruta que ya no existe en
  `portal/urls.py`).
- `octopus-api/requirements.txt`: quitado `stripe==15.2.0` — sin ningún
  `import stripe` real en código productivo tras eliminar los tests
  (verificado por grep en todo `octopus-api/**/*.py`).

**Decisión pendiente resuelta — NO se retira el choice `'stripe'` de `cobranza`:**
`docs/PLAN_EXPANSION_V2.md` dejaba como decisión abierta si retirar
`('stripe', 'Stripe (Pago Online)')` de `cobranza/models.py:81` (y su eco en
`cobranza/services.py:230`). Se investigó antes de decidir: 0 registros
históricos con `metodo_pago='stripe'` en la BD local de desarrollo (no
concluyente para producción, sin acceso a ella desde este entorno). Pero se
encontró algo más determinante — `secretaria/utils_preinscripcion.py:181,193`
(`_combinar_metodos_transferencia`, usado por Pre-Inscripción individual y
masiva) hace `dict(Pago.METODOS)[c] for c in _CODIGOS_TIPO_TRANSFERENCIA`
sobre una tupla que incluye `'stripe'` de forma hardcodeada. Si el choice se
retira de `Pago.METODOS`, esa línea lanza `KeyError: 'stripe'` en **cada**
generación de planilla de pre-inscripción, sin importar si existen o no pagos
históricos con ese método — no es un riesgo condicional, es un crash
garantizado de una función en uso activo. Sumado a que tocar el choice
requiere migración nueva en `cobranza/migrations/`, se decidió dejarlo
intacto: toca dos módulos (`cobranza` y `secretaria`) que la propia v2 protege
explícitamente por tener desarrollo activo. Si se retoma esta limpieza más
adelante, hay que actualizar `_CODIGOS_TIPO_TRANSFERENCIA` en el mismo cambio.

**Fuera de alcance de esta pasada (anotado, no tocado):**
- `authentication/views.py.bak` — archivo de respaldo suelto sin versionar
  valor real, mismo patrón que `nominaPDF.js.bak` (ya anotado en la sección
  "MÓDULO NOMINA" de este archivo). No se borró por no ser parte del alcance
  pedido de Fase 0.

---

# FASE 1 — DIARIO DE CLASES: ASISTENCIA EXTENDIDA + INCIDENTES (2026-07-27)

Implementado según `docs/PLAN_EXPANSION_V2.md` (Fase 1): campo `Asistencia.estado`
(P/A/J/R, aditivo — no se tocaron `presente`/`justificada`) + nuevo modelo
`IncidenteDisciplinario`. Scoping de docente por sección vía `Materia.docente`
(nueva clase `IsDocenteAsignadoOrSecretariaOrAbove`, `academico/views.py`).
Verificado end-to-end en navegador (docente marca "Retardado" y crea un
incidente con sección propia; ambos casos confirmados también contra la BD) y
con 15 tests nuevos en `academico/tests.py` (antes el app no tenía ningún test).

**Housekeeping pendiente que se hizo visible al tocar este módulo (no corregido,
fuera de alcance de Fase 1):**

1. **`react-hooks/set-state-in-effect` falla en todo el proyecto, no solo en
   código nuevo** — el patrón `useEffect(() => { fetchX(); }, [fetchX])` (fetch
   inicial llamando un `useCallback` que hace `setState`) está en
   `useAsistencia.js`, `useBoletin.js`, y ya estaba documentado como pendiente
   en `useNomina.js` (ver sección "MÓDULO NOMINA" de este archivo). Los hooks
   nuevos de esta fase (`useIncidentes.js`) replican el mismo patrón a
   propósito, por consistencia con el resto del código — no se corrigió aquí
   porque exigiría tocar hooks fuera del alcance de Fase 1 y no bloquea el
   build (`vite build` no corre `eslint`). Si se decide resolverlo, conviene
   hacerlo de una vez para todos los hooks afectados en una pasada dedicada,
   no módulo por módulo.

2. **`Asistencia` no tiene relación con `Materia`/`Horario`** — a diferencia de
   lo que asumía el diseño original (`docs/TRD.md` v1), el modelo real solo
   tiene `alumno` + `fecha` (una asistencia por alumno por día, no por bloque
   de clase/materia). El scoping de docente implementado para Fase 1 infiere la
   sección autorizada comparando `grado_seccion` contra las `Materia` activas
   del docente — funciona porque `grado_seccion` es el mismo string en ambos
   modelos, pero es un acoplamiento por convención de nombre, no por FK. Si en
   el futuro se necesita asistencia por bloque/materia (tal como sugería el
   diseño v1), este acoplamiento habría que revisarlo.

3. **`IncidenteDisciplinario.adjunto` no valida dimensiones/aspect ratio**,
   igual que el `ImageField` de `Alumno.foto` (ya anotado en la sección
   "NUEVA PLANILLA DE INSCRIPCIÓN" de este archivo) — solo tipo MIME (vía
   `serializers.ImageField` de DRF) y peso (5MB, `validar_tamano_adjunto` en
   `academico/models.py`).

4. **Búsqueda de alumnos (`secretaria/alumnos/?buscar=`) es `icontains` por
   campo separado** (`nombre__icontains` OR `apellido__icontains` OR ...), no
   por nombre completo concatenado — buscar "Juan Perez" no encuentra un
   alumno con `nombre='Juan'`/`apellido='Perez'` porque ninguno de los dos
   campos por separado contiene la cadena completa "Juan Perez". Se descubrió
   verificando el buscador de alumno del modal de incidentes (reutiliza
   `buscarAlumnos`, el mismo que ya usa `Boletin.jsx`), así que el mismo
   comportamiento ya existía antes de esta fase. No se corrigió por ser
   preexistente y compartido por otro módulo — si se toca, requeriría anotar
   un campo `nombre_completo` o usar `SearchVector`/concatenación en el
   backend (`secretaria/views.py::AlumnoListView.get_queryset`).

---

# FASE 2 — CENTRO DE COMUNICACIÓN (CIRCULARES) (2026-07-27)

Nueva app `comunicacion`: modelos `Circular`/`LecturaCircular`, endpoints admin
(`/api/comunicacion/circulares/...`) y portal (`/api/portal/comunicacion/circulares/...`),
notificación por email (`notificaciones/services.py::notificar_circular_nueva` +
tarea Celery `notificaciones/tasks.py::task_notificar_circular_nueva`), frontend
admin (`pages/Comunicacion.jsx`) y portal (`portal/pages/PortalComunicaciones.jsx`).
Sigue el diseño de `docs/PLAN_EXPANSION_V2.md` Fase 2: broadcast completo a todos
los `RepresentanteUser` activos, sin segmentación por grado/sección, sin polling.

1. **Verificado con datos reales del colegio en navegador** (2026-07-27): director
   publica circular con `requiere_confirmacion=True` → se crean 2 `LecturaCircular`
   (una por representante con portal activo) → representante ve badge "1 sin leer",
   confirma con "He leído" → estado se refleja en el panel admin ("¿Quién leyó?").
   Probado también en viewport 375px (portal y panel admin) sin overflow horizontal.

2. ✅ **RESUELTO — `.delay()` de Celery bloqueaba la request 2-4 minutos cuando
   Redis no está corriendo** (`Retry limit exceeded while trying to reconnect to
   the Celery result store backend`). Causa raíz: por defecto, cada `.delay()`
   intenta además guardar el estado inicial/final de la tarea en el *result
   backend* (Redis); si no está disponible, kombu reintenta con backoff durante
   varios minutos antes de lanzar la excepción — el `try/except` de la vista
   la atrapa igual, pero solo después de ese retraso, bloqueando la respuesta
   HTTP completa (el servidor de desarrollo es single-threaded). Se confirmó
   por grep que **ninguna tarea del proyecto lee su `AsyncResult`** (todas son
   fire-and-forget), así que guardar el resultado no le sirve a nadie.
   **Fix aplicado**: `CELERY_TASK_IGNORE_RESULT = True` en
   `config/settings.py` (junto a `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND`) —
   con esto la escritura al result backend ni se intenta, y el `.delay()` solo
   necesita el intento (rápido) de publicar en el *broker*. Verificado con
   Redis apagado: bajó de 2-4 minutos a **~4 segundos** por llamada (medido con
   `task_notificar_circular_nueva.delay()` directo en shell, y confirmado de
   nuevo end-to-end en el navegador: publicar circular pasó de colgarse a
   responder en ~2s). Aplica a **todas** las tareas Celery del proyecto
   (comprobantes, mora, bienvenida, etc.), no solo a Comunicación, ya que
   ninguna de ellas depende de resultados. Suite completa
   (`portal`, `notificaciones`, `academico`, `comunicacion`) vuelta a correr
   tras el cambio: 51 tests, mismos 2 fallos preexistentes de siempre (ver
   punto 4 de la sección "BACKEND — GENERACIÓN AUTOMÁTICA DE MENSUALIDADES"),
   nada nuevo roto.

3. **Ruteo del portal dividido en dos archivos de urls** (`comunicacion/urls.py`
   para el panel admin, `comunicacion/urls_portal.py` para el portal), en vez de
   un solo `comunicacion/urls.py` con un sub-prefijo `portal/` como proponía el
   plan inicial. Motivo: `portalClient.js` (frontend) tiene `baseURL` fija en
   `/api/portal/` — todas las llamadas del portal son rutas relativas a ese
   prefijo, igual que `portal/urls.py` ya existente. Para que
   `comunicacion.service.js` del portal pudiera reutilizar `portalClient` sin
   duplicar el interceptor de refresh de token (60+ líneas en `portalClient.js`),
   los endpoints de circulares para representantes se montan en
   `config/urls.py` bajo `api/portal/comunicacion/` en vez de
   `api/comunicacion/portal/`. Los permisos/autenticación (`PortalJWTAuthentication`
   vs. default admin) no cambian, solo el prefijo de URL.

---

# FASE 3 — PORTAL DOCENTE + MENSAJERÍA BIDIRECCIONAL (2026-07-28)

Implementado según `docs/PLAN_EXPANSION_V2.md` (Fase 3): el docente reutiliza el
JWT/login del panel admin (sin auth separada), gana una sección "Mis Materias"
con Notas + Material de Estudio, y se extiende `comunicacion` con
`MensajeDirecto` para chat docente↔representante. Verificado end-to-end en
navegador (login docente → notas → material → nueva conversación → login
portal representante → respuesta → confirmado en ambos lados) y con 32 tests
de backend (`academico` + `comunicacion`) en verde.

## Decisiones de diseño (no negociables, ya implementadas)

1. **Notas: el docente solo edita su propia materia, no toda la sección.**
   A diferencia de Asistencia/Incidentes (`IsDocenteAsignadoOrSecretariaOrAbove`,
   que valida por `grado_seccion`), `NotasGradoView.post` (`academico/views.py`)
   ahora valida `Materia.docente_id == request.user.id` para el rol docente —
   más estricto porque una sección tiene varias materias con distintos
   docentes. No se reutilizó `IsDocenteAsignadoOrSecretariaOrAbove` por esto.

2. **`MensajeDirecto` no tiene FK a `Materia`** — es por `alumno` únicamente
   (igual que el modelo del TRD). Consecuencia asumida: si dos docentes
   distintos le escriben al representante sobre el mismo alumno, ambas
   conversaciones comparten un solo hilo en la bandeja del representante
   (`comunicacion/views.py::MensajeDirectoPortalListCreateView`). No se separó
   por docente para no inventar un concepto de "conversación" que el modelo
   del TRD no contemplaba.

3. **El representante nunca inicia una conversación en frío.** Solo puede
   responder dentro de un hilo que ya tenga al menos un mensaje de un docente
   (`MensajeDirectoPortalListCreateView.post` exige un
   `MensajeDirecto` previo con `destinatario_representante=rep_user` para ese
   alumno; si no existe, 400). Decisión tomada porque el modelo no tiene forma
   de saber a cuál de los N docentes de un alumno debería dirigirse un mensaje
   nuevo del representante — evita esa ambigüedad sin agregar un selector de
   destinatario en el portal.

4. **El docente requiere que el representante ya tenga `RepresentanteUser`
   activo** para poder escribirle (`alumno.representante.portal_user`, 400 si
   no existe o está inactivo). No se crea el acceso al portal automáticamente
   desde este flujo — sigue siendo responsabilidad del flujo de aprobación de
   comprobantes/activación manual que ya existía en `portal`.

5. **`GestionMateria.jsx` tiene solo 2 tabs (Notas, Material)**, no 3. El
   primer boceto de este plan incluía un tab "Mensajes" por materia, pero se
   descartó al escribir el backend: `MensajeDirecto` es por alumno, no por
   materia (punto 2), así que no encaja como tab de una materia puntual.
   Mensajes vive en su propia ruta (`/mensajes`, sidebar → Comunicación).

## Deuda técnica anotada, no corregida

1. **Los 4 hooks nuevos (`useMisMaterias`, `useMateriales`, `useMensajes`,
   `usePortalMensajes`) disparan el mismo patrón `react-hooks/set-state-in-effect`
   que ya reporta el lint en código preexistente** (`useCirculares.js:30`,
   `useLapsos.js`, y el ya documentado en `useNomina.js` — ver sección
   "MÓDULO NOMINA" de este archivo). Se replicó el patrón existente por
   consistencia en vez de introducir un estilo nuevo solo para estos hooks;
   sigue pendiente una pasada de refactor a nivel de todo el proyecto, no de
   esta fase puntual.

2. **`useMensajes.js` agrupa conversaciones client-side** sobre el resultado
   completo de `GET /api/comunicacion/mensajes/` (sin filtro), en vez de que
   el backend devuelva ya agrupado. Aceptable mientras el volumen de mensajes
   por docente sea bajo (few-hundred range); si un docente acumula miles de
   mensajes con muchos alumnos distintos, esa vista debería paginarse y la
   agrupación por conversación debería resolverse en el backend (mismo
   criterio de "no paginar hasta que el volumen lo justifique" ya aplicado a
   Notas/Asistencia, documentado en la sección "PAGINACIÓN DE LISTADOS").

3. **`ModalNuevaConversacion.jsx` duplica casi línea por línea el buscador de
   alumnos de `ModalNuevoIncidente.jsx`** (debounce, dropdown, click-outside).
   No se extrajo a un hook/componente compartido (`useBuscadorAlumno` o
   similar) en esta pasada para no tocar `ModalNuevoIncidente.jsx` fuera del
   alcance de esta fase; si aparece un tercer lugar que necesite el mismo
   buscador, vale la pena extraerlo.

4. **Sin WebSockets ni polling para mensajes nuevos** — coherente con la
   decisión ya tomada en Fase 2 para circulares (ver `PLAN_EXPANSION_V2.md`),
   pero a diferencia de circulares (que se ven al recargar el dashboard),
   aquí no hay ningún indicador de "mensajes sin leer" en el navbar/sidebar
   todavía. El representante o el docente solo se enteran de un mensaje nuevo
   por email (`notificar_mensaje_directo`) o al entrar manualmente a
   `/mensajes` / `/portal/mensajes`. Si el uso real lo justifica, un badge
   con polling de 30s (mismo patrón ya descartado para circulares, ver TRD)
   sería el siguiente paso natural.

5. **Datos de prueba usados para la verificación en navegador de esta fase
   (usuario `docente_demo`, representante `V99999999`, alumno `DEMO001`,
   materia "Ciencias Demo", lapso "1er Lapso 2025-2026") se crearon y
   eliminaron en la misma sesión** — no quedaron en la base de datos. Se
   confirmó de paso que `academico` no tenía ningún `Materia`/`Lapso` real
   cargado todavía (0 registros antes de esta verificación), a diferencia de
   `secretaria` que ya tiene 452 alumnos reales importados.
