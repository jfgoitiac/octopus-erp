# NOTAS TÉCNICAS — OCTOPUS FRONTEND

Deuda técnica detectada durante auditorías y refactorings.

## ASSETS — BARRA SUPERIOR (acabado visual + símbolo de marca)

- **Solo se copió la variante "paper" (clara) del símbolo Octopus**
  (`src/assets/octopus-symbol.svg` / `.png`, desde `brand_pkg_D/01_symbol/`).
  El paquete de origen trae 4 variantes (`ink`, `ink_on_paper`, `paper`,
  `paper_on_ink`) pensadas para distintos fondos. Si en el futuro el header
  deja de ser oscuro (tema claro, otra sede con paleta distinta), esta
  variante dejará de tener contraste suficiente y habrá que traer la variante
  correspondiente — no generarla editando el SVG actual.
- **El PNG (`octopus-symbol.png`, 512px) se copió pero no se usa** — el
  componente importa solo el SVG (D2 de la sesión). Queda en el repo "por si"
  se necesita un raster; si nunca se usa, es peso muerto a limpiar.
- **El degradado del header vive en dos lugares con distinta alpha** (vigente
  tras migrar a 4 paradas animadas `--topbar-c1..c4`): los tokens base
  (opacos, para el respaldo sin `backdrop-filter` y para `@media print`) y los
  valores `rgba(12,130,141,0.88)` / `rgba(11,122,114,0.88)` /
  `rgba(10,109,119,0.88)` / `rgba(10,107,131,0.88)` hardcodeados dentro del
  bloque `@supports` en `index.css` (no se pudo expresar la alpha como token
  porque los tokens base están en hex, no en canales rgb separados). Si el
  color de marca cambia, hay que actualizar ambos lugares a mano.
- **Esquinas superiores redondeadas del panel de contenido (PASO 6, sesión
  2026-08-28)**: se implementó sin envolver sidebar+main en un contenedor
  común ni agregar `overflow:hidden` nuevo (el `overflow:hidden` del
  contenedor de contenido ya existía de antes y no recorta `position:fixed`
  por especificación CSS al no haber `transform` de por medio). En su lugar,
  cada panel (`Sidebar.jsx`, contenedor de contenido en `MainLayout.jsx`)
  redondea su propia esquina sobre su propio fondo. Efecto secundario: el
  fondo del `<div>` raíz de `MainLayout` pasó de `var(--bg)` a
  `var(--topbar-c3)` (oscuro) para que se note el redondeo en el hueco que
  queda entre la barra y el panel — si algún día se agrega contenido visible
  directamente en ese `<div>` raíz (fuera de header/sidebar/contenido), habrá
  que revisar que no quede sobre fondo oscuro sin querer.
- **Primer intento del redondeo (mismo PASO 6) dejaba el contenedor de
  contenido arrancando en `y=0`** (con `h-dvh` y el offset del topbar aplicado
  solo como `padding-top` en `<main>`, para que el contenido "pasara detrás"
  del header traslúcido — diseño de una tarea previa de blur/profundidad).
  Como el header (`position:fixed`, opaco/semi-opaco) se pinta encima, la
  esquina redondeada del contenedor quedaba oculta debajo del header y nunca
  se veía — solo se notaba la del Sidebar, que sí arranca en
  `top-[var(--topbar-h)]`. Corregido dándole al contenedor de contenido el
  mismo offset (`mt-[var(--topbar-h)]` + altura `calc(100dvh - var(--topbar-h))`
  en vez de `h-dvh` + padding). **Resolución aplicada**: la zona fuera del
  redondeo se pinta con la misma superficie del header (`.topbar-surface`) para
  conservar la sensación de continuidad visual y mantener el efecto de
  profundidad sin exigir que el contenido pase detrás del header. El
  `backdrop-filter` del bloque `@supports` queda como un pequeño ajuste de
  profundidad para la superficie del topbar y el borde de costura, sin depender
  de que haya contenido real detrás del header; por eso ya no es un efecto
  inocuo ni roto, sino un detalle de acabado del mismo sistema visual.

## SISTEMA DE BOTONES/CONTROLES (auditoría 2026-08-29)

