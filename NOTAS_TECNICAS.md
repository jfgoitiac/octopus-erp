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
