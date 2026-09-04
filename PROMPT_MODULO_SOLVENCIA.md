# TAREA — Solvencia por grado, Pagos por concepto y Estado de cuenta (Octopus)

Ejecuta EXACTAMENTE lo que está en este documento. No agregues funcionalidad no
listada, no refactorices código ajeno al alcance, no propongas alternativas.
Si algo del documento choca con el código real, DETENTE y repórtalo antes de
seguir; no lo resuelvas por tu cuenta.

## 0. Reglas duras

- Stack cerrado: React 19 + Vite, react-router-dom v7, Tailwind v4, Axios,
  lucide-react, react-toastify, xlsx, date-fns. Backend Django + DRF.
  **Prohibido instalar cualquier librería nueva** (incluido cualquier carrusel:
  se hace con Tailwind puro).
- **Cero migraciones.** Los cuatro endpoints son de SOLO LECTURA sobre modelos
  existentes. Si crees necesitar un campo nuevo, detente y repórtalo.
- No dupliques el criterio de mora. `cobranza/mora.py` es la fuente de verdad
  única (`annotate_mora_detalle`, `calcular_dias_atraso`, `_condicion_mora`).
- Todo queryset de alumnos/pagos pasa por `filtrar_por_sede(...)` como ya hacen
  `ListaMorososView` y `PagosListView`.
- Fechas visibles al usuario: `date-fns` con locale `es`.
- Cumple el ESTÁNDAR DE DISEÑO RESPONSIVE de CLAUDE.md: mobile-first,
  `dvh` nunca `vh`, ninguna `grid-cols-N` sin breakpoint, toda tabla dentro de
  `components/ui/TablaScroll.jsx`, todo modal con `components/ui/Modal.jsx`,
  el scroll horizontal SIEMPRE dentro del elemento ancho y nunca en el `<body>`.
- **No hagas verificación visual en navegador. Las pruebas visuales las hace el
  usuario.** Tu verificación es estática: `npm run build` en verde,
  `python manage.py test cobranza` en verde, sin imports sin usar.
- Deuda técnica que encuentres de paso: anótala en
  `octopus-api/NOTAS_TECNICAS.md`, no la arregles.
- Un commit por bloque numerado, mensajes en español.

## 1. Contexto ya verificado del código (no lo re-investigues)

Modelos de cargo en `octopus-api/cobranza/models.py`:

| Modelo | Nivel | Parcial | Clave temporal |
|---|---|---|---|
| `Mensualidad` | alumno | no (`pagado` bool) | `mes`, `anio`; `unique_together` con alumno |
| `CuotaInscripcion` | alumno | no | `periodo_escolar` |
| `CuotaSolvencia` | alumno | sí (`monto_pagado`) | `periodo_escolar` |
| `CuotaProyectoInversion` | **representante** | sí (`monto_pagado`) | `periodo_escolar`, `numero_cuota`, FK `tipo_concepto` |

`TipoCargoEspecial` es el catálogo dinámico (`nombre`, `monto_defecto_usd`,
`periodicidad`, `numero_cuotas`, `alcance`, `activo`). CADA cargo especial nuevo
que el colegio cree debe aparecer solo en los filtros: **nunca hardcodees
nombres de concepto en el frontend.**

Otros puntos ya confirmados:

- `Alumno`: `grado_seccion` (CharField), `activo`, `estatus_financiero`,
  `dia_limite_pago`, FK `sede`, FK `representante`.
- `ConfiguracionGrado.grado_seccion` es único y **no tiene campo de orden** →
  ordena los grados alfabéticamente por `grado_seccion`. No inventes un campo.
- `cobranza/services.py`: `rango_ano_escolar()`, `meses_ano_escolar(ini, fin)`,
  `configuracion_activa()`.
- `config/pagination.py::StandardResultsPagination` (page_size 20, máx 100).
- `cobranza/exports.py::ExcelExporter.export(queryset, column_config, prefix)`.
- `cobranza/serializers.py::PagoSerializer`.
- Roles backend, copia la tupla de `PagosListView`:
  `('director', 'sistemas', 'administrador', 'cobranza', 'cajero')`.