- **`.label`, `.input` y `.btn-primary` estaban muertos** (0 usos en `src/`,
  solo la propia definición en `index.css`) y usaban paleta azul/gris de
  Tailwind por defecto en vez de los tokens de marca (`--pb`, `--jet`,
  `--border`). Se corrigieron para usar los tokens y se agregó un sistema
  base (`.btn`, `.btn-sm`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`)
  con tamaño táctil mínimo (40px base / 32px `.btn-sm`), `focus-visible`
  accesible y `disabled` consistente.
- **Ninguna de las clases nuevas está adoptada todavía en el JSX.** Los 604
  `<button>` de `src/` siguen resolviéndose con utilidades Tailwind sueltas
  (`bg-[var(--pb)] ...` repetido 155 veces en 100 archivos distintos, y
  variantes de borde/hover ad-hoc por módulo). Migrar cada botón a
  `.btn .btn-primary|.btn-secondary|.btn-ghost|.btn-danger [.btn-sm]` es
  trabajo aparte (~600 sitios), fuera del alcance de esta auditoría porque
  implica tocar JSX en casi todos los módulos, no solo `index.css`.
  Recomendado: migrar módulo por módulo empezando por los modales (mayor
  densidad de botones repetidos: cantina, portal, portal-docente, sistemas,
  reportes) y, si el volumen lo justifica, extraer un componente
  `src/components/ui/Button.jsx` que envuelva estas clases en vez de escribir
  `className="btn btn-primary"` a mano en cada sitio.
- **Variante destructiva inconsistente en JSX:** varios modales de
  eliminar/rechazar usan `bg-red-*` de Tailwind en vez de `--red` de marca.
  Se resuelve al migrar a `.btn-danger`, no se tocó en esta pasada.

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
- ~~`utils/nominaPDF.js.bak` — archivo de respaldo suelto en el repo, no debería estar versionado.~~ ✅ RESUELTO (2026-08-27) — eliminado, confirmado sin ningún import en el repo.

## AUDITORÍA NÓMINA/RRHH — BUGS FINANCIEROS Y HARDCODEO (2026-08-27)

Auditoría solicitada por el usuario ("audita el módulo de Nómina y RRHH") sobre
`octopus-api/nomina/`, `octopus-api/rrhh/`, y los componentes/hooks/utils de
`octopus-frontend` del módulo. El usuario pidió corregir todo lo encontrado,
con cuidado de no romper flujos existentes. Verificado con `python manage.py
test nomina rrhh cobranza portal secretaria multisede` (141 tests, todos OK)
y `vite build` limpio tras cada tanda de cambios.

### 🔴 CRÍTICO — resueltos

1. **`nomina/utils.py::GeneradorArchivoBancario.generar_txt_banesco`** usaba una
   cuenta bancaria dummy fija (`"01340000000000000000"`) para *todos* los
   empleados en el archivo plano bancario, en vez de leer la cuenta real
   (`empleado.empleado_rrhh.numero_cuenta`). Función sin ningún caller en el
   repo (confirmado por grep) — quedó así como código muerto/WIP, sin haber
   llegado a producción, pero se corrigió antes de que alguien la conecte sin
   revisar. Ahora omite (y reporta) empleados sin cuenta vinculada en vez de
   generar una línea con datos falsos.

2. **Duplicación de ficha de nómina al editar la cédula en RRHH** —
   `rrhh/models.py::Empleado.save()` sincronizaba con `nomina.Empleado`
   buscando por `cedula`. Si se editaba la cédula de un empleado ya vinculado,
   no encontraba la ficha de nómina existente y creaba una segunda,
   dejando dos registros de nómina para un solo empleado real. Corregido:
   ahora busca primero por `empleado_rrhh_id` (el vínculo ya existente) y solo
   cae a buscar por cédula para el primer enlace. Además se agregó una
   validación a nivel de modelo (`nomina.Empleado.clean()`) que impide que dos
   fichas de nómina apunten al mismo `empleado_rrhh` — defensa en profundidad
   mientras no se audite la data existente para promover `empleado_rrhh` a
   `OneToOneField` real a nivel de BD (ver pendiente más abajo).

3. **Empleado "eliminado" seguía recibiendo nómina indefinidamente** —
   `useNomina.js` hacía `DELETE` físico sobre `rrhh.Empleado`. Como
   `nomina.Empleado.empleado_rrhh` usa `on_delete=SET_NULL` y
   `generar_lote` trata `empleado_rrhh__isnull=True` como "activo" (para
   soportar empleados de nómina históricos sin vínculo a RRHH), un empleado
   borrado quedaba indistinguible de esos históricos y seguía cobrando.
   Corregido: el botón "Eliminar" ahora hace baja lógica
   (`POST rrhh/empleados/<id>/desactivar/`, nuevo endpoint) en vez de `DELETE`
   físico — el campo `activo` (ya existía en el modelo, no se usaba) se pone
   en `False`, preservando el historial y evitando el problema de raíz.
   También se agregó `reactivar/`.

4. **`RegistroNominaViewSet` permitía editar/borrar recibos ya emitidos sin
   auditoría**, y `monto_cestaticket`/`bono_usd`/`tasa_pago_bono` no tenían
   `MinValueValidator` (permitían negativos). Corregido: el viewset ahora solo
   acepta `GET`/`POST` (`http_method_names`), y los tres campos tienen
   `MinValueValidator(0)`.

5. **Crash sin manejar si no hay `ParametroLegalNomina` vigente** —
   `calcular_deducciones()` hacía `Decimal * None` (`TypeError`) si no había
   parámetros configurados para el período, tumbando la generación completa
   del lote sin un mensaje útil. Corregido: ahora lanza `ValidationError` con
   mensaje explícito, y `generar_lote` la traduce a un 400 legible.

6. **`cobranza/views.py::EmitirSolvenciaManualView` tenía un método `put()`
   ajeno pegado por error** (probablemente un mal corte/pegado), que
   referenciaba `self.CLAVE` — atributo que no existe en esa clase (hubiera
   lanzado `AttributeError` si alguna vez se invocaba `PUT` sobre
   `emitir-solvencia-manual/`). Ese `put()` en realidad implementaba el guardado
   de `ConfigNominaView` (config de cesta ticket), que solo tenía `GET` — por
   lo que el botón "Guardar" de configuración de nómina en `Pagos.jsx` siempre
   fallaba con 405. Corregido moviendo el método a la clase correcta.

7. **Configuración de cesta ticket migrada de `localStorage` al backend** —
   decisión explícita del usuario. `constants/avec.js::loadCestaConfig/
   saveCestaConfig` ahora son `async` y usan `GET`/`PUT
   cobranza/config-nomina/` (el mismo endpoint que ya usaba `Pagos.jsx`, ahora
   arreglado — ver punto 6) en vez de `localStorage`. Se actualizó
   `ParametroGlobal.valor` de `CharField(max_length=255)` a `TextField` (el
   JSON de cesta ticket con las 7 categorías docentes supera fácilmente 255
   caracteres, lo que habría truncado/corrompido el guardado). `useRecibo.js`
   se adaptó al nuevo contrato async (antes llamaba `loadCestaConfig()` de
   forma síncrona dentro de un `useMemo`).

### 🟠 ALTO — resueltos

8. **Datos institucionales de un colegio específico hardcodeados en 4 lugares**
   (`nominaPDF.js` ×3, `ReceiptPreview.jsx` ×1) — dirección, RIF, teléfonos.
   Rompía el multi-tenant del SaaS: cualquier otro colegio recibía recibos con
   los datos de este colegio. Corregido: `useInstitucionPDF.js` ahora expone
   también `direccion`, `municipioEstado`, `telefono`, `rif` (ya existían como
   campos de `ConfiguracionSistema`, solo faltaba exponerlos), con los mismos
   valores que estaban hardcodeados como *fallback* — ningún colegio existente
   ve un cambio visual hasta que complete su propia ficha en Configuración.
   Se propagó el prop `institucion` también a `Recibos.jsx`/`ReceiptPreview.jsx`
   (antes no lo recibía en absoluto). El texto "AFILIADO A LA ASOCIACIÓN
   VENEZOLANA DE EDUCACIÓN CATÓLICA" y el "Código DEA" (sin campo de
   configuración disponible) se dejaron como boilerplate/omitidos — si se
   necesita parametrizar el código DEA por colegio, falta agregar el campo a
   `ConfiguracionSistema`.

9. **`rrhh/views.py::get_choices` devolvía una lista hardcodeada** de cargos
   distinta a `Empleado.TIPOS_PERSONAL` y al modelo `TipoCargo` ya existente
   (con su propio endpoint). Corregido: ahora lee `TipoCargo.objects.filter
   (activo=True)`. `Empleado.cargo` se dejó como texto libre (decisión
   explícita del usuario) — no se migró a FK.

10. **Matching de banco Bancaribe por texto/prefijo hardcodeado**
    (`numero_cuenta__startswith='0114'` / `banco__nombre__icontains=
    'bancaribe'`) en `preview_bancaribe`. Se agregó `BancoNomina.
    codigo_bancario` (campo nuevo, migración `rrhh/0009`) y se sumó como
    condición adicional (`banco__codigo_bancario='0114'`) sin quitar las
    anteriores — 100% aditivo, cero riesgo de dejar de matchear bancos ya
    configurados por nombre. Se agregó el campo al modal de banco en
    `Configuracion.jsx`.

11. **Baja de empleados como `DELETE` físico** — ver punto 3 (mismo fix).

12. **`nomina/tests.py` estaba vacío** (solo boilerplate) en un módulo
    financiero. Se agregaron 10 tests cubriendo: crash sin parámetro legal,
    pensionado sin deducciones, redondeo comercial, duplicado de
    `empleado_rrhh` bloqueado, permisos de `generar_lote`, lote con cero
    empleados, lote con período sin parámetros (400 limpio), y
    edición/borrado deshabilitados en `RegistroNominaViewSet`.

13. **Sincronización RRHH→Nómina sin `transaction.atomic()`** — ver punto 2
    (mismo fix, envuelto en `with transaction.atomic()`).

### 🟡 MEDIO — resueltos

14. **`Decimal.quantize()` sin `rounding` explícito** (usaba `ROUND_HALF_EVEN`
    por defecto) en `nomina/models.py`. Se agregó un helper `redondear()` con
    `ROUND_HALF_UP` explícito (redondeo comercial, el criterio usual en
    nómina) y se aplicó en los 3 puntos de cálculo monetario.

15. **Bug adicional encontrado durante el fix (no estaba en el reporte de
    auditoría original)**: `HistorialRecibos.jsx` (usado por el botón
    "Recibo" de `Nomina.jsx`) filtraba `nomina/registros/?empleado=<id>`
    pasando el `id` del empleado de **RRHH**, pero ese filtro busca por el
    `id` del empleado de **nómina** — son tablas con PKs independientes. El
    historial de recibos y la descarga de PDF estaban efectivamente rotos
    (vacíos o con datos de otro empleado) desde la página principal de
    Nómina. Corregido: se agregó el filtro `empleado_rrhh` a
    `RegistroNominaViewSet.get_queryset` y `HistorialRecibos.jsx` ahora lo usa.
    También se formatearon las fechas del historial con `date-fns`/locale
    `es` (antes mostraba `mes/año` como números crudos), cumpliendo la regla
    del proyecto.

16. **`RegistroNominaSerializer.get_empleado_rrhh_nombre` era código muerto**
    (el método existía pero el campo nunca se declaró como
    `SerializerMethodField`, así que DRF nunca lo llamaba) — y además, al
    declararlo, se descubrió que referenciaba `obj.empleado_rrhh_id`
    directamente sobre `RegistroNomina`, que no tiene ese campo (está en
    `RegistroNomina.empleado.empleado_rrhh`). Ambos corregidos.

### Pendiente — decisiones explícitas del usuario de NO implementar ahora

- **Dos sistemas de cálculo de nómina en paralelo** (backend con
  `ParametroLegalNomina`/SSO+LPH vs. frontend AVEC con SSO/SPF/FAOV
  hardcodeados en `constants/avec.js`, usado para los recibos AVEC/legacy).
  El usuario decidió explícitamente **no unificarlos** en esta pasada — alto
  riesgo de romper el flujo AVEC ya en uso sin pruebas exhaustivas. Se
  corrigieron los bugs de cada lado por separado (redondeo, validaciones,
  crash), pero la causa raíz (dos fuentes de verdad para el mismo cálculo)
  sigue latente. Migración recomendada a futuro: que el frontend deje de
  recalcular y solo pinte lo que devuelve el backend.
- **`nomina.ConceptoNomina` sigue huérfano** — modelo existente
  (asignaciones/deducciones configurables) sin conectar a
  `RegistroNomina.calcular_deducciones()`. El usuario decidió explícitamente
  dejarlo anotado, no implementar el motor de conceptos ni eliminar el
  modelo en esta pasada.
- **`empleado_rrhh` sigue siendo `ForeignKey`, no `OneToOneField`** a nivel
  de BD — se agregó la validación a nivel de aplicación (punto 2 arriba) como
  mitigación inmediata sin migración de datos. Promoverlo a `OneToOneField`
  real requiere primero auditar si ya existen duplicados en la BD de
  producción (una migración con `unique=True` fallaría si los hay); no se
  hizo en esta pasada por el riesgo de tocar el schema sin esa auditoría previa.

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

1. **`GenerarAnualidadView` usa año calendario, no período escolar** — ✅ RESUELTO (verificado 2026-08-24)
   `GenerarAnualidadView` ya no existe en el código (fue eliminada en un commit
   posterior a esta nota). Toda generación de mensualidades pasa por
   `cobranza.services.generar_mensualidades`, que lee siempre
   `ConfiguracionSistema.fecha_inicio_ano_escolar`/`fecha_fin_ano_escolar` — ya
   sea que el período escolar sea Sep–Jul, Sep 2026–Ago 2027, o cualquier otro
   rango configurado, sin año calendario fijo. Confirmado también que ningún
   reporte de cobranza (`BusinessIntelligenceTab`, `ClasificacionPagosTab`,
   `CierreCajaTab`, etc.) asume Ene–Dic: solo etiquetan mes/año reales que
   devuelve el backend.

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

---

# FASE 4 — SEGUIMIENTO GRÁFICO (2026-07-28)

Backend: `academico/services.py` (nuevo) con `calcular_rendimiento_alumno`,
`calcular_rendimiento_seccion` y `generar_alertas_rendimiento`; modelo
`AlertaRendimiento` (único modelo nuevo); vistas admin
(`RendimientoAlumnoView`/`RendimientoSeccionView`/`AlertasRendimientoView`,
`IsAdminOrAbove`) y vista portal (`RendimientoAlumnoPortalView`,
`PortalJWTAuthentication`, mismo patrón que `comunicacion/urls_portal.py`);
cron Celery diario (`alertas-rendimiento-diario`, 6am). Frontend: `recharts`
(aprobado por el usuario sobre `chart.js`); página admin `/rendimiento`
(mapa de calor + alertas) y `/portal/rendimiento` (gráficas del representante,
reutilizando `EstudianteSelector`). 32 tests de `academico` pasando (11 nuevos
de esta fase). Verificado en navegador (admin + portal, datos de prueba
creados y eliminados en la misma sesión — no había ningún `Lapso`/`Nota` real
cargado en la BD antes de esta verificación, igual que se documentó en Fase 3).

1. **Umbral aprobatorio fijo en 10 (escala 0-20)**, no configurable — el
   `Configuracion.promedio_minimo_aprobatorio` que proponía `TRD.md` v1 no
   existe como campo real (`secretaria.ConfiguracionSistema` no lo tiene) y
   agregarlo habría sido un modelo/campo nuevo fuera del alcance aprobado
   (que solo contemplaba `AlertaRendimiento`). Si el colegio pide un umbral
   configurable por grado/materia, agregar el campo a `ConfiguracionSistema`
   y reemplazar la constante `UMBRAL_APROBATORIO` en `academico/services.py`
   por una lectura de configuración.

2. **La asistencia del endpoint `rendimiento/alumno/{id}/` es global, no por
   lapso** — `Asistencia` no tiene FK a `Lapso`/`Materia` (solo `alumno` +
   `fecha`), así que el porcentaje mostrado en el portal es acumulado de
   todo el historial del alumno, no del lapso seleccionado. Coincide con el
   ejemplo de respuesta de `TRD.md`, pero si más adelante se quiere
   asistencia por lapso, `calcular_rendimiento_alumno` tendría que filtrar
   `Asistencia.fecha` contra `Lapso.fecha_inicio/fecha_fin` (el dato ya
   existe, solo falta acotar la consulta).

3. **`AlertasRiesgoList` (admin) no tiene drill-down al perfil del alumno**
   — el flujo v1 (`APP_FLOW.md`) sugería "click → perfil del alumno con
   gráficas detalladas", pero no existe hoy una ruta de "ficha de alumno"
   navegable por `id` fuera de `ListaAlumnos.jsx` (que abre el drawer desde
   estado local, no desde una URL). Se dejó fuera del alcance aprobado por
   simplicidad; si se pide, lo más simple es agregar un parámetro de query a
   `ListaAlumnos` (`?abrir=<alumno_id>`) que abra `SidebarFichaAlumno`
   automáticamente al montar.

4. **Bottom nav del portal pasó de 5 a 6 íconos** (`PortalLayout.jsx`) al
   agregar "Rendimiento". Verificado en 375px sin overflow horizontal, pero
   es el límite razonable de íconos en una fila con `justify-around` sin
   rediseñar el patrón de navegación — si se agrega una Fase 6/7 con otra
   sección de nivel superior en el portal, conviene migrar a un menú "Más"
   en vez de seguir sumando íconos.

---

# FASE 6 — PWA + PUSH (2026-07-28)

Se agregó instalabilidad (`vite-plugin-pwa`, manifest, Service Worker con
Workbox) y notificaciones Web Push (`pywebpush`/`py-vapid`, VAPID) para el
Portal de Representantes. Respeta el límite de íconos del punto 4 anterior:
en vez de una 7ma sección en el bottom nav, la activación vive en un prompt
no bloqueante (`NotificacionesModal.jsx`, 10s post-login) y la gestión de
tipos activos se agregó dentro de la página "Ajustes" ya existente
(`PortalCambiarContrasena.jsx`).

1. **`cffi` estaba roto en el venv de desarrollo antes de esta fase**
   (`ModuleNotFoundError: No módulo _cffi_backend` al importar
   `cryptography.hazmat`) — la instalación existente de `cffi==2.0.0` no
   tenía el binario compilado para Python 3.14 en Windows. No lo causó esta
   fase (nadie importaba `cryptography.hazmat` directamente hasta que
   `py-vapid` lo necesitó), pero bloqueaba generar las claves VAPID.
   **Corregido**: `pip install --force-reinstall cffi` resolvió a `2.1.0`,
   que sí trae el binario; `requirements.txt` actualizado a esa versión. Si
   el mismo error reaparece en otro entorno (otro Python/SO), es el mismo
   fix.

2. **`SuscripcionPushView.get()` es un endpoint agregado sobre la marcha**,
   no estaba en el plan original (que solo contemplaba POST/DELETE/PATCH) —
   se necesitó para que la UI de toggles en Ajustes pudiera inicializar su
   estado (saber si ya hay una suscripción activa y qué tipos tiene). Devuelve
   el estado agregado de la cuenta (primera suscripción activa encontrada),
   no por dispositivo — coherente con que `PATCH .../tipos/` también aplica
   a todas las suscripciones activas del representante, no a una sola.

3. **Íconos del manifest (`public/icons/icon-192.png`, `icon-512.png`) son
   un placeholder generado automáticamente** (recorte/centrado de
   `public/favicon.png`, que no es un ícono cuadrado ni pensado para esto).
   Funcional para que el manifest sea instalable, pero conviene reemplazarlos
   por un ícono cuadrado diseñado a propósito cuando el colegio/diseño lo
   defina.

4. **`favicon.png` (fuente, 7MB) y cualquier logo de colegio subido por API
   quedaron fuera del precache** (`globIgnores: ['**/*.png']` en
   `vite.config.js`) porque excedían el límite de 2MB de Workbox y rompían
   el build (`generateSW`). Se sirven igual vía la regla de runtime caching
   `CacheFirst` para imágenes — solo cambia que no quedan disponibles la
   primera vez sin conexión (edge case aceptable para un logo, no para el
   shell de la app). Si se agregan íconos PWA adicionales más pesados,
   revisar si siguen cayendo bajo este `globIgnores` accidentalmente.

5. **Envío real de push no se pudo probar end-to-end en este entorno**
   (requiere HTTPS válido; `localhost` alcanza para registrar el SW y crear
   la suscripción, pero varios navegadores exigen un origen seguro real para
   que el push efectivamente llegue). Verificado hasta donde el entorno lo
   permite: suscripción se registra correctamente en `SuscripcionPush`
   (backend), `enviar_push()` maneja 410/404 marcando `activa=False` (test
   unitario), y el flujo de negocio (circular/mensaje/pago/mora día 5-10)
   llama a `_push_representante()` sin romper el envío por email/WhatsApp
   existente aunque no haya suscripción o VAPID no esté configurado
   (`_vapid_configurado()` corta antes de intentar). Falta prueba real en
   el colegio piloto con HTTPS.

6. **Push "nota cargada" no está conectado a ningún evento real todavía** —
   `tipos_activos` default incluye `'nota'` (siguiendo el diseño de
   `docs/PLAN_EXPANSION_V2.md`/UI brief), pero no existe hoy ningún punto en
   el código que dispare una notificación al cargar/actualizar una
   calificación (ni por email, ni por push) — es tema de Fase 3 (Portal
   Docente), que todavía no tiene ese hook. Cuando se conecte, seguir el
   mismo patrón de `_push_representante(usuario_portal, 'nota', ...)` usado
   para los otros 3 tipos.

7. **`PortalLayout.jsx` importa `user` de `usePortalAuth()` sin usarlo**
   (`no-unused-vars` de eslint) — preexistente a esta fase (no lo tocamos,
   confirmado con `git diff` antes de anotar), se dejó igual por estar fuera
   del alcance pedido. Si se toca ese archivo de nuevo, aprovechar para
   quitar la variable o usarla.

---

# PORTAL DOCENTE — MÓDULO SEPARADO (2026-08-03)

A pedido explícito del usuario, se extrajo el "Portal Docente" (que hasta ahora
vivía dentro del panel administrativo, reutilizando `/login` y el JWT admin,
según `docs/PLAN_EXPANSION_V2.md` Fase 3) a un módulo completamente separado,
espejando la arquitectura del portal de representantes: login propio
(`/portal-docente/login`), JWT propio en localStorage (`docente_token`/
`docente_refresh_token`), rutas protegidas independientes.

**Esto reintroduce a propósito lo que el plan v2 había evitado**: un segundo
flujo de login/refresh a mantener en frontend. La decisión fue explícitamente
solicitada por el usuario tras una pregunta de confirmación, no un default.

## Qué se hizo

- **Backend** (`academico/views.py` + `academico/urls_portal_docente.py`,
  montado en `config/urls.py` bajo `api/portal-docente/`): `DocenteTokenView`
  (login, reutiliza `MyTokenObtainPairSerializer` sin duplicar emisión de JWT),
  `DocenteTokenRefreshView`, `DocenteCambiarContrasenaView`. Las vistas de
  negocio existentes (`DocenteMisMateriasView`, notas, asistencia, materiales,
  incidentes) **no se tocaron** — ya autorizan leyendo `request.user.perfil.rol`
  en vivo de la BD, por lo que aceptan cualquier JWT válido del usuario sin
  importar qué endpoint lo emitió.
- **Frontend**: módulo nuevo `src/portal-docente/` (client axios, contexto de
  auth, ruta protegida, layout mobile-first, login, mis materias, detalle de
  materia con tabs Notas/Asistencia/Material, mensajes, incidentes, cambiar
  contraseña). Rutas montadas en `App.jsx`, `DocenteAuthProvider` agregado a
  `AppProviders.jsx`.
- Se **eliminaron** `src/pages/MisMaterias.jsx`, `GestionMateria.jsx`,
  `Mensajes.jsx` (admin), `hooks/useMisMaterias.js`, `hooks/useMensajes.js`,
  `components/mensajes/ListaConversaciones.jsx` y `ModalNuevaConversacion.jsx`
  del panel admin — quedaron 100% reemplazados por sus equivalentes en
  `portal-docente/` y ya no tenían ningún caller tras retirar `ROLES.DOCENTE`
  de las rutas del panel admin. `ChatMensajes.jsx` se conservó (se reutiliza
  desde ambos portales).
- Se retiró `ROLES.DOCENTE` de `allowedRoles` en las rutas admin de
  `inscripciones`, `alumnos`, `representantes`, `notas`, `asistencia`,
  `incidentes` (`App.jsx`) y de los ítems correspondientes de `Sidebar.jsx`.

## Deuda técnica / riesgo conocido, no resuelto en esta fase

1. **El docente podía seguir autenticándose por `/login` (admin)** — ✅ RESUELTO
   en la misma pasada. `LoginView.post()` (`authentication/views.py`) ahora
   rechaza con 403 cualquier login cuyo `perfil.rol == 'docente'` (mismo
   criterio que `AdminJWTAuthentication` ya aplicaba para `representante`,
   pero a nivel de emisión de token, no solo de validación posterior). El
   docente solo puede obtener un JWT desde `/api/portal-docente/login/`.
   Tests: `academico.tests.DocenteBloqueadoEnLoginAdminTests` (2/2 OK) —
   confirma 403 para docente y 200 sin cambios para otros roles.

2. **No existe endpoint "alumnos de mi sección" dedicado para el docente**
   — `useAlumnosSeccion.js` (portal-docente) reutiliza el roster que ya
   devuelve `AsistenciaView` del día actual (siempre incluye a todos los
   alumnos del grado, tengan o no asistencia marcada) para poblar los
   selectores de alumno en "Nuevo incidente" y "Nueva conversación". Funciona,
   pero acopla dos features (selector de alumnos, asistencia) a un endpoint
   pensado para otra cosa. Si se agrega un endpoint real de roster, migrar
   este hook.

3. **`comunicacion/mensajes/` sin `alumno_id` devuelve una bandeja plana de
   mensajes individuales, no conversaciones agrupadas** — `DocenteMensajes.jsx`
   agrupa del lado del cliente (`useDocenteConversaciones.js`) por
   `alumno_id`, calculando último mensaje y no-leídos en JS. Con volumen alto
   de mensajes esto puede volverse costoso; considerar un endpoint de
   conversaciones agregadas en el backend si el volumen lo justifica.

4. **`IncidenteDisciplinario.adjunto` es `ImageField` (no acepta PDF)** —
   documentado en la UI (`accept="image/*"`), pero si en algún momento se
   quiere adjuntar un documento (ej. informe médico), el modelo no lo permite
   hoy.

5. **Sin branding dinámico del colegio en `DocenteLayout.jsx`** — a
   diferencia de `PortalLayout.jsx` (portal representantes), que lee colores
   del colegio vía `getConfigColegio()`, el portal docente usa un color fijo
   (`#0fa3b1`) vía variable CSS `--docente-primary`. No se conectó a
   propósito (no fue pedido); fácil de enchufar al mismo endpoint cuando se
   necesite.

Verificación: `python manage.py test academico comunicacion authentication`
→ 50/50 OK. `npm run build` limpio (Vite + PWA). `eslint` sobre los archivos
nuevos solo reporta `react-hooks/set-state-in-effect`/preserve-memoization,
el mismo patrón preexistente ya presente en `src/portal/` (representantes) —
no es una regresión de esta fase, es deuda técnica sistémica del proyecto.

**2026-08-03 — `pywebpush`/`redis` instalados en el venv**: estaban listados
en `requirements.txt` (`pywebpush==2.3.0`, `redis==8.0.0`) pero no instalados
en este entorno, causando 5 errores en la suite completa
(`notificaciones.tests.EnviarPushTests`, `portal.tests.RecordatoriosCobranzaTests`)
no relacionados con el portal docente. Instalados con la versión exacta que
pide `requirements.txt`; los 5 tests ahora pasan (6/6 incluyendo uno
adicional del mismo módulo). Quedan sin resolver, preexistentes y fuera de
alcance: los 2 fallos de `portal.tests` (comprobantes) y el de
`secretaria.tests` (N+1 queries) documentados arriba en este archivo.

**2026-08-03 — Bug crítico encontrado y corregido: usuarios nuevos quedaban
inactivos al crearlos desde Sistemas** (`authentication/serializers.py`,
`UserSerializer.create()`). Detectado al verificar el pedido del usuario de
que "si se registra un usuario como docente, debería tener acceso al portal
docente de inmediato": un test end-to-end (crear usuario vía
`POST /api/authentication/users/` → login inmediato) falló con 401
"Credenciales incorrectas". Causa raíz: DRF completa el campo `is_active`
con `False` cuando no viene en el body del request (comportamiento de
`BooleanField` con `required=False`, que **no** hereda el `default=True` del
modelo Django) — y `Sistemas.jsx` nunca envía ese campo al crear un usuario.
Esto afectaba a **cualquier rol**, no solo docente: todo usuario creado desde
el panel de Sistemas quedaba inactivo silenciosamente y no podía iniciar
sesión (ni en el panel admin ni, para docentes, en el portal) hasta que
alguien lo activara manualmente — sin ningún error visible en el momento de
la creación (el `POST` responde 201 igual). Corregido: `create()` ahora
fuerza `is_active=True` explícitamente cuando el campo no vino en el request
crudo (`self.initial_data`), respetando el valor si alguna vez se envía a
propósito. Test de regresión:
`academico.tests.DocenteRegistroYAccesoPortalTests` (crea un docente vía el
endpoint real de Sistemas y hace login inmediato contra
`/api/portal-docente/login/`). Verificado con
`python manage.py test authentication academico usuarios secretaria` →
51/52 OK (el único fallo es el de N+1 en `secretaria`, preexistente y no
relacionado).