- Frontend: `ROLE_GROUPS` en `constants/roles.js` (`FINANZAS`, `MORA`,
  `ATENCION_FAMILIAS`); componentes `ui/Card`, `ui/Tabla`, `ui/TablaScroll`,
  `ui/PageHeader`, `ui/Modal`, `shared/Pagination`, `dashboard/KpiCard`.
- `pages/Dashboard.jsx` tiene el bloque "Ocupación por grado" en la Row 4
  (~línea 197). El bloque nuevo va **inmediatamente debajo, como Row 5**.
- `pages/Reportes.jsx` ya tiene barra de pestañas con `activeTab` y componentes
  en `components/reportes/*Tab.jsx`. La pestaña nueva sigue ese patrón.
- `components/representantes/RepresentanteFicha.jsx` es el panel lateral de
  288 px (`w-full lg:w-72`) que ya muestra contacto y alumnos.

Lo que NO existe hoy y por eso hay que construirlo:
`MensualidadesPuntualidadView` solo cuenta mensualidades YA PAGADAS y nunca las
impagas; `HistoricoMensualView` es flujo de caja diario; `ListaMorososView` solo
devuelve a quien está en mora y nunca a quien pagó.

## 2. Definiciones canónicas (aprobadas por el usuario, no las cambies)

- **Solvente en un mes** = tiene la `Mensualidad` de ese `(mes, anio)` con
  `pagado=True`. No interviene inscripción, solvencia ni cargos especiales.
- **Denominador ("inscritos")** = alumnos con `activo=True` del grado,
  **excluyendo `estatus_financiero='becado'`**. Los becados no pagan; incluirlos
  hundiría el porcentaje del grado. Es la misma exclusión de
  `ListaMorososView._build_qs`, así los números cuadran entre pantallas.
  Escribe esto en el docstring del endpoint.

---

## 3. BLOQUE 1 — Backend: catálogo dinámico de conceptos

Archivo nuevo `octopus-api/cobranza/solvencia_reportes.py`. **Todo el backend de
esta tarea vive ahí**; no engordes `views.py`, que ya tiene 3208 líneas.

`GET /api/cobranza/conceptos-cobrables/` → `ConceptosCobrablesView`

```json
{"conceptos": [
  {"clave":"mensualidad","nombre":"Mensualidad","nivel":"alumno","admite_parcial":false,"periodico":true},
  {"clave":"inscripcion","nombre":"Inscripción","nivel":"alumno","admite_parcial":false,"periodico":false},
  {"clave":"solvencia","nombre":"Solvencia","nivel":"alumno","admite_parcial":true,"periodico":false},
  {"clave":"cargo_especial:7","nombre":"Proyecto de Inversión","nivel":"representante",
   "admite_parcial":true,"periodico":false,"tipo_cargo_id":7,"numero_cuotas":3}
]}
```

Los tres primeros son fijos; el resto sale de
`TipoCargoEspecial.objects.filter(activo=True).order_by('nombre')`, con clave
`f"cargo_especial:{tipo.id}"`.

`periodico` distingue lo que se desglosa por mes (`mensualidad`) de lo que es una
sola línea (todo lo demás). El frontend NO decide esto: lo lee de aquí.

Escribe UNA función `resolver_concepto(clave)` en ese mismo archivo que devuelva
modelo, nivel y filtro base. Los bloques 2, 3 y 4 la usan; no repitas ese
`if/elif` en varios sitios.

Ruta en `cobranza/urls.py`: `path('conceptos-cobrables/', ...)`.

---

## 4. BLOQUE 2 — Backend: solvencia por grado y mes

`GET /api/cobranza/solvencia-mensual/` → `SolvenciaMensualView`

Query params: `anio_escolar` (opcional, default el activo), `sede` (opcional).

Universo: `Mensualidad` de alumnos `activo=True` excluyendo
`estatus_financiero='becado'`, en los meses de
`meses_ano_escolar(*rango_ano_escolar())`. Aplica
`filtrar_por_sede(user, qs, campo='alumno__sede')`.

```json
{
  "periodo_escolar": "2026-2027",
  "meses": [
    {"mes":9,"anio":2026,"etiqueta":"Septiembre 2026",
     "total_alumnos":320,"solventes":210,"pendientes":110,"porcentaje":65.6}
  ],
  "por_grado": [
    {"grado_seccion":"1er Grado A",
     "meses":[{"mes":9,"anio":2026,"total_alumnos":22,"solventes":18,"pendientes":4,"porcentaje":81.8}]}
  ],
  "totales": {"total_alumnos":320,"solventes":2100,"pendientes":940,"porcentaje":69.1}
}
```

Reglas:

- Devuelve **todos los meses del período escolar de una sola vez**. El frontend
  cambia de mes en cliente, sin volver a llamar. Esto es un requisito, no una
  optimización opcional.
- `porcentaje` redondeado a 1 decimal; `0.0` si `total_alumnos == 0`.
- `meses` sale completo aunque no haya mensualidades generadas (en ese caso,
  ceros). La directora pregunta por septiembre aunque nadie haya pagado.
- **Rendimiento obligatorio:** máximo 2 queries agregadas
  (`.values('mes','anio').annotate(...)` y
  `.values('mes','anio','alumno__grado_seccion').annotate(...)`). Prohibido
  iterar alumnos en Python. Si el test detecta N+1, es un fallo.
- La respuesta NO contiene ningún nombre propio ni cédula: es el reporte
  compartible. Ponlo como invariante en el docstring.

Ruta: `path('solvencia-mensual/', ...)`.

---

## 5. BLOQUE 3 — Backend: estado por concepto (quién pagó / quién debe)

Dos endpoints, ambos en `solvencia_reportes.py`.

### 5.1 Resumen agregado

`GET /api/cobranza/estado-por-concepto/resumen/` → `ResumenPorConceptoView`

Params: `concepto` (obligatorio), `vista` = `global|grado` (default `global`),
`periodo_escolar` (opcional), `sede` (opcional).

Si el concepto tiene `periodico: true` → desglose por mes del período escolar.
Si tiene `periodico: false` → **una sola línea**, sin meses.

```json
{
  "concepto": "mensualidad", "concepto_nombre": "Mensualidad",
  "periodico": true, "nivel": "alumno", "vista": "global",
  "lineas": [
    {"etiqueta":"Mayo 2027","mes":5,"anio":2027,
     "total":320,"pagados":308,"parciales":0,"pendientes":12,
     "porcentaje":96.3,"monto_pendiente_usd":"480.00"}
  ],
  "totales": {"total":3200,"pagados":2100,"parciales":8,"pendientes":1092,"porcentaje":65.6}
}
```

Con `vista=grado`, cada línea lleva además
`"grados":[{"grado_seccion":"1er Grado A","total":22,"pagados":18,"pendientes":4,"porcentaje":81.8}]`.

Con `periodico: false` (proyecto de inversión, inscripción, solvencia), `lineas`
trae **exactamente un elemento** con `etiqueta` = nombre del concepto,
`mes`/`anio` en `null`. Un cargo especial de varias cuotas produce una línea por
`numero_cuota` (`"Proyecto de Inversión — Cuota 2 de 3"`), que sigue sin ser
desglose mensual.

El filtrado de "no mostrar lo que ya está 100 % cobrado" **lo hace el frontend**,
no el backend: el backend devuelve todo y el frontend oculta las líneas con
`pendientes == 0 and parciales == 0` salvo que el usuario active el check.

### 5.2 Detalle con nombres

`GET /api/cobranza/estado-por-concepto/` → `EstadoPorConceptoView`

Params: `concepto` (obligatorio), `estado` = `pagado|pendiente|parcial|todos`
(default `todos`), `mes` y `anio` (solo si el concepto es periódico),
`numero_cuota` (opcional, cargos especiales), `periodo_escolar`,
`grado_seccion`, `buscar` (nombre/apellido/cédula de alumno o representante),
`page`, `page_size`. Usa `StandardResultsPagination`.

`estado` por fila:

- sin `monto_pagado` (mensualidad, inscripción): `pagado` si `pagado=True`,
  si no `pendiente`.