## PORTAL DOCENTE — REDISEÑO DASHBOARD (widgets) 2026-08-03

Rediseño de `/portal-docente` (dashboard) a layout de widgets: rail lateral
en desktop (`DesktopRail.jsx`, solo `md+`, mismos íconos del bottom nav
móvil), grid de 2 columnas en `DocenteDashboard.jsx`, widgets extraídos a
`src/portal-docente/components/widgets/`. Mobile-first sin cambios de
comportamiento (stack vertical + bottom nav fija, sin rail).

- **Endpoint nuevo**: `GET /api/academico/docente/mi-horario/?limite=N`
  (`DocenteMiHorarioView` en `academico/views.py`) — devuelve las próximas
  clases del docente autenticado usando el modelo `HorarioClase` ya
  existente (antes solo se consultaba por `grado_seccion`, no había vista
  scoped por docente). Requiere rol `docente`.
- `MateriaDocenteSerializer` ahora incluye `cantidad_alumnos`
  (`Alumno.objects.filter(grado_seccion=...).count()`) para alimentar el
  widget de perfil docente. Es un count por sección, no por inscripción
  real a la materia — si en el futuro una materia no cubre a toda la
  sección, este número quedará impreciso.
- `useDocenteConversaciones` ahora también expone `mensajes` (la lista
  plana sin agrupar, ya se descartaba tras agrupar por conversación) —
  usado por `WidgetActividadSemana` para contar mensajes por día. El
  conteo de "incidentes" en ese widget es por `fecha` de registro, no por
  fecha del incidente en sí si difieren.
- 🟡 `--docente-primary` nunca estaba definida en `:root` (siempre caía al
  fallback hardcodeado `#0fa3b1`). Se agregó `--docente-primary: #0fa3b1;`
  en `index.css`. Sigue habiendo hex literal `#0fa3b1` repetido en varios
  componentes (Tailwind arbitrary values `text-[#0fa3b1]` no puede
  referenciar la variable CSS directamente) — no se migró todo a la
  variable en este cambio, fuera de alcance.
- 🟡 `WidgetMateriasTabla` introduce el primer patrón de "tabla" real del
  módulo docente (encabezado de columnas visible desde `md`); el resto de
  las páginas (`DocenteMaterias`, `DocenteMensajes`, `DocenteIncidentes`)
  siguen usando listas de cards. Si se agregan más tablas, conviene
  extraer un componente `<DataTable>` compartido en vez de repetir el
  patrón grid a mano.
- 🟢 Pendiente, no implementado: paginar `proximasClases` más allá del
  límite fijo pasado al hook (`useDocenteHorarioSemana(4)` en el
  dashboard) — suficiente para un widget resumen, pero si se reutiliza en
  una página de horario completo habría que quitar el límite o agregar
  paginación real.

## PORTAL DOCENTE — DASHBOARD v2: paleta, grid 12 columnas, módulo de eventos 2026-08-03

Segunda iteración sobre el rediseño anterior, a pedido del usuario tras ver
capturas del primer resultado: layout tipo grid de 12 columnas (inspirado en
un dashboard de referencia con sidebar + hero + widgets), nueva paleta de
color, acciones rápidas y un módulo nuevo de eventos de calendario.

- **Paleta**: se reemplazó el teal `#0fa3b1` por un índigo/violeta
  (`--docente-primary: #5b5fef`, `--docente-primary-dark: #4a4dd6`,
  `--docente-bg: #f6f6fb`) en `index.css`. **Alcance deliberadamente
  limitado**: se migró el chrome compartido (`DocenteLayout`, `DesktopRail`),
  todos los widgets del dashboard, y las dos páginas a las que apuntan las
  nuevas "Acciones rápidas" (`DocenteIncidentes.jsx`, `DocenteMensajes.jsx`,
  porque ya se estaban tocando para el auto-open de modal). **No** se tocó
  `DocenteLogin.jsx`, `DocenteMaterias.jsx`, `DocenteMateriaDetalle.jsx`,
  `DocenteCambiarContrasena.jsx` ni `components/mensajes/ChatMensajes.jsx`
  (compartido con el portal de representantes) — siguen en teal literal
  `#0fa3b1`. Esto deja una inconsistencia visual real entre el dashboard/nav
  y esas páginas hasta que se decida repintar el resto del portal.