- con `monto_pagado` (solvencia, cargo especial): `pagado` si `pagado=True`;
  `parcial` si `0 < monto_pagado < monto_usd`; si no `pendiente`.

Fila con `nivel == "alumno"`:

```json
{"nivel":"alumno","alumno_id":12,"nombre":"Ana Pérez","cedula_escolar":"...",
 "grado_seccion":"3er Grado A",
 "representante":{"id":4,"nombre":"Luis Pérez","cedula":"V-123","telefono":"..."},
 "monto_usd":"40.00","monto_pagado_usd":"0.00","saldo_usd":"40.00",
 "estado":"pendiente","fecha_pago":null,"dias_atraso":23}
```

Fila con `nivel == "representante"` (cargos especiales — UNA fila por
representante, **no una por hijo**):

```json
{"nivel":"representante","representante_id":4,"nombre":"Luis Pérez","cedula":"V-123",
 "telefono":"...","alumnos":["Ana Pérez","Beto Pérez"],"numero_cuota":2,
 "monto_usd":"50.00","monto_pagado_usd":"20.00","saldo_usd":"30.00",
 "estado":"parcial","fecha_pago":null,"dias_atraso":null}
```

`dias_atraso` solo para `mensualidad` pendiente: días entre hoy y el día límite
de esa cuota, con
`min(alumno.dia_limite_pago or 1, calendar.monthrange(anio, mes)[1])` — es la
MISMA fórmula de `cobranza/mora.py::calcular_dias_atraso` (~línea 260);
impórtala o replícala citando el archivo en un comentario. No inventes otra.
Para el resto de conceptos: `null`.

Incluye `resumen` calculado sobre el queryset COMPLETO, no sobre la página:

```json
{"resumen":{"total_filas":320,"pagados":210,"parciales":8,"pendientes":102,
            "monto_cobrado_usd":"8400.00","monto_pendiente_usd":"4400.00"}}
```

### 5.3 Excel

`GET /api/cobranza/estado-por-concepto/exportar-excel/` →
`ExportarEstadoPorConceptoExcelView`. Mismos filtros que 5.2, sin paginar, vía
`ExcelExporter`. Columnas según nivel. Sigue el patrón exacto de
`ExportarMorososExcelView`.

Rutas: `estado-por-concepto/resumen/`, `estado-por-concepto/` y
`estado-por-concepto/exportar-excel/`.

---

## 6. BLOQUE 4 — Backend: estado de cuenta del representante

`GET /api/cobranza/representantes/<int:representante_id>/estado-cuenta/`
→ `EstadoCuentaRepresentanteView`. Params `page`, `page_size` paginan **solo**
el historial de pagos.

```json
{
  "representante": {"id":4,"nombre":"Luis Pérez","cedula":"V-123","telefono":"...","correo":"..."},
  "alumnos": [{"id":12,"nombre":"Ana Pérez","grado_seccion":"3er Grado A","activo":true}],
  "cargos": [
    {"concepto":"mensualidad","concepto_nombre":"Mensualidad","nivel":"alumno",
     "items":[{"descripcion":"Septiembre 2026","alumno":"Ana Pérez",
               "monto_usd":"40.00","monto_pagado_usd":"40.00","saldo_usd":"0.00",
               "estado":"pagado","fecha_pago":"2026-09-03T10:12:00Z"}],
     "subtotal_usd":"360.00","subtotal_pagado_usd":"280.00","saldo_usd":"80.00",
     "pendientes":2}
  ],
  "historial_pagos": {"count":42,"next":null,"previous":null,"results":[]},
  "totales": {"deuda_total_usd":"180.00","pagado_total_usd":"1240.00","cargos_pendientes":5}
}
```

Reglas:

- `cargos` recorre TODOS los conceptos del bloque 1: mensualidades, inscripción
  y solvencia de sus alumnos activos, más los cargos especiales del representante.
- `historial_pagos.results` se serializa con `PagoSerializer`.
- Historial: `Pago.objects.filter(Q(alumno__representante_id=id) |
  Q(representante_documento=rep.cedula)).distinct().order_by('-fecha_pago')`.
  El `OR` es necesario porque los pagos retroactivos guardan la cédula del
  representante como texto suelto.
- Incluye los pagos `estatus='anulado'` (el campo ya viene en `PagoSerializer`)
  pero **NO los sumes** a `pagado_total_usd`.
- Mismos roles y `filtrar_por_sede` que el resto. 404 si el representante no existe.

Ruta: `path('representantes/<int:representante_id>/estado-cuenta/', ...)`.

---

## 7. BLOQUE 5 — Frontend: servicio y hooks

En `octopus-frontend/src/api/cobranza.service.js` (append, estilo de funciones
sueltas con `signal`, como el resto del archivo):
`getConceptosCobrables`, `getSolvenciaMensual`, `getResumenPorConcepto`,
`getEstadoPorConcepto`, `exportarEstadoPorConceptoExcel` (`responseType: 'blob'`),
`getEstadoCuentaRepresentante`.

Hooks nuevos en `src/hooks/`, siguiendo el patrón de `useMorosos.js`
(AbortController, `loading`, error vía `react-toastify`, paginación):

- `useSolvenciaMensual.js`
- `useConceptosCobrables.js`
- `useResumenPorConcepto.js`
- `useEstadoPorConcepto.js`
- `useEstadoCuentaRepresentante.js`

Utilidad compartida `src/utils/copiarResumen.js`: recibe título + líneas y copia
texto plano con `navigator.clipboard.writeText`, con **fallback silencioso** a un
`<textarea>` temporal + `document.execCommand('copy')` si la API no está
disponible (el sistema corre en equipos viejos y sin HTTPS en algunas sedes).
Devuelve boolean de éxito. La usan los bloques 6 y 7; no la dupliques.

---

## 8. BLOQUE 6 — Dashboard: bloque "Solvencia por grado"

Nuevo `src/components/dashboard/SolvenciaGradoBlock.jsx` +
`SolvenciaGradoSkeleton.jsx`. Se monta en `pages/Dashboard.jsx` como **Row 5,
inmediatamente después de la Card "Ocupación por grado"** (~línea 197). El
bloque se autoabastece con `useSolvenciaMensual` (no toques `useDashboardStats`).

Requisitos exactos:

1. `Card` con título "Solvencia por grado" y, en la cabecera, un `<select>` de
   mes con los meses del período escolar. Default: mes actual si está en el
   período; si no, el primero. Cambiar de mes **repinta desde el estado ya
   cargado, sin nueva llamada a la API**.
2. **SIN barra de progreso.** Nada de `StackedBar` ni barras de porcentaje. Solo
   números: por grado, `18 de 22 solventes` y debajo `81.8%`. El color del
   porcentaje: verde ≥ 80 %, ámbar 50–79 %, rojo < 50 %.
3. **El bloque no puede alargar el dashboard.** Una sola fila de tarjetas con
   scroll horizontal: `flex gap-3 overflow-x-auto snap-x snap-mandatory
   pb-2 -mx-4 px-4 sm:mx-0 sm:px-0`, cada tarjeta
   `snap-start shrink-0 w-40 sm:w-44`. Altura fija: ocupa lo mismo con 6 grados
   que con 30. **Prohibido usar `grid` aquí** y prohibido instalar un carrusel.
4. **Cada tarjeta es clickeable** (`<button>`, no `<div>`): navega a
   `/reportes?tab=concepto&concepto=mensualidad&mes=<mes>&anio=<anio>&grado=<grado_seccion>`
   con `useNavigate`. Debe ser accesible por teclado y tener `aria-label`
   descriptivo (`"Ver detalle de 1er Grado A, septiembre 2026"`).
5. Botón "Copiar resumen" en la cabecera, con `utils/copiarResumen.js`. Formato
   exacto del texto, sin nombres propios:

   ```
   Solvencia — Septiembre 2026
   Total: 210 de 320 al día (65.6%)

   1er Grado A — 18/22 (81.8%)
   2do Grado A — 12/20 (60.0%)
   ```

   Confirma con `react-toastify`.
6. Estado vacío: "Sin mensualidades generadas para este mes", mismo tono que el
   "Sin grados configurados" del bloque de ocupación.