- **Módulo de eventos de calendario** (nuevo, alcance acotado a "recordatorios
  personales del docente", no un calendario académico institucional):
  - Modelo `EventoCalendario` (`academico/models.py`, migración
    `0010_eventocalendario`): `propietario` (FK a `AUTH_USER_MODEL`),
    `titulo`, `fecha`, `hora` (opcional), `descripcion`, `tipo`.
  - Endpoints: `GET/POST academico/eventos-calendario/?mes=&anio=`,
    `DELETE academico/eventos-calendario/<pk>/`. **No están gateados por rol
    "docente"** — cualquier usuario autenticado puede crear/listar sus
    propios eventos (filtrado por `propietario=request.user`), a diferencia
    del resto de endpoints del portal docente que sí verifican
    `_get_rol(request) == 'docente'`. Decisión deliberada para que el modelo
    sea reutilizable si en el futuro se quiere el mismo widget en el panel
    admin — revisar si esto es aceptable o si se prefiere restringirlo.
  - `WidgetCalendario.jsx` ahora tiene navegación de mes (antes solo
    mostraba el mes actual, sin poder navegar), indicador de eventos por
    día, panel de eventos del día seleccionado con borrado, y botón "+"
    que abre `ModalNuevoEvento.jsx`.
- **Acciones rápidas** (`WidgetAccionesRapidas.jsx`): en vez de solo
  enlazar a las páginas de Incidentes/Mensajes, usa `<Link state={{nuevo:
  true}}>` y ambas páginas destino ahora leen `location.state?.nuevo` en un
  `useEffect` para auto-abrir su modal existente al llegar navegando desde
  el dashboard (y limpian el state con `navigate(..., {replace:true})` para
  que un refresh de página no reabra el modal). Patrón nuevo en el módulo
  docente — si se agregan más accesos directos similares, conviene
  extraerlo a un hook pequeño en vez de repetir el `useEffect` en cada
  página destino.
- **Hero** ahora también muestra la próxima clase (reutiliza
  `useDocenteHorarioSemana`, primer elemento de la lista) en vez de solo el
  ícono decorativo que tenía antes.
- 🟡 Pendiente: si se decide adoptar la paleta índigo en todo el portal
  docente (y potencialmente en el portal de representantes, que comparte
  `ChatMensajes.jsx`), conviene hacer un barrido completo reemplazando los
  literales `#0fa3b1`/`#0d93a0` restantes por las variables CSS, en vez de
  ir migrando archivo por archivo cada vez que se tocan por otro motivo.
  — ✅ **SUPERADO 2026-08-03**: se confirmó que el índigo era un bug, no una
  decisión de diseño (ver sección siguiente). Ya no aplica.

---

# REDISEÑO PREMIUM + MÓDULO DE PERFIL — PORTAL DOCENTE (2026-08-03)

Implementado con dos agentes en paralelo (backend/frontend) a partir de un plan
previamente validado y aprobado por el usuario. Resumen consolidado de deuda
técnica detectada; no se resolvió nada de lo listado acá, solo se anota.

## Bug de color corregido (no es deuda, es el fix)

`--docente-primary`/`--docente-primary-dark`/`--docente-bg` en `index.css`
estaban en índigo/violeta (`#5b5fef`/`#4a4dd6`/`#f6f6fb`) por error de
copiado/generación, en vez del teal de marca `#0fa3b1` usado en el resto de
la plataforma. Corregido a `#0fa3b1`/`#0c828d`/`#e8f8fa`. Se reemplazaron
también los hardcodes `#0fa3b1`/`#0d93a0` en `DocenteLogin.jsx`,
`DocenteMaterias.jsx`, `DocenteMateriaDetalle.jsx` y
`DocenteCambiarContrasena.jsx` por las variables CSS correspondientes, para
que todo el módulo lea de una sola fuente de verdad.

## Backend — módulo de perfil (`authentication/`, `academico/`)

1. **`validar_tamano_adjunto` ahora está triplicada** (antes duplicada en
   `academico/models.py` y `comunicacion/models.py`, ahora también en
   `authentication/models.py` para el campo `PerfilUsuario.foto`). Decisión
   consciente de no centralizarla en esta pasada, siguiendo el patrón ya
   aceptado en el proyecto — pero cada nuevo campo de adjunto que se agregue
   hace más urgente extraerla a un `core/validators.py` compartido.
2. **`DocenteMiPerfilView.patch` escribe por `setattr`/`save(update_fields=...)`
   en vez de pasar por un serializer de escritura dedicado** — es correcto
   funcionalmente (solo 3 campos planos, sin relaciones), pero es el único
   endpoint del portal docente que no sigue el patrón "serializer valida y
   guarda" que usa el resto de vistas de escritura del proyecto. Si el campo
   editable crece (ej. teléfono, más validaciones), conviene migrarlo a un
   `UserUpdateSerializer` explícito.
3. **`PerfilUsuario.foto` se sirve como URL relativa** (`/media/perfiles/...`),
   no absoluta — mismo comportamiento que `IncidenteDisciplinario.adjunto` y
   `MaterialEstudio.archivo` (ningún serializer del proyecto recibe `request`
   en su `context`, así que DRF nunca arma `build_absolute_uri`). Funciona
   hoy porque en el entorno real frontend/backend/media quedan detrás del
   mismo origen; en un `vite dev` local sin proxy configurado hacia el
   backend, estas URLs relativas no resuelven. Es un comportamiento
   preexistente (ya afectaba a los adjuntos de incidentes/materiales antes
   de esta tarea), no una regresión nueva — pero si algún día se quiere que
   funcione en dev sin proxy, hay que pasar `context={'request': request}`
   en las vistas y usar URLs absolutas de forma consistente en todo el
   proyecto, no solo acá.

## Frontend — rediseño + perfil (`portal-docente/`)

1. **`WidgetPerfilDocente.jsx` ahora llama a `useDocentePerfil()` internamente**
   solo para leer `foto`, en vez de recibirla como prop desde
   `DocenteDashboard.jsx` — evita tocar el resto del dashboard, pero significa
   que el widget dispara su propio `GET mi-perfil/` independiente del resto
   de la carga del dashboard (una request adicional en cada visita al
   dashboard). Si se nota impacto de performance, considerar levantar el
   estado del perfil a un contexto compartido (similar a `DocenteAuthContext`)
   en vez de que cada consumidor pida su propia copia.
2. **`WidgetMateriasTabla.jsx` no muestra pill de estado "Activa"** — se
   consideró parte de las reglas de diseño premium (pills semánticas), pero
   el shape de datos actual (`MateriaDocenteSerializer`) no expone ningún
   campo de estado más allá de que la vista ya filtra `activa=True` — no se
   inventó el dato. Si se quiere el pill, habría que agregar el campo al
   serializer del backend primero.
3. **Lint preexistente sin resolver**: `useDocentePerfil.js` (nuevo) replica
   el patrón `react-hooks/set-state-in-effect` que ya generan todos los
   demás hooks del portal docente (~107 warnings preexistentes en el
   proyecto, no introducidos por esta tarea) — mismo criterio que ya se
   documentó como pendiente en el módulo Nómina (ver arriba).

---

# PLAN DE EVALUACIÓN — MATERIAS NUMÉRICAS/LITERALES Y APORTE EREC (2026-08-03)

Sistema nuevo y opcional por materia+lapso (coexiste con `Nota`/`evaluacion_1..4`,
que sigue siendo el fallback para materias sin plan configurado). Implementado
con 3 agentes en paralelo (backend + 2 frontend) a partir de un plan validado
con el usuario. Resumen de deuda técnica y limitaciones conocidas; no se
resolvió nada de lo listado, solo se anota.

## Backend (`academico/`)

1. **Modelos nuevos**: `PlanEvaluacion` → `BloqueEvaluacion` (suma/promedio,
   o letra si la materia es literal) → `ItemEvaluacion` → `NotaItemEvaluacion`.
   `Materia` ganó `tipo_evaluacion` ('numerica'|'literal'),
   `aporta_a_todas_las_materias` (bool — el "Puntos EREC") y
   `cuenta_para_promedio` (bool). Migración `0011_bloqueevaluacion_...`.
2. ✅ **RESUELTO (2026-08-03)** — `cuenta_para_promedio` ya está conectado:
   `BoletinView` ahora incluye también las materias con `PlanEvaluacion`
   (antes desaparecían del boletín por completo, porque solo se leía el
   modelo `Nota` viejo — bug real detectado al conectar esto, no solo el
   flag pendiente) y expone `cuenta_para_promedio`/`definitiva_letra` por
   materia. `useBoletin.js::promedioGeneral` y
   `boletinPdf.js::calcularPromedio` excluyen las materias marcadas
   `cuenta_para_promedio=false`, y `Boletin.jsx`/`boletinPdf.js` muestran la
   letra en la columna "Definitiva" cuando la materia es literal.
3. **Materias literales con `aporta_a_todas_las_materias=True`** (caso raro,
   no debería ocurrir en la práctica): el modelo lo permite pero
   `calcular_plan_notas` las excluye del mecanismo de aporte a otras
   materias (solo aportan materias `tipo_evaluacion='numerica'`) — no se
   resolvió por ser un caso límite fuera de lo pedido.
4. **Desempate de moda en letras** (`_moda_letras`, `academico/services.py`):
   ante empate, gana la primera letra en orden de aparición de los ítems del
   bloque (por `orden`, luego `id`) — criterio arbitrario documentado en el
   código, no hay regla de negocio definida para este caso.
5. **`DocenteMiPerfilView`-style de validación**: el endpoint de notas
   (`POST plan-evaluacion/notas/`) valida por fila (no 403 global) que el
   `item_id` pertenezca al plan de la `materia_id`/`lapso_id` declarados —
   consistente, pero es el único endpoint bulk del portal docente con ese
   nivel de validación por fila; si se agregan más endpoints bulk similares,
   conviene extraer el patrón a un helper reutilizable en vez de
   reimplementarlo cada vez.
6. **Decimales serializados como string** (`"7.00"` en vez de `7.0`) en las
   respuestas de notas — comportamiento estándar de DRF con `DecimalField`,
   consistente con el resto del proyecto (`Nota.definitiva` ya se comporta
   igual), no es un bug nuevo, pero el frontend debe seguir parseando con
   `Number()`/`parseFloat()` en vez de asumir tipo numérico nativo del JSON.

## Frontend

1. **Admin de Materias** (`ModalMateria.jsx`): se agregaron los 3 campos
   nuevos al formulario; el checkbox "aporta a todas las materias" no tiene
   ninguna validación cruzada en el frontend (ej. no avisa si ya hay otra
   materia del mismo grado con el flag activo, lo cual podría ser confuso
   si dos materias EREC-like coexisten sin querer) — deuda menor, no
   bloqueante.
2. **`PlanEvaluacionPanel.jsx`**: la edición de un plan existente reutiliza
   el mismo builder que la creación (precargado), en vez de una UI de
   edición inline distinta — decisión consciente para no duplicar
   formularios, pero significa que cualquier cambio chico (ej. renombrar un
   bloque) abre el flujo completo de edición.
3. **Decisión explícita (2026-08-04): el roster de la tabla de notas NO
   reutiliza `useAlumnosSeccion`**, a pesar de que se pidió evaluarlo. Viene
   directo de `GET plan-evaluacion/notas/` (`alumnos[]`), calculado en el
   backend por `calcular_plan_notas` a partir de
   `Alumno.objects.filter(grado_seccion=materia.grado_seccion)` — es una
   fuente más confiable que `useAlumnosSeccion` (que deriva el roster
   reutilizando el endpoint de asistencia *del día actual*, así que un
   alumno sin asistencia registrada hoy podría faltar del roster). Se
   mantienen dos fuentes de roster distintas en el módulo docente a
   propósito: si algún día divergen de forma visible (ej. un alumno
   aparece en notas pero no en asistencia), la fuente canónica para
   "alumnos de la sección" debería ser la de `calcular_plan_notas`
   (filtra directo por `grado_seccion`, sin depender de si se pasó lista
   ese día), y valdría la pena migrar `useAlumnosSeccion` a ese mismo
   criterio en vez de asistencia.
4. **Recalculo de totales en cliente** (`calcTotalBloque` en
   `PlanEvaluacionPanel.jsx`) es solo feedback inmediato mientras se tipea;
   el total real que ve el docente tras guardar viene de un refetch a
   `GET plan-evaluacion/notas/`, que ahora sí trae el desglose por ítem
   (`notas_items`, agregado en una segunda pasada tras detectar que faltaba
   — ver commit/cambio en `academico/services.py`). Si alguna vez el cálculo
   cliente y el del backend divergen (ej. redondeo), el backend es la
   fuente de verdad.
5. ✅ **RESUELTO (2026-08-03)** — Hero-slider, slide "Evaluaciones próximas":
   se agregó `GET /api/academico/docente/proximas-evaluaciones/?limite=`
   (nuevo, `academico/views.py::DocenteProximasEvaluacionesView`) que lista
   `ItemEvaluacion` con `fecha >= hoy` de cualquier materia del docente,
   ordenados por fecha. Conectado vía `useDocenteProximasEvaluaciones.js` →
   `DocenteDashboard.jsx` → `WidgetHero.jsx`. Nota: no valida que el ítem
   pertenezca a un lapso activo (muestra evaluaciones futuras de cualquier
   lapso con fecha cargada) — límite conocido, no se consideró relevante
   para un slide informativo del dashboard.

---

# AUDITORÍA — MÓDULO PLANES DE EVALUACIÓN Y CARGA DE NOTAS (2026-08-04)

El módulo ya existía (backend + la pestaña "Plan de Evaluación" en
`DocenteMateriaDetalle.jsx`, construidos en la pasada anterior) — esta fue
una auditoría contra un checklist de seguridad/negocio, no una reconstrucción.
Se encontraron 2 gaps reales de seguridad y 2 gaps de negocio, corregidos en
esta pasada; el resto del checklist ya se cumplía.

## Gaps de seguridad corregidos (🔴 — exposición real de datos, no solo UX)

1. **`PlanEvaluacionView.get()` no validaba ownership.** Cualquier docente
   autenticado podía leer la estructura completa (bloques, ítems, valores
   máximos) del plan de evaluación de una materia ajena con solo cambiar
   `materia_id` en la URL — la restricción "solo el docente dueño" solo
   se aplicaba en POST/PATCH, no en GET. Corregido: `get()` ahora llama a
   `_verificar_permiso` igual que los métodos de escritura.
2. **`PlanEvaluacionNotasView.get()` no validaba ownership en absoluto.**
   Peor que el anterior: exponía las notas reales de los alumnos (no solo
   estructura) de cualquier materia a cualquier docente autenticado, sin
   ningún chequeo de rol ni de `Materia.docente_id`. Corregido: mismo
   criterio que el resto del módulo (secretaria+ sin restricción, o docente
   dueño de la materia).

Ambos eran el tipo exacto de problema que el pedido advertía evitar
("filtrar por esto a nivel de queryset, no solo ocultar en el frontend") —
el frontend nunca mostraba el botón/ruta para ver una materia ajena, pero
el endpoint sí la servía si se llamaba directo.

## Gaps de negocio corregidos

3. **Lapso cerrado (`activo=False`) no se validaba en el backend.**
   El frontend deshabilitaba el botón "Guardar notas" cuando `!lapsoActivo`,
   pero (a) el botón "Guardar plan de evaluación" del builder no tenía esa
   misma restricción, y (b) nada lo impedía a nivel de API — un request
   directo (o un bug de UI) podía crear/editar planes o notas en un lapso
   cerrado. Decisión tomada (documentada, no implícita): **se bloquea a
   nivel de API con 409**, tanto en `PlanEvaluacionView` (POST/PATCH) como
   en `PlanEvaluacionNotasView` (POST) — mismo código de estado que ya usa
   el 409 de "plan ya existe". El frontend ahora también deshabilita el
   botón de guardar plan (antes solo el de notas) y muestra un aviso
   ámbar explicando por qué. **Nota de alcance**: el endpoint legado
   equivalente (`NotasGradoView.post`, sistema `Nota`/`evaluacion_1..4`)
   tiene el mismo gap y NO se tocó — está fuera de lo pedido en esta
   pasada, pero es la misma clase de problema y debería recibir el mismo
   fix si se vuelve a auditar ese endpoint.
4. **`NotaItemEvaluacion` no tenía auditoría de cambios.** `Nota` (el
   modelo legado equivalente) sí tiene `HistoricalRecords`. Decisión
   tomada: agregarla, por el mismo criterio de sensibilidad ante disputas
   de calificación — migración `0012_historicalnotaitemevaluacion`
   aplicada.
5. **Guardado de notas sin manejo de error granular.** El backend siempre
   respondía `200` con `{guardadas, errores}` incluso si TODAS las filas
   fallaban (ej. `item_id` de otra materia), pero el frontend
   (`useDocentePlanEvaluacion.js::guardarNotas`) solo miraba si la
   promesa HTTP resolvía o rechazaba — nunca inspeccionaba el body, así
   que mostraba "Notas guardadas correctamente" aunque el guardado real
   hubiera fallado por completo. Corregido: el hook ahora distingue éxito
   total / parcial / total-fallido con toasts distintos, y
   `PlanEvaluacionPanel.jsx` resalta en rojo (con `title` explicando el
   motivo) las celdas puntuales que fallaron, usando `alumno_id`+`item_id`
   de la respuesta.

## Puntos del checklist ya cumplidos sin cambios (verificado, no asumido)

- **Filtrado por `Materia.docente == request.user`**: correcto en todos los
  métodos de escritura desde la implementación original; el gap era solo
  en los dos GET (ver arriba).
- **Reutiliza `calcular_plan_notas`**, no hay cálculo duplicado en frontend
  ni en otro endpoint.
- **UI respeta `tipo_evaluacion` sin mezclar formatos**: `PlanEvaluacionPanel`
  bifurca completamente entre modo numérico (inputs + `valor_maximo`) y
  literal (`select` A/B/C), nunca ambos a la vez.
- **El docente no puede cambiar el sistema de evaluación**: `tipo_evaluacion`
  solo es editable desde `ModalMateria.jsx` (admin de Materias/Horarios,
  fuera del portal docente); el portal docente detecta el sistema vigente
  leyendo el campo, no lo expone como opción.
- **No se duplicaron serializers/vistas**: `PlanEvaluacionSerializer`,
  `PlanEvaluacionInputSerializer`, `NotaItemBulkSerializer`, etc. son los
  únicos existentes, reutilizados tal cual desde la implementación
  original.
- **Mobile de la grilla de notas**: decisión explícita (no "ya se verá"):
  tabla con `overflow-x-auto` + primera columna (nombre del alumno)
  `sticky left-0`, en vez de una vista alternativa de tarjeta-por-alumno.
  Se mantiene así porque el número de ítems por bloque suele ser chico
  (2-5) y el scroll horizontal con columna fija es un patrón ya usado en
  otras tablas del proyecto (`WidgetMateriasTabla.jsx`); si algún colegio
  termina con bloques de muchos ítems, reevaluar una vista de tarjetas.

---

# AUDITORÍA FUNCIONAL — ACADÉMICO / PORTAL REPRESENTANTES / PORTAL DOCENTES (2026-08-24)

Auditoría de solo lectura (3 exploraciones paralelas), sin implementar ninguna
corrección. Ver mensaje de la conversación para el reporte completo con el plan
priorizado; aquí solo queda la deuda técnica y los bugs para seguimiento futuro.

## Módulo académico — Gestión de materias

1. 🔴 **Alto — Asignación docente↔materia rota de punta a punta.**
   `ModalMateria.jsx` no tiene campo `docente`, y aunque lo tuviera,
   `MateriaSerializer.docente_id` (`academico/serializers.py:16-18`) es
   `PrimaryKeyRelatedField(source='docente', read_only=True)` — el backend
   ignora ese campo en POST/PUT. Hoy la única forma de asignar un docente a
   una materia es el admin de Django. Bloquea operación normal del colegio
   (secretaría no puede asignar docentes sin acceso a `/admin`).
2. 🟠 Medio — Doble sistema de notas coexistiendo: `Nota` clásico y el nuevo
   `PlanEvaluacion`/`BloqueEvaluacion`/`ItemEvaluacion` conviven sin
   enforcement automático de exclusividad por materia+lapso (solo un
   comentario en `models.py:180-182` advierte no mezclarlos). Riesgo de
   datos contradictorios si alguien usa ambos para la misma materia.
3. 🟡 Bajo — `grado_seccion` en `Materia` es un string libre acoplado
   implícitamente a `ConfiguracionGrado.grado_seccion` (app `secretaria`),
   sin FK real ni validación de integridad referencial entre apps.
4. 🟡 Bajo — `octopus-api/urls.py` (raíz) es código muerto: no es el
   `ROOT_URLCONF` real (`config/urls.py` lo es) y puede confundir a quien
   audite rutas por primera vez.

## Portal de representantes

5. 🟠 **Medio — Bug de paginación silencioso en historial de pagos.**
   `PortalHistorialPagosView.get` (`portal/views.py:433-440`) responde con
   la clave `total_pages`, pero `PortalHistorialPagos.jsx:83-88` solo lee
   `data.count`/`data.total_paginas` — ninguna existe en la respuesta real,
   así que `totalPaginas` queda fijo en `1` y los controles
   Anterior/Siguiente nunca se muestran aunque haya más de una página de
   pagos. No lanza error, solo oculta silenciosamente la paginación.
6. 🟡 Bajo — `portal_token` (JWT de acceso) sigue en `localStorage`,
   expuesto a XSS — ya reconocido explícitamente como deuda en el propio
   comentario de `portalClient.js:8-15` (mitigado solo por CSP en servidor).
7. 🟡 Bajo — `portal.service.js` mezcla las llamadas del flujo financiero
   (mensualidades) con las de cantina (`RecargarTarjetaModal`,
   `SaldoTarjetaCard`, etc.) en un mismo archivo — "god file" de API calls
   del portal, cohesivo pero creciendo sin separación por dominio.
8. 🟢 Info — No hay un listado dedicado de "mis comprobantes" en el portal
   (el estado Pendiente/Aprobado/Rechazado solo se ve indirecto vía
   `estatus` en el historial de pagos); parece decisión de diseño (la
   revisión Aprobar/Rechazar vive en el panel admin), pero vale confirmar
   con el negocio si el representante debería ver ese detalle directamente.

## Portal de docentes

9. 🟡 Bajo — No hay endpoint dedicado "alumnos de mi sección/materia": el
   frontend (`academico.service.js:91-96`) reutiliza `AsistenciaView` como
   roster de alumnos, acoplamiento implícito y frágil ante cambios en esa
   vista.
10. 🟢 Info — `portal-docente/context/` existe en el frontend pero está
    vacía — vestigio de un diseño de auth separada que se descartó (el
    login real es el unificado `/login` con `ProtectedRoute` +
    `allowedRoles`, confirmado también por el comentario en
    `academico/urls_portal_docente.py:5-7`). Limpiar la carpeta evitaría
    confusión futura sobre si existe o no un login propio del portal
    docente.
11. 🟢 Info — El portal docente no está aislado como microfrontend: importa
    directamente componentes compartidos genéricos (`../../components/notas/TablaNotas`,
    `../../components/asistencia/FilaAlumno`, `../../portal/components/SkeletonCard`).
    Es una decisión de reuso razonable, no un bug, pero documentarlo evita
    que alguien intente separarlo sin darse cuenta del acoplamiento.

## Conclusión de completitud (referencia rápida)

- **Módulo académico (materias)**: CRUD de materias funcional end-to-end
  (backend + `Horarios.jsx`/`ModalMateria.jsx`), pero **sin asignación de
  docente vía UI/API** — gap crítico de Fase 2. Notas, asistencia, horarios
  (con generador automático) y boletín PDF ya existen y están conectados.
- **Portal de representantes**: ~95% funcional end-to-end; único hallazgo
  real es el bug de paginación del historial (#5), de bajo esfuerzo para
  corregir.
- **Portal de docentes**: ~85-90% completo — no es un login a dashboard
  vacío; notas, asistencia, plan de evaluación, mensajería con
  representantes, incidentes y perfil están conectados a endpoints reales
  con permisos por rol/asignación.

---

# DIAGNÓSTICO — CONTROL DE ESTUDIO: NOTAS, BOLETINES, ASISTENCIA, HORARIOS (2026-08-24)

Auditoría de solo lectura del flujo completo de notas, boletines PDF,
asistencia y horarios (backend Django + frontend React), a pedido del
usuario, previa a mejoras de UX. No se modificó código. Nota: al momento de
esta auditoría había cambios sin commitear en `academico/serializers.py`,
`views.py`, `tests.py` y `ModalMateria.jsx`/`useHorarios.js` (+140/-10
líneas) que parecen estar resolviendo, en curso, el gap "sin asignación de
docente vía UI/API" ya anotado en la sección anterior — no se tocaron ni se
asumió que ya estén terminados.

## Hallazgos por área

| Sev. | Área | Archivo:línea | Descripción | Impacto |
|---|---|---|---|---|
| 🔴 Alto | Horarios | `views.py:1089-1182` (`GenerarHorarioView.post`) vs `ModalGenerador.jsx:14,58,208` | El generador automático de horarios **ignora silenciosamente** `clases_bloqueadas` y `recesos` (múltiples) que el frontend sí envía y le promete al usuario en el propio modal ("el generador las respetará y no las moverá"). Solo lee `recreo_hora`/`recreo_duracion_min` singulares. Si `reemplazar_existente=True`, borra **todas** las clases del grado (`views.py:1155-1158`), incluidas las que la UI dijo que "no se moverían". | El docente arma bloques que no quiere que el generador toque, ejecuta "generar", y esas clases se borran igual — pérdida de trabajo manual con una promesa de UI incumplida. Es el hallazgo más grave porque es silencioso: no hay error, el sistema simplemente no hace lo que dijo que haría. |
| 🔴 Alto | Horarios | `views.py:679-736` (creación/edición manual) + `models.py:360-366` | No existe validación de choque de horario **docente** ni **aula** en creación/edición manual, ni server-side ni completa en frontend. `useHorarios.js:80-87` solo detecta choque de mismo día+hora exacta **dentro del mismo grado** — no compara rangos parciales, no consulta otros grados, no valida aula. El generador automático (`_rangos_se_solapan`, `views.py:910-918`) sí valida solape de docente entre grados, pero solo ahí, no en la edición manual. | Un docente puede quedar asignado a dos secciones distintas en el mismo bloque horario si se edita manualmente, sin ningún aviso — inconsistencia grave para la operación real del colegio. |
| 🟠 Medio | Notas | `views.py:391-466` (`NotasGradoView.post`) vs `views.py:2098-2102`/`1918-1924` (Plan de Evaluación) | El sistema **clásico** de notas no valida `lapso.activo` server-side — el bloqueo de "lapso cerrado" es únicamente `disabled` en el frontend (`Notas.jsx:177`, `TablaNotas.jsx:89`), evadible con una llamada directa a la API. El sistema de **Plan de Evaluación** sí lo valida en el backend. Inconsistencia entre los dos sistemas de notas que conviven. | Un docente (o cualquier llamada directa a la API) puede modificar notas de un lapso ya cerrado sin que el backend lo impida, en el flujo "clásico" únicamente. |
| 🟠 Medio | Notas | `models.py:180-182` (comentario) vs modelo/serializer | El comentario en el modelo dice que el sistema clásico (`Nota.evaluacion_1..4`) y el Plan de Evaluación **nunca deben coexistir** para la misma materia+lapso, pero nada a nivel de modelo/serializer lo fuerza. | Riesgo de que una materia termine con datos en ambos sistemas simultáneamente (ej. por error de configuración), generando boletines o reportes inconsistentes sin que nada lo detecte. |
| 🟡 Bajo | Notas | Sin ubicación específica (ausencia) | No hay validación de "materia sin docente asignado" al cargar notas — ni frontend ni backend. Se puede cargar notas para una materia que no tiene docente. | Bajo impacto práctico hoy (probablemente el flujo de asignación de docente, en desarrollo según los cambios sin commitear, mitigue esto pronto), pero vale revisar una vez cerrado ese gap. |
| 🟡 Bajo | Boletines | `views.py:742-867` (`BoletinView.get`) | El boletín se genera correctamente desde un único endpoint agregado (sin riesgo de desincronización entre llamadas), pero no valida si el lapso ya cerró ni lo indica en el PDF — se puede generar un boletín "en vivo" con notas que aún pueden cambiar, sin ninguna marca de "provisional". | Confusión potencial si un representante o docente genera/imprime un boletín antes del cierre real del lapso y las notas cambian después. |
| 🟡 Bajo | Asistencia | `Asistencia.jsx:1-4,24` (react-datepicker) vs `ResumenAsistenciaView` (`views.py:591-642`) | El filtro con `react-datepicker` en la pantalla de carga solo permite un **día puntual**, no rango — coherente con que la carga es por día, pero el resumen (lectura) sí opera por mes. No es un bug, pero es una limitación de UX si el usuario quiere revisar/corregir varios días seguidos sin navegar uno por uno. | Fricción menor de UX, no de datos. |
| 🟢 Info | Horarios | `models.py:345-349` (`HorarioClase.materia`, CASCADE) vs `views.py:268-280` (`MateriaDetailView.delete`, soft-delete) | La vista de la API hace soft-delete de materias, pero el modelo sigue con `on_delete=CASCADE` real. Borrar una `Materia` desde el admin de Django (no la vista) elimina en cascada notas e historial de horario — mismo patrón de riesgo ya documentado para otros modelos en este archivo (representante→alumno, `on_delete` inconsistente en cobranza). | Pérdida de datos solo si alguien usa el admin de Django directamente en vez del endpoint; bajo riesgo de ocurrencia pero alto impacto si pasa. |
| 🟢 Info | Transversal | `RendimientoAlumnoView`, `RendimientoSeccionView`, `AlertasRendimientoView` (`urls.py:63-65`) | Endpoints backend sin consumidor evidente en `academico.service.js` — parecen pensados para un módulo de "seguimiento gráfico" no implementado aún, o abandonado. | Código muerto o funcionalidad pendiente de conectar; confirmar con el negocio cuál es el caso. |
| 🟢 Info | Transversal | `Boletin.jsx` (comparado con `TablaNotas`/`GrillaHorario`/`SkeletonFila`) | No tiene skeleton loader propio, a diferencia del resto del módulo académico que sí lo adoptó como patrón. | Inconsistencia de UX menor, fácil de corregir siguiendo el patrón ya establecido (`SkeletonFila.jsx`). |

## Fortalezas confirmadas (no requieren acción)

- Carga de **notas** y **asistencia** ya es bulk por grado/sección en un solo submit (no hay fricción de "un alumno a la vez"): `NotasGradoView.post`, `PlanEvaluacionNotasView.post`, `AsistenciaView.post`.
- Validación de rango de nota (0-20) presente en ambos lados (frontend y backend).
- Todas las llamadas Axios revisadas en los hooks del módulo (`useNotas`, `useAsistencia`, `useHorarios`, `useDocentes`, `useBoletin`) usan try/catch + `react-toastify` correctamente.
- Auditoría de cambios de notas vía `HistoricalRecords` (`Nota`, `NotaItemEvaluacion`), expuesta a director/sistemas.
- Scoping por sección del docente en asistencia validado server-side con tests dedicados.

## Propuesta priorizada (sin implementar — a la espera de tu aprobación)

**Rápidas (bajo esfuerzo, alto valor):**
1. Backend: agregar validación de `lapso.activo` en `NotasGradoView.post`, igual que ya existe en Plan de Evaluación — cierra el gap de seguridad más simple de los dos sistemas de notas.
2. Skeleton loader en `Boletin.jsx` siguiendo el patrón de `SkeletonFila.jsx`.
3. Indicar en el PDF del boletín si el lapso sigue abierto ("Boletín provisional — lapso en curso") cuando `lapso.activo` sea `True`.

**Estructurales (requieren más diseño/pruebas):**
4. Corregir el generador de horarios para que realmente respete `clases_bloqueadas` y `recesos` (múltiples), o si se decide simplificar el alcance, quitar esa promesa de la UI del modal para que no mienta sobre el comportamiento real — cualquiera de las dos opciones es aceptable, pero el estado actual (promesa + comportamiento distinto) no lo es.
5. Agregar validación de choque de horario docente/aula en creación y edición **manual** (no solo en el generador automático), tanto en backend (fuente de verdad) como en frontend (feedback inmediato).
6. Definir y aplicar una constraint real (a nivel de modelo o validación fuerte en el serializer) que impida que una materia+lapso tenga datos en el sistema clásico y en Plan de Evaluación simultáneamente.

Sugiero empezar por los ítems 1 y 4 primero: el primero es una línea de validación de bajo riesgo, y el 4 es el hallazgo más grave (una promesa de UI que el backend no cumple, con pérdida de datos real).

---

# AUDITORÍA COMERCIAL — FUNCIONES VENDIDAS VS. ESTADO REAL (2026-08-27)

Auditoría de solo lectura (6 exploraciones en paralelo) comparando la lista de
funciones y beneficios usada para vender los planes Básico/Intermedio/Premium
contra el código real de `octopus-api` y `octopus-frontend`, más conteo de
clics de los flujos más frecuentes. No se modificó código de producto.

## Hallazgos por área

| Sev. | Área | Archivo:línea | Descripción | Impacto |
|---|---|---|---|---|
| 🔴 Alto | Cobranza | `cobranza/models.py:509` (`CierreCaja`), sin view/URL | "Cierre de caja diario con control de lotes" (función vendida) no existe como flujo operativo: el modelo `CierreCaja` no tiene ningún endpoint que lo cree. El componente frontend `CierreCajaTab.jsx` es solo un reporte de lectura (`auditoria-diaria/`), no permite declarar monto contado ni cerrar el día. | Se vende una función de arqueo/control diario que hoy es inalcanzable desde el producto — riesgo directo si un cliente la pide en demo. |
| 🔴 Alto | Nómina/RRHH | `nomina/models.py` (motor legal correcto, sin admin/viewset) vs `constants/avec.js` + `ReciboModal.jsx` (UI real) | El cálculo automático de SSO 4%/LPH 1%/cesta ticket/bonos USD **sí existe** pero en un módulo backend sin ningún endpoint de creación (`nomina/admin.py` vacío, sin viewset). La UI que el usuario realmente usa hace el mismo cálculo duplicado **en JavaScript** (`avec.js:65-68`) y genera el PDF client-side sin guardar nada en el servidor: no hay "nómina del período" como entidad, no hay historial de recibos, la tasa BCV y el monto de cesta ticket se tipean a mano en cada recibo en vez de traerse de `cobranza.TasaCambio`. Además `rrhh.Empleado` y `nomina.Empleado` son dos fichas de personal distintas, vinculadas solo manualmente. | No hay "generar nómina del mes" en lote; se repite el proceso manual empleado por empleado, sin registro server-side ni recalculo automático real (el signal que sí lo hace en `nomina/models.py:106-122` es código muerto porque nunca se crea un `RegistroNomina`). Alto riesgo de error humano y de tasa desactualizada. |
| 🔴 Alto | Recordatorios de cobranza | `portal/tasks.py` (activa) vs `notificaciones/tasks.py`/`services.py` (completa pero no conectada) | Hay **dos implementaciones paralelas** del flujo día 0/5/10/15. La que realmente corre (`portal/tasks.py`, disparada por signal + Celery Beat) manda texto plano, no usa las plantillas HTML ya creadas y **no registra nada en `NotificacionLog`**. La otra (`notificaciones/tasks.py::task_notificar_mora`) sí usa plantillas HTML, sí loguea, y ya tiene **WhatsApp real implementado** (Twilio + Meta Business API, no placeholder) — pero nada la llama (0 referencias fuera de su propia definición). | El director/staff no ve en el panel ningún recordatorio de cobranza enviado (la pantalla de trazabilidad de `Configuracion.jsx` queda ciega para este flujo). Y el WhatsApp que se vende como "ya preparado para conectar" en realidad ya está terminado y funcional, solo desconectado — cambiar de tasks module sería la vía más rápida a producción, no reescribir desde cero. |
| 🟠 Medio | Cobranza | `cobranza/models.py:22-41` (`TransferenciaInterna`) | "Transferencias internas entre cuentas del colegio" (función vendida) es un modelo sin ningún view/endpoint — huérfano. | Función vendida inexistente en la práctica. |
| 🟠 Medio | Cobranza | `pages/Morosos.jsx:10` (`COL_HEADERS`) vs `cobranza/mora.py:150-153` | "Reporte de morosos con días de atraso" solo calcula meses vencidos, no días; la tabla del frontend no tiene columna de días de atraso. | El usuario debe inferir manualmente la gravedad de la mora en vez de verla directamente, contrario a lo prometido. |
| 🟠 Medio | Portal representantes | `PortalDashboard.jsx`, `PortalHistorialPagos.jsx`, `PortalRendimiento.jsx`, `PortalMensajes.jsx`, `PortalCantina.jsx` | El selector de hijo (para representantes con varios hijos) es un `useState` local independiente en cada una de las 5 páginas, siempre reinicializado en `alumnos[0]`, sin contexto compartido ni persistencia en URL/localStorage. | Con 2+ hijos, ver la deuda del hijo B, luego sus notas y luego su cantina obliga a re-seleccionar el mismo hijo en cada sección visitada — fricción de clics directamente evitable. |
| 🟡 Bajo | Asistencia | `useAsistencia.js`/`FilaAlumno.jsx` (ausencia) | No existe acción masiva "marcar todos presentes" ni atajos de teclado por fila; para una sección de 30 alumnos son 30 clics mínimo aunque la mayoría esté presente. | Fricción de clics alta en el flujo diario más repetido del módulo académico. |
| 🟡 Bajo | Notas | `TablaNotas.jsx:3-4` vs `PlanEvaluacionPanel.jsx` (portal-docente) | Dos sistemas de notas paralelos y desconectados: el flujo admin/secretaría (`Notas.jsx`) usa 4 evaluaciones fijas hardcodeadas; el modelo configurable de ítems/bloques (`PlanEvaluacion`) prometido en la venta solo tiene UI en el portal-docente. | Riesgo de inconsistencia de datos entre ambos sistemas para la misma materia/lapso; ya señalado también en la auditoría del 2026-08-24 de este archivo. |
| 🟡 Bajo | Auditoría del sistema | `Auditoria.jsx:338-346` → `cobranza/views.py:811-855` (`ExportarAuditoriaExcelView`) | El botón "Exportar Excel" de la pantalla de Auditoría exporta **pagos (`Pago`)**, no el log de acciones administrativas (`LogAuditoria`). La bitácora real sí existe, tiene filtro de fecha y búsqueda en frontend, pero no tiene filtro por módulo en backend, está capada a 200 registros sin paginación real, y el login vía JWT no se audita (inconsistencia ya anotada en `NOTAS_TECNICAS.md:615-617`). | "Exportación de reportes de auditoría a Excel" (función vendida) no exporta lo que dice exportar. |
| 🟡 Bajo | Cantina | `CantinaPOS.jsx` (ausencia) | No hay botón de "abrir caja" al inicio del turno — el cajero puede vender sin haber declarado apertura, dificultando el arqueo. Confirmación de "saldo negativo" y "confirmar identidad" son dos checkboxes secuenciales que podrían fusionarse cuando aplican juntos. | Fricción de clics menor; riesgo de arqueo impreciso. |
| 🟢 Info | Cobranza | `ClasificacionPagoBatchCreateView` / `ClasificacionBatchModal.jsx` | Acción masiva de clasificación de pagos ya implementada — buen ejemplo a replicar en asistencia y nómina. | Ninguno, es una fortaleza. |
| 🟢 Info | Cantina | `ScannerProducto.jsx` | Escaneo por código de barras ya implementado en el POS. | Ninguno, es una fortaleza. |
| 🟢 Info | Multisede | `multisede/` (modelos, views, `SedeSwitcher.jsx`) | No es un placeholder vacío: tiene modelos, endpoints y componentes reales en desarrollo activo, más adelantado de lo esperado para Fase 3. | Ninguno, contexto para priorización. |
| 🟢 Info | Menú principal | `Sidebar.jsx` | 21 ítems en 6 secciones agrupadas por dominio (Principal, Finanzas, Académico, Comunicación, Multi-Sede, Sistema), filtradas por rol — no está sobrecargado ni plano. | Ninguno, no requiere reorganización. |

## Propuesta priorizada (sin implementar — a la espera de tu aprobación)

**Rápidas (bajo esfuerzo, alto valor):**
1. ✅ **Resuelto (2026-08-27).** `portal/tasks.py` ya no duplica el envío: `enviar_notificacion_dia_0/5/10/15` delegan en `notificaciones.tasks.task_notificar_mora` (plantillas HTML, log en `NotificacionLog` y WhatsApp Twilio/Meta ya funcionando). Además, los días de cada hito (antes fijos en 5/10/15) ahora son configurables desde `ConfiguracionNotificaciones` (campos `dias_recordatorio_1/2`, `dias_alerta_director`), expuestos en el panel de Configuración de Notificaciones — cambiarlos no requiere deploy. Nota de comportamiento: la alerta de día 15 ahora la recibe solo el director (antes también se le mandaba un email al representante desde `portal/tasks.py`); si el negocio prefiere que el representante también reciba ese último aviso, hay que ajustarlo en `notificaciones/services.py::notificar_mora`.
2. Compartir el `alumnoActivo` del portal de representantes vía Context/URL param entre las 5 páginas — elimina la re-selección repetida.
3. Agregar columna de "días de atraso" en `Morosos.jsx` (el dato ya se puede derivar de `mora.py`).
4. Botón "Marcar todos presentes" + excepciones en `Asistencia.jsx`, siguiendo el patrón ya validado de `ClasificacionBatchModal`.
5. Corregir `ExportarAuditoriaExcelView` para que exporte `LogAuditoria`, no `Pago` (o renombrar el botón si el negocio prefiere mantenerlo como está).

**Estructurales (requieren más diseño/decisión de negocio):**
6. Decidir el futuro de `CierreCaja`: implementar el flujo real de arqueo (declarar monto contado, validación de director, bloqueo de ediciones) o renombrar `CierreCajaTab.jsx` para dejar de prometer algo que no hace.
7. Unificar `rrhh.Empleado` y `nomina.Empleado`, y conectar el motor de cálculo legal (`nomina/models.py`) a un flujo real de "generar nómina del mes en lote" con persistencia server-side, reemplazando el cálculo duplicado en `avec.js`.
8. Dar de alta el endpoint faltante para `TransferenciaInterna`, o quitar esa función de la lista comercial si no se va a construir.
9. Definir si el sistema de Notas "clásico" y el de Plan de Evaluación conviven a propósito o si uno debe reemplazar al otro (mismo hallazgo que el diagnóstico del 2026-08-24 de este archivo, ítem 6).

Los ítems 1 y 3 son los de mejor relación esfuerzo/impacto: el primero activa una función (WhatsApp) que ya está construida y pagada en horas de desarrollo, y el segundo es un cambio de una columna con datos que ya existen en el backend.

## MÓDULO DOCENTE (2026-08-28) — solo anotado, no implementado

Deuda detectada al construir `academico.Docente` (perfil de docente separado de
`Materia.docente`, que sigue apuntando a `AUTH_USER_MODEL`):

1. **Sin ViewSet/router en `academico`** — Materia y ahora Docente se sirven con
   `APIView` + `path()` explícitos en `urls.py`, no con `ModelViewSet` + router
   DRF. Es consistente con el resto de la app, pero significa que cualquier
   endpoint nuevo repite a mano el boilerplate de permisos/paginación/filtros
   que un router+viewset resolvería una sola vez. Cambiarlo ahora sería un
   refactor grande fuera de alcance de esta tarea.
2. **Sin filtro de sede real en `MateriasView`/`DocentesView`** — el modelo
   `Materia` ya tiene FK a `multisede.Sede` desde antes, y `Docente` la agrega
   también (D4 del pedido), pero ninguna de las dos vistas de listado filtra
   automáticamente por la sede del usuario autenticado — solo aceptan
   `?sede=<id>` opcional. Si multi-sede pasa a ser estricto, falta ese
   scoping automático en ambos endpoints.
3. **`useDocentes()` vs `useDocentesAdmin()`** — quedaron dos hooks distintos:
   uno liviano de solo-lectura para pickers (`useDocentes`, usado por
   `ModalMateria`) y otro con el CRUD completo (`useDocentesAdmin`, usado por
   `Docentes.jsx`). Es deliberado (evita que el picker cargue lógica de
   guardado que no usa), pero ambos golpean el mismo endpoint
   `academico/docentes/` — si se necesita cachear la lista en el futuro,
   conviene unificarlos con algo tipo React Query en vez de duplicar el
   fetch.
4bis. **Los 6 `Docente` creados por el backfill apuntan a usuarios con
   `is_active=False`** — es decir, esas cuentas ya estaban desactivadas/
   "eliminadas" en el sistema (ver `authentication/views.py:269`, el borrado
   de usuario es lógico vía `is_active=False`). `DocentesView.get()` ahora
   filtra `user__is_active=True` (fix del 2026-08-28, ver commit de API),
   así que el listado de Docentes y el selector en Materias van a aparecer
   **vacíos** hasta que existan usuarios con rol 'docente' realmente activos.
   Esto es correcto — antes del fix, se podían asignar materias a cuentas ya
   dadas de baja — pero puede sorprender si no se sabe la causa.
4. **Backfill (`sincronizar_docentes`) dejó 4 de 6 docentes sin `empleado`
   enlazado** — el emparejamiento por email o cédula/username no encontró
   coincidencia clara para `mmolina`, `beatrizleal`, `nelidaguanipa` y
   `anarelis16`. Requiere revisión manual desde el admin de Django
   (`/admin/academico/docente/`) para enlazar el `rrhh.Empleado` correcto de
   cada uno, o corregir los correos/usernames para que coincidan.

---

## ESTÁNDAR RESPONSIVE — dónde vive la norma

La deuda de responsive dejó de anotarse como hallazgo suelto: la norma
permanente está en `CLAUDE.md`, sección **ESTÁNDAR DE DISEÑO RESPONSIVE**
(breakpoints, tamaños de referencia, componentes obligatorios `ui/Modal.jsx` y
`ui/TablaScroll.jsx`, excepciones declaradas y criterio de aceptación).

## AUDITORÍA RESPONSIVE 2026-08-28 — resultado

Barrido completo del panel admin, académico, comunicación, sitio/cantina y
login en los 4 tamaños de referencia (360×640, 768×1024, 1366×768, 1920×1080).
Detalle pantalla por pantalla en el informe de la sesión (tabla del PASO 3).
Resumen de lo que quedó frágil o sin verificar:

- **Cantina (`CantinaLayout.jsx`)** — layout desktop-first documentado en el
  propio código (comentario explícito: "se opera desde una PC/tablet fija en
  la cantina"). A 360px el sidebar fijo de 240px deja ~120px de contenido:
  el botón "Nuevo producto" en Inventario queda visualmente cortado (su borde
  derecho cae 26px fuera del viewport), aunque se verificó que sigue siendo
  100% clickable en la porción visible. Cumple la excepción declarada en
  CLAUDE.md ("en 360px basta con que nada quede inalcanzable"), pero es un
  layout frágil: si se agrega contenido con textos más largos a esa franja
  de 120px, sí podría volverse inalcanzable. No se tocó — es una decisión de
  diseño explícita, no un bug.
- **Reportes** (7 pestañas, no 4 como decía el pedido original: Cierre de
  Caja, Conciliación, Clasificación de Pagos, Corrección de Pagos, Histórico
  Mensual, Business Intelligence, Puntualidad) — las 7 se verificaron a
  360×640. A 768/1366/1920 solo se re-verificó la pestaña Business
  Intelligence (mayor riesgo por gráficos). Las otras 6 pestañas en esos 3
  tamaños quedan sin re-confirmar (aunque comparten el mismo contenedor y
  patrones que BI, por lo que el riesgo real es bajo).
- **Portal de representantes (`/portal/*`)** — **NO VERIFICADO en ningún
  tamaño**. No había credenciales de prueba; se generaron 28 cuentas nuevas
  vía `python manage.py crear_usuarios_portal` (representante existente,
  usuario = cédula, password inicial = cédula), pero el login devolvió
  `400 Bad Request — "Credenciales incorrectas o acceso no habilitado."` pese
  a que `check_password` confirma la contraseña correcta desde el shell de
  Django. No se investigó la causa (podría ser el flag `debe_cambiar_password`,
  una validación adicional de rol en el serializer de `portal/views.py`, o
  algo del lado de `esta_activo`) — la auditoría se cortó antes de resolverlo
  a pedido del usuario. **Quedan 28 cuentas de prueba en la base de datos
  local** (`RepresentanteUser` con contraseña = cédula del representante);
  conviene revisar si conviene desactivarlas o dejarlas para depurar el login
  fallido más adelante.
- **Cobranza** (paso 2 — registrar pago) y **Cantina · Tarjetas/Reportes a
  360px** no se verificaron por falta de datos de prueba / tiempo — quedan
  como NO VERIFICADOS explícitos en el informe, no como "OK" supuesto.
- Un error 401 aislado apareció en consola en Cantina · Tarjetas a 1920px
  (no relacionado a layout, probablemente una llamada de fondo con token
  vencido); no se investigó por estar fuera del alcance de esta auditoría.
Aquí solo se anotan incumplimientos concretos pendientes de corregir.

---

# MIGRACIÓN VISUAL A PRIMITIVAS COMPARTIDAS (Card/PageHeader/Tabla) — bloques 1-3

Progreso de la migración de pantallas del panel administrativo a las
primitivas `src/components/ui/{Card,PageHeader,Tabla,TablaScroll,Modal}.jsx`.
Verificación estática únicamente (build + lint + grep) por indicación
expresa del usuario — sin auditoría visual en navegador.

## Hallazgo previo: primitivas sin commit

`Card.jsx`, `PageHeader.jsx` y `Tabla.jsx` llevaban commiteadas las pantallas
que ya las usaban (Dashboard, ListaAlumnos, Morosos, Cobranza) pero las
primitivas mismas nunca se habían commiteado — quedaban sueltas en el
working tree. Si alguien hubiera hecho `git stash`/clonado limpio, esas
pantallas ya "migradas" habrían roto el build por import faltante. Corregido
commiteando las 3 primitivas en un commit separado antes de seguir.

## Bloque 2 (completo): Comprobantes.jsx, Pagos.jsx

- **Comprobantes.jsx**: encabezado → PageHeader, panel de filtros y panel de
  resultados → Card. La tabla de escritorio (`hidden sm:block`) y la vista de
  tarjetas en móvil (`sm:hidden`) se dejaron con su markup propio — Tabla.jsx
  solo sabe renderizar un `<table>` único, no un modo "tarjeta" alterno; forzar
  la vista móvil a Tabla habría perdido ese layout responsive a propósito.
- **Pagos.jsx**: encabezado → PageHeader, las 3 tarjetas de acción
  (Incentivo/Nómina/Cestaticket) → Card. Las tablas de los 3 modales
  (sticky `thead`, tabs por estamento, estados vacíos con `colSpan`) quedan
  sin tocar — decisión explícita del usuario tras consulta, por no calzar
  con la API de columnas de Tabla.

## Bloque 3 (completo): Conciliador.jsx, Reportes.jsx + sus 7 pestañas

- **Conciliador.jsx**: encabezado → PageHeader, selector de banco → Card,
  tabla de transacciones → Card+Tabla. La zona de arrastre de archivos
  (`DropZone`) queda sin tocar: su borde punteado cambia de color según el
  estado de "arrastrando", un estado de interacción que Card no representa
  sin perder ese feedback visual.
- **Reportes.jsx** (shell): solo el encabezado → PageHeader.
- **CierreCajaTab.jsx**: sin tabla raíz — las 3 tarjetas de resumen
  (Total USD, Distribución por Método, Total de Pagos) → Card.
- **HistoricoMensualTab.jsx**: tabla → Card+Tabla. La fila de totales del mes
  (antes `<tfoot>`) pasó a ser la última fila del `tbody` dentro de Tabla,
  porque la primitiva no soporta `tfoot` — mismo criterio aplicado después en
  ClasificacionPagosTab (desglose por mes).
- **PuntualidadTab.jsx**: sin tabla raíz — las 3 tarjetas de métrica, la
  tarjeta de distribución total y el estado vacío → Card.
- **CorreccionPagosTab.jsx**: tabla de pagos → Card+Tabla. Los 3 modales
  (Corregir, Anular, Cargar Retroactivo) quedan sin tocar.
- **BusinessIntelligenceTab.jsx**: los 3 paneles (proyección de ingresos,
  morosidad por grado, comparativa de períodos) → Card `padding="none"`,
  conservando su encabezado propio (icono + selector de año inline, que no
  calza en el slot `titulo` de Card). La tabla comparativa interna → Tabla.
- **ConciliacionTab.jsx**: solo la barra de progreso y el estado vacío → Card.
  La lista de representantes (acordeón expandible con checklist de
  conciliación) y el historial de lotes (acordeón similar) quedan sin tocar
  a propósito — son listados de tarjetas expandibles con checkboxes
  anidados, no tablas; forzarlos a Tabla habría significado reescribir su
  estructura de interacción, no solo su presentación.
- **ClasificacionPagosTab.jsx**: filtro de concepto/banco+exportación → Card;
  desglose de dinero por mes → Card+Tabla. La tabla principal (agrupada por
  representante con filas `Fragment`, checkbox de selección múltiple y fila
  de encabezado de grupo con `colSpan=8`) mantiene su markup de tabla propio
  dentro de un `Card padding="none"` — esa estructura de grupo
  expandible/seleccionable no tiene equivalente en la API de columnas de
  Tabla sin reescribir la lógica de agrupación.

## Deuda técnica preexistente encontrada (no introducida por esta migración)

- **`react-hooks/set-state-in-effect`**: casi todos los archivos tocados en
  bloques 2 y 3 (Comprobantes, Pagos, CierreCajaTab, HistoricoMensualTab,
  PuntualidadTab, CorreccionPagosTab, BusinessIntelligenceTab,
  ConciliacionTab, ClasificacionPagosTab) disparan este error de ESLint en
  sus `useEffect` de carga inicial (`useEffect(() => { fetchX(...) }, [...])`
  que llama una función que hace `setState`). Confirmado con `git stash` que
  el error ya existía antes de esta migración en cada caso — no se corrigió
  por estar fuera de alcance (cambiar la forma en que se dispara el fetch es
  lógica, no presentación). Patrón generalizado, candidato a una pasada
  dedicada futura (ver patrón ya resuelto antes en Cobranza vía
  `SmartDateInput`, referenciado más arriba en este archivo).
- **Colores hex literales fuera de `var(--*)`**: siguen presentes en
  Comprobantes.jsx (mapas de color por método de pago/estatus/clasificación),
  Pagos.jsx (colores por tipo de módulo: azul Incentivo, púrpura Nómina,
  verde Cestaticket) y varios `components/reportes/*.jsx` (colores
  semánticos de estado). Todos preexistentes, no tocados — el alcance de
  esta migración es solo estructura de layout (Card/PageHeader/Tabla), no
  tokens de color; cambiarlos sin revisar cada caso podría alterar
  significado semántico (ej. rojo = atrasado) por accidente.

## Verificación estática final (bloques 1-3)

- `npx vite build`: verde en cada commit.
- `npx eslint <archivos tocados>`: limpio salvo los `set-state-in-effect`
  preexistentes documentados arriba (confirmados con `git stash` en varios
  casos representativos).
- `grep -rn "#[0-9a-fA-F]\{6\}" src/pages --include=*.jsx`: coincidencias solo
  en colores semánticos preexistentes (ver arriba) y en pantallas aún no
  migradas (Asistencia, Auditoria, Boletin, CobranzaDashboard — bloques
  futuros).
- `grep -rn "grid-cols-[2-9]" src/pages --include=*.jsx | grep -v "sm:grid-cols\|md:grid-cols\|lg:grid-cols"`:
  sin resultados.
- `grep -rn "\bvh\b" src/pages --include=*.jsx`: sin resultados.

## Pendiente para bloque 4 en adelante

bloque 4: Inscripciones.jsx, Representantes.jsx (Grados.jsx ya migrado).
bloque 5: Notas.jsx, Boletin.jsx, Asistencia.jsx, Horarios.jsx, Materias.jsx,
Docentes.jsx.
bloque 6: Sistemas.jsx, Configuracion.jsx, Auditoria.jsx, Nomina.jsx,
Recibos.jsx (este último: si la migración afectaría la maquetación de
impresión/PDF, debe dejarse sin migrar y reportarse).
bloque 7: Comunicacion.jsx, Incidentes.jsx, Rendimiento.jsx.

## Bloque 4 (completo): Inscripciones.jsx, Representantes.jsx

- **Representantes.jsx**: se agregó PageHeader (no tenía encabezado propio
  antes), y la tabla pasó de `TablaScroll` + `<table>` manual a Card+Tabla.
  `TablaRepresentantes.jsx` y su skeleton dejaron de envolverse en su propio
  `<tbody>` para poder usarse como children de Tabla (mismo ajuste que
  `MorososRow`/`MorososSkeleton` en bloque 1). La ficha lateral
  (`RepresentanteFicha.jsx`, panel `position: sticky` con `maxHeight`
  calculado) queda sin tocar — Card no expone un prop `style` para ese
  posicionamiento/alto especial.
- **Inscripciones.jsx** (shell): el encabezado centrado ("Admisión Octopus")
  pasó a PageHeader estándar (alineado a la izquierda) — decisión confirmada
  explícitamente con el usuario, ya que era una desviación visual intencional
  del resto de páginas.
- **PasoRepresentante.jsx**: los 2 paneles con borde (formulario de
  representante nuevo, tarjeta de confirmación de representante existente)
  → Card. El buscador de cédula (sin borde propio) y el aviso de datos
  faltantes (rojo semántico) quedan sin tocar.
- **PasoAlumno.jsx**: el panel "Datos del Nuevo Estudiante" → Card. La
  grilla de tarjetas seleccionables (alumno nuevo/existente, con estados de
  selección por color) y el aviso de datos faltantes quedan sin tocar — son
  tiles de selección tipo radio, no bloques de contenido.
- **PasoConfiguracion.jsx**: el panel "Detalles de inscripción" → Card. La
  grilla de tarjetas de grado/sección seleccionables y el aviso de período
  cerrado quedan sin tocar, mismo criterio que PasoAlumno.
- **PasoConfirmacion.jsx**: el panel completo → Card `padding="none"`,
  conservando su banda de encabezado azul con ícono (no calza en el slot
  `titulo` de Card, mismo criterio que los paneles de BusinessIntelligenceTab
  en bloque 3).

Verificación: `vite build` verde y `eslint` limpio en cada commit (salvo
errores preexistentes confirmados con `git stash`: `no-unused-vars` de
`React` sin usar en varios archivos de `inscripciones/`, y más casos de
`react-hooks/set-state-in-effect`/`react-hooks/preserve-manual-memoization`
— mismo patrón generalizado ya documentado en bloque 3). Grep de hex colors
y grids sin breakpoint: solo coincidencias semánticas preexistentes (rojo de
error/advertencia), sin hallazgos nuevos.

## Bloques 5, 6 y 7 (completos): resto del panel administrativo

Migración ejecutada en paralelo (4 subagentes + trabajo directo) sobre:
Notas.jsx, Boletin.jsx, Asistencia.jsx, Horarios.jsx, Materias.jsx,
Docentes.jsx, Sistemas.jsx, Auditoria.jsx, Nomina.jsx, Recibos.jsx,
Comunicacion.jsx, Incidentes.jsx, Rendimiento.jsx. Cada commit se verificó
individualmente (`vite build` + `eslint` + revisión de diff) antes de
aceptarse; ningún subagente hizo `git commit` por su cuenta.

- **Notas.jsx / Boletin.jsx**: encabezado → PageHeader, estado vacío → Card.
  En Boletin.jsx además se migró el panel completo de vista previa del
  boletín (banda de colegio + datos del alumno + tabla de materias +
  asistencia + firmas) a `Card padding="none"` y la tabla de materias a
  `Tabla` — se verificó primero que `generarBoletinPDF` (utils/boletinPdf.js)
  construye el PDF desde los datos con jsPDF, sin capturar este DOM (a
  diferencia de Recibos.jsx), por lo que restructurar la vista previa es
  seguro. `TablaNotas.jsx` (usado también por `DocenteMateriaDetalle.jsx` y
  `PlanEvaluacionPanel.jsx` del portal-docente, fuera de este alcance) quedó
  sin tocar a propósito.
- **Asistencia.jsx / Horarios.jsx**: encabezado → PageHeader. `GrillaHorario`
  (tipo calendario, filas=horas/columnas=días) y `PanelMaterias` (acordeón de
  chips), así como las filas de alumno con botones de estado (`FilaAlumno`),
  quedan sin tocar — no son tablas de datos homogéneas ni cards de contenido
  simple.
- **Materias.jsx / Docentes.jsx**: encabezado → PageHeader (botón "Nuevo X"
  como acción), contenedor de la lista → Card. Las listas en sí usan filas
  tipo botón (no `<table>`), se dejaron igual dentro de Card.
- **Sistemas.jsx**: solo el encabezado → PageHeader; la navegación de tabs y
  las pestañas delegadas (`UsuariosTab`, etc.) quedan sin tocar.
- **Auditoria.jsx**: encabezado con filtros de fecha y botones de exportación
  → PageHeader (`acciones`); las 4 tarjetas KPI → Card; la tabla de logs →
  Card padding="none" + Tabla, con su barra de filtros propia conservada
  como markup interno (no calza en `titulo`/`accion` de Card).
- **Nomina.jsx**: encabezado (ambos estados, loading e inicial) → PageHeader;
  tabla de empleados → Card padding="none" + Tabla con columnas dinámicas
  según estamento. Las 3 tarjetas de resumen por estamento (borde que cambia
  a `var(--pb)` cuando ese tab está activo) quedan sin tocar — Card tiene un
  borde fijo, forzarlas habría perdido la señal de tab activo.
- **Recibos.jsx**: los 7 bloques del panel izquierdo (formulario) → Card. El
  bloque "Neto a Depositar" (resaltado de color) y **todo el panel derecho**
  (`ref={previewRef}`, el insumo literal de `imprimirRecibo`) quedan sin
  tocar — ese sí es la plantilla real de impresión/PDF, a diferencia de
  Boletin.jsx.
- **Comunicacion.jsx / Incidentes.jsx / Rendimiento.jsx**: encabezado →
  PageHeader, panel de estado vacío → Card. Las listas de tarjetas propias
  (`TarjetaCircular`, `TarjetaIncidente`) y los widgets de color semántico
  (`MapaCalorSeccion`, `AlertasRiesgoList`) quedan sin tocar.

Un subagente (Notas.jsx/Boletin.jsx) falló a mitad de tarea por un error de
servidor después de terminar Notas.jsx y solo alcanzar a agregar los imports
en Boletin.jsx (sin migrar su contenido) — se detectó con `git diff` y se
completó Boletin.jsx manualmente antes de commitear.

Verificación: `vite build` verde y `eslint` limpio en todos los commits
(salvo los mismos patrones preexistentes ya documentados arriba, confirmados
archivo por archivo con `git diff`/`git stash` antes de aceptarse). Grep de
hex colors, grids sin breakpoint y `vh`: sin hallazgos nuevos en todo
`src/pages`.

### Pendiente de este batch

- **Configuracion.jsx** (1460 líneas, un solo componente monolítico sin
  dividir en sub-tabs como Reportes.jsx) — no se migró en esta pasada por su
  tamaño; requiere una revisión dedicada, no delegable a la ligera a un
  subagente en paralelo con los demás. Queda como el único pendiente real de
  bloque 6.

## TOKENS DE index.css AGREGADOS PARA CORREGIR ESQUINAS CUADRADAS (2026-08-29)

`ui/Card.jsx` y `Sidebar.jsx` ya usaban `--radius-card`, `--surface`,
`--pad-card(-lg)`, `--fw-semibold` y otros tokens que nunca se definieron en
el `:root` de `index.css` — colapsaban a su valor inválido (radio 0), por eso
toda tarjeta del sistema salía cuadrada. Se agregaron:

- `--radius-card: 14px` — un escalón por debajo de `--shell-radius` (20px),
  porque Card es un elemento interno, no el shell de la página.
- `--surface: var(--porcelain)` / `--surface-sunken: var(--bg)` — alias
  semánticos de los tokens de color ya existentes, sin hex nuevos.
- `--pad-card: 1rem` / `--pad-card-lg: 1.25rem` — el par móvil/desktop que
  `Card.jsx` ya esperaba vía `p-[var(--pad-card)] sm:p-[var(--pad-card-lg)]`.
- `--fw-medium: 500` / `--fw-semibold: 600`.
- `--ink: var(--jet)` — alias, sin uso real detectado más allá de la única
  referencia existente.
- `--gap-section` / `--gap-section-lg` — definidos por completar el listado
  pedido; sin consumidores detectados por grep al momento de agregarlos.
- **`--portal-primary` / `--portal-secondary`**: derivados de `--pb` /
  `--pb-mid` (marca genérica actual de Octopus) como placeholder. Estos dos
  también se sobrescriben en runtime por `PortalLayout.jsx` (`root.style.
  setProperty`) leyendo `color_primario`/`color_secundario` del perfil del
  colegio — **pendiente de confirmar** si el valor por defecto (antes de que
  cargue el perfil, o si el colegio no configuró colores) debe seguir siendo
  la marca de Octopus o un neutro genérico.

**Pendiente, fuera de alcance de este cambio**: los portales `portal/` y
`portal-docente/` (~31 archivos) usan un patrón de tarjeta propio y
consistente — `rounded-2xl` + `bg-white` + `border-gray-100` hardcodeado en
cada archivo — que nunca pasa por `ui/Card.jsx` ni por los tokens de arriba.
No estaba roto (ya redondeaba, era el mismo valor en los 31 archivos) así que
no se tocó sin pedirlo explícitamente; si se quiere una única fuente de
verdad para el radio en todo el proyecto, esos 31 archivos son candidatos a
migrar a `var(--radius-card)` (o a un token de radio propio del portal) en un
batch dedicado.