7. Skeleton mientras carga, nunca spinner genérico.
8. **Visibilidad por rol:** el bloque solo se renderiza para
   `director`, `administrador`, `cobranza` y `sistemas`. Cajero y secretaria no
   lo ven. Usa el rol de `AuthContext` como ya hace `pages/Representantes.jsx`.
   Si no existe un grupo adecuado en `constants/roles.js`, añade
   `ROLE_GROUPS.SOLVENCIA_DASHBOARD` con esos cuatro roles; no reutilices uno
   que no cuadre.

---

## 9. BLOQUE 7 — Reportes: pestaña "Pagos por concepto"

Nuevo `src/components/reportes/PagosPorConceptoTab.jsx` (+ subcomponentes en
`src/components/reportes/pagos-concepto/`: `FiltrosConcepto.jsx`,
`LineasConcepto.jsx`, `DetalleConceptoModal.jsx`, `PagosConceptoSkeleton.jsx`).
Se registra en `pages/Reportes.jsx` como una pestaña más, siguiendo el patrón de
`PuntualidadTab` / `ReporteBecasTab`. Etiqueta: "Pagos por concepto".

1. **Selector de concepto** poblado por `useConceptosCobrables`. **Jamás una
   lista hardcodeada.**
2. **Selector de vista:** `Global` / `Por grado`.
3. **Listado de líneas** (`useResumenPorConcepto`):
   - Si el concepto es `periodico: true` → una línea por mes del período escolar:
     `Mayo 2027 — 12 pendientes de 320 (96.3% cobrado)`.
   - Si es `periodico: false` → **una sola línea** (o una por cuota en cargos
     especiales de varias cuotas). Sin desglose mensual.
   - En vista `Por grado`, cada línea se expande mostrando sus grados.
4. **Las líneas 100 % cobradas no se muestran.** Se ocultan las que tengan
   `pendientes === 0 && parciales === 0`. Un check "Mostrar también lo que está
   al día" las devuelve. El filtrado es de frontend; el backend manda todo.
5. **Click en una línea** → abre `ui/Modal` (ancho `lg`) con la lista de nombres
   vía `useEstadoPorConcepto`: segmented control Todos / Pagados / Parciales /
   Pendientes (oculta "Parciales" si el concepto tiene `admite_parcial: false`),
   búsqueda, `shared/Pagination` y botón "Exportar Excel"
   (`w-full sm:w-auto`). La tabla va dentro de `TablaScroll` y **cambia de
   columnas según el `nivel` de las filas** (alumno vs representante). Filas con
   `saldo_usd > 0` en rojo.
6. Botón "Copiar resumen" con el mismo utilitario del bloque 6, sobre las líneas
   visibles.
7. **Deep-link:** al montar, si la URL trae `?tab=concepto&concepto=…&mes=…&
   anio=…&grado=…` (lo que manda la tarjeta del dashboard), `Reportes.jsx` debe
   activar esta pestaña y precargar esos filtros, abriendo directamente el modal
   de detalle. Lee los params con `useSearchParams` de react-router-dom v7.

---

## 10. BLOQUE 8 — Estado de cuenta en la ficha del representante

1. En `src/components/representantes/RepresentanteFicha.jsx` añade una sección
   **"Estado de cuenta"** al final del panel, alimentada por
   `useEstadoCuentaRepresentante`:
   - Deuda total en USD, destacada en rojo si es > 0.
   - Una línea por concepto con pendientes:
     `Mensualidades · 3 pendientes · $120.00`. Los conceptos sin pendientes no
     se listan.
   - Skeleton propio mientras carga; el resto de la ficha debe seguir
     renderizando aunque esta llamada falle (fallo aislado, toast de error, sin
     romper la ficha).
   - Botón **"Ver estado de cuenta completo"**.
   Ese es el ÚNICO cambio permitido en ese archivo: no reordenes ni reestilices
   lo demás.
2. Nuevo `src/components/representantes/EstadoCuentaModal.jsx`, abierto por ese
   botón, con `ui/Modal` tamaño `xl`:
   - `header`: nombre, cédula, teléfono, alumnos, y los totales.
   - `body` (scrollable): **Cargos** agrupados por concepto, cada grupo
     colapsable, cada ítem con descripción, alumno (si aplica), monto, pagado,
     saldo y badge de estado (verde pagado / ámbar parcial / rojo pendiente).
     Debajo, **Historial de pagos** paginado: fecha (`date-fns`, locale `es`),
     factura, concepto, método, monto USD y estado. Pagos anulados tachados y en
     gris. Ambas tablas dentro de `TablaScroll`.
   - `footer`: botón cerrar, siempre visible y clicable en los cuatro tamaños.
3. **No agregues generación de PDF.** Si se pide, será otra tarea.

---

## 11. BLOQUE 9 — Tests backend

Nuevo `octopus-api/cobranza/test_solvencia_reportes.py`, al estilo de
`cobranza/test_recargo_pago_tardio.py`. Cobertura mínima:

1. `conceptos-cobrables/` incluye los 3 fijos más un `TipoCargoEspecial` activo
   recién creado, y EXCLUYE uno con `activo=False`.
2. `solvencia-mensual/`: con 3 alumnos y 2 meses los conteos y `porcentaje` son
   los esperados; un alumno `estatus_financiero='becado'` NO aparece en el
   denominador; los meses del período salen aunque no haya mensualidades.
3. `solvencia-mensual/` no dispara N+1: `assertNumQueries` con tope fijo, y el
   número no crece al pasar de 3 a 30 alumnos.
4. `estado-por-concepto/resumen/` con concepto periódico devuelve una línea por
   mes; con concepto no periódico devuelve exactamente una línea (o una por
   cuota) con `mes`/`anio` en `null`.
5. `estado-por-concepto/`: `estado=pagado` y `estado=pendiente` dan conjuntos
   disjuntos cuya unión es `estado=todos`; `resumen` cuadra con el total sin
   paginar; una `CuotaSolvencia` con `monto_pagado` intermedio sale `parcial`.
6. `estado-por-concepto/` con un cargo especial devuelve UNA fila para un
   representante con dos hijos, no dos.
7. `estado-cuenta/`: los pagos anulados aparecen pero no suman a
   `pagado_total_usd`; un pago retroactivo enlazado solo por
   `representante_documento` aparece en el historial.
8. Un usuario con rol no permitido (ej. `docente`) recibe 403 en los cuatro
   endpoints.

Deja `python manage.py test cobranza` en verde.

---

## 12. Fuera de alcance (NO lo hagas)

- Nada del portal de representantes (`/portal`) ni de cantina.
- Ninguna migración, ningún campo nuevo, ningún cambio a `cobranza/mora.py`.
- Nada de PDF, WhatsApp, correos ni notificaciones.
- No toques `Morosos.jsx`, `ListaMorososView`, `MensualidadesPuntualidadView`
  ni `useDashboardStats.js`.
- Ninguna página nueva ni entrada nueva en el menú lateral: todo vive dentro de
  Dashboard, Reportes y la ficha de representante.
- No hagas verificación visual en navegador: la hace el usuario.

## 13. Commits

1. `feat(cobranza): catálogo dinámico de conceptos cobrables`
2. `feat(cobranza): endpoint de solvencia por grado y mes`
3. `feat(cobranza): endpoints de estado de pagos por concepto`
4. `feat(cobranza): endpoint de estado de cuenta del representante`
5. `test(cobranza): suite de reportes de solvencia`
6. `feat(frontend): servicio, hooks y utilidad de copiar resumen`
7. `feat(dashboard): bloque de solvencia por grado con tarjetas deslizables`
8. `feat(reportes): pestaña de pagos por concepto con detalle por nombre`
9. `feat(representantes): estado de cuenta en la ficha y modal de detalle`

## 14. Reporte final

Al terminar informa: archivos creados y modificados, salida de
`python manage.py test cobranza`, salida de `npm run build`, y la lista de
pantallas que el usuario debe revisar visualmente en 360×640, 768×1024,
1366×768 y 1920×1080 — con mención expresa de que el carrusel del dashboard
debe deslizarse dentro de su contenedor sin que el `<body>` scrollee en
horizontal en 360 px.
