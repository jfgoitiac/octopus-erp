# Notas Técnicas

Deuda técnica detectada durante el desarrollo. Solo se anota, no se corrige salvo que se pida explícitamente.

## Cobranza — manejo de conceptos de pago no es genérico

`RegistrarPagoView.post` (cobranza/views.py) no resuelve el marcado de "pagado" de forma genérica por `concepto`.
En su lugar tiene un bloque de código explícito por cada tipo de cargo: `mensualidad_ids`, `cuota_inscripcion_ids`
y ahora `cuota_solvencia_ids`. Cada nuevo tipo de cargo único-por-alumno (cuota, no recurrente) requiere repetir
el mismo patrón de `.filter(id__in=...).update(pagado=True, ...)` + `pago.<relacion>_pagadas.set(...)`.
Sería más mantenible abstraer esto en un mapa `{concepto: modelo}` o un método genérico en los modelos de cuota,
pero no se refactorizó para no tocar el flujo existente de mensualidades/inscripción sin necesidad.

## `periodo_escolar` activo no tiene una única fuente

No existe una función central `get_periodo_activo()`. Cada módulo referencia por separado
`ConfiguracionSistema.periodo_escolar_activo` o el campo `periodo_escolar` de la instancia de `Inscripcion`/`CuotaInscripcion`/`CuotaSolvencia`
correspondiente. El comando `generar_solvencias` requiere pasar `--periodo` manualmente en vez de leerlo de una fuente única.

## `CuotaInscripcion` no tiene CRUD administrativo (a diferencia de `CuotaSolvencia`)

`CuotaInscripcion` no está registrada en Django admin ni tiene endpoint propio para editar `monto_usd` fuera del
flujo automático de `InscripcionSerializer`. `CuotaSolvencia` sí se registró en `cobranza/admin.py` (edición masiva
por Django admin) y además se puede editar por alumno individual desde el módulo de Alumnos del frontend
(`ModalEditarAlumno.jsx` → campo "Solvencia 2025 - 2026" → `secretaria/alumnos/{id}/update_info/`), ya que por
diseño nace en $0 y se ajusta caso por caso.

## `monto_solvencia` en `AlumnoUpdateSerializer` acopla `secretaria` a `cobranza`

`AlumnoUpdateSerializer.update()` (secretaria/serializers.py) importa `CuotaSolvencia` de la app `cobranza` para
persistir el monto de solvencia junto con los demás datos del alumno. Es el mismo patrón usado para `Representante`
(otro modelo relacionado editado desde el mismo serializer), pero introduce un acoplamiento cruzado de apps que no
existía antes en este serializer. Si `cobranza` cambia su modelo de `CuotaSolvencia`, este punto se rompe también.

## `NotificadorService` (secretaria/services.py) quedó huérfano

Se retiró su única invocación (`cobranza/signals.py: procesar_notificacion_pago`), que mandaba un correo de
"recibo de pago" en texto plano sin adjunto ni verificación de resultado, duplicando al sistema nuevo
(`notificaciones/services.py: notificar_pago_exitoso`, con HTML, PDF adjunto, credenciales por área y
`NotificacionLog`). La clase y `enviar_correo`/`enviar_recibo_pago` siguen en el código pero ya no las llama nadie;
se puede eliminar cuando se confirme que no hay otro caller pendiente de migrar.

## `notificar_comprobante_subido` (portal/tasks.py) no usa el sistema de correo centralizado

A diferencia de `notificar_pago_exitoso`/`notificar_comprobante_inscripcion`, esta tarea (que avisa al staff de
cobranza que un representante subió un comprobante) usa `django.core.mail.send_mail` directo con
`settings.DEFAULT_FROM_EMAIL`, en vez de `enviar_email()` con el perfil SMTP por área (`PerfilEmailRemitente`).
Esto significa que: (1) no queda registrado en `NotificacionLog` para poder auditarlo desde el panel de
Notificaciones, y (2) usa las credenciales globales de `settings.py`/`.env` en vez de las de la pestaña
"Cobranza" configurada en Sistemas → Notificaciones. Se corrigió el `fail_silently=True` (que ocultaba fallos de
envío) pero no se migró a `enviar_email()` para no ampliar el alcance del fix pedido.

## Confirmación de pago solo cubre mensualidades

`task_notificar_pago_exitoso` (ahora conectado en `RegistrarPagoView` y `PortalComprobantePagoDetailView.patch`)
solo se dispara para pagos vinculados a una `Mensualidad`. Pagos de inscripción, cuota de solvencia o proyecto de
inversión no generan correo de confirmación al representante — no existe plantilla/función equivalente para esos
conceptos.

## `CuotaInscripcion.pagado` sigue siendo un booleano no derivado (a diferencia de `CuotaSolvencia`)

Se agregó `CuotaSolvencia.monto_pagado` y `save()` deriva `pagado`/`fecha_pago` automáticamente a partir de
`monto_pagado` vs `monto_usd` (ver cobranza/models.py), porque editar `monto_usd` después de cobrado dejaba la
cuota marcada `pagado=True` con deuda nueva invisible para `mora.py`. `CuotaInscripcion` tiene el mismo booleano
"plano" sin acumulador, pero hoy no le pega el mismo bug porque no tiene CRUD administrativo para editar su monto
(ver nota de arriba). Si en el futuro se habilita editar `CuotaInscripcion.monto_usd` desde algún lado, aplicar el
mismo patrón (`monto_pagado` + `save()` derivado) antes de exponerlo, o reaparecerá el mismo problema.

## Extracción de tablas de PDF en el conciliador (`cobranza/conciliacion.py::extraer_tabla_pdf`) — sin validar contra PDFs reales de bancos

Se agregó soporte de PDF al Conciliador Bancario vía `pdfplumber` (endpoint `POST /api/cobranza/conciliacion/extraer-pdf/`,
consumido por `useConciliador.js::extractRowsFromPdf`). Es genérico para cualquier banco: no asume el layout de
Bancaribe/Banesco/Tesoro en particular, solo extrae la tabla cruda y reutiliza `bankParsers.js::genericParse()`
(igual que Excel/CSV) para detectar columnas por nombre de encabezado.

Se probó con PDFs sintéticos (generados con `reportlab`, no con estados de cuenta reales de ningún banco) en dos
escenarios:
- **PDF con bordes de tabla reales**: `extract_table()` (estrategia por defecto de pdfplumber) funciona perfecto.
- **PDF de solo texto alineado por espacios (sin bordes)**: la reconstrucción de columnas es heurística
  (`vertical_strategy='text'`) y puede fallar si la descripción es larga y "invade" el espacio de la columna de
  monto — en una prueba, un valor de débito terminó dentro de la celda de descripción en vez de su propia
  columna. Esto hace que `parseAmount()` no encuentre un número válido en esa celda y la transacción se descarte
  silenciosamente en `genericParse()` (no se corrompe con un monto incorrecto, pero desaparece de la lista sin
  aviso — un representante buscando esa referencia no la encontraría).

✅ **Actualización**: se validó recreando el layout real que usa el usuario (columnas `Fecha | Oficina |
Referencia | Descripción | Cargo | Abono | Saldo`, con bordes de tabla reales y filas de resumen "SALDO FIN DIA"),
generado con `reportlab` a partir de una captura de pantalla real de un estado de cuenta. `extract_table()` con
bordes reconstruye las 7 columnas correctamente y las filas "SALDO FIN DIA" (sin referencia) se excluyen solas
por el filtro existente de `genericParse()`. Se probaron dos bugs reales encontrados en esa validación, ya
corregidos:
1. Una referencia larga (18-19 dígitos) que no cabe en una sola línea de su columna vuelve de pdfplumber con un
   `\n` interno (ej. `"1142001139734\n86432"`). Se agregó `cleanReferencia()` en `bankParsers.js` que quita todo
   el espacio en blanco (no solo lo colapsa) antes de comparar/mostrar la referencia, para reconstruir el número
   completo sin un espacio falso en medio.
2. El formato de fecha real (`01-JUL-2026`, día-mes abreviado en español-año) no coincidía con ningún patrón que
   `formatDate()` reconocía (solo `dd/MM/yyyy`, ISO y `dd-MM-yyyy` numérico). Se agregó soporte para
   `dd-MMM-yyyy` con un mapa `MESES_ES` (incluye variante `set`/`sep` para septiembre).

Sigue siendo best-effort para PDFs **sin** bordes de tabla (solo texto alineado por espacios) — ese caso no se
pudo validar contra un ejemplo real y la extracción vía `vertical_strategy='text'` puede fallar si las
descripciones son largas (ver estrategias en cascada en `extraer_tabla_pdf`). Si aparece un banco con ese layout,
conviene conseguir un PDF de ejemplo y repetir esta validación.

## `ClasificacionPagoManual` es un parche temporal — el camino real es que el desglose automático nunca falle

Se agregó `ClasificacionPagoManual` (cobranza/models.py) y los endpoints de `estado-clasificacion`/`clasificacion`/
`desglose-contable` (cobranza/views.py) para que el contador pueda etiquetar a mano (Inscripción / Proyecto de
Inversión / Mes Atrasado / Proyecto de Inversión Atrasado) los pagos donde `calcular_desglose_automatico()`
(extraída de `ComprobanteSerializer.get_desglose_conceptos`, ver cobranza/serializers.py) no encuentra líneas —
típicamente pagos `concepto='mixto'` cuyas relaciones M2M con `Mensualidad`/`CuotaInscripcion`/`CuotaSolvencia`/
`CuotaProyectoInversion` quedaron vacías (datos migrados, casos donde `RegistrarPagoView` no pudo enlazar el
concepto real, etc).

Esto es explícitamente un parche manual, no la solución de fondo. La solución de fondo es que **todo** pago quede
siempre con sus M2M correctamente enlazados al registrarse (o se corrija el flujo de `RegistrarPagoView` para los
casos donde hoy no se enlaza), de modo que `calcular_desglose_automatico()` cubra el 100% de los pagos y
`ClasificacionPagoManual` deje de ser necesaria salvo como mecanismo de excepción/corrección puntual. No se
investigó a fondo por qué el desglose automático queda vacío en los casos que hoy requieren clasificación manual
(no se identificó un patrón único: podría ser un solo origen o varios) — antes de invertir en automatizar esto,
conviene primero auditar `desglose-contable` en producción durante un tiempo para ver qué proporción de pagos cae
en `origen='sin_clasificar'`/`'manual'` vs `'automatico'`, y si hay un patrón común (mismo rango de fechas, mismo
método de pago, mismo flujo de registro) que apunte a la causa raíz real.

**Actualización — se hizo esa auditoría y reveló un bug aparte:** al correr el conteo (`calcular_desglose_automatico`
vs `ClasificacionPagoManual` sobre los 736 pagos activos), 721 (98%) ya estaban completamente explicados por el
desglose automático y solo 1 no tenía nada. Pero la pestaña "Clasificación de Pagos" (`EstadoClasificacionPagosView`
/ `_resumen_clasificacion_pago`) los mostraba TODOS como "Sin clasificar", porque nunca miraba el desglose
automático — solo `ClasificacionPagoManual`. El filtro era, en la práctica, inútil para el contador (98% falsos
positivos). Se corrigió: `_resumen_clasificacion_pago` ahora prioriza automático > manual, igual que
`DesgloseContableView`, y el estado se calcula por OPERACIÓN completa (suma de todos sus pagos "hermanos", ver nota
de arriba sobre `agrupar_pagos_historicos`), no por Pago suelto — porque el desglose automático (M2M) también vive
a nivel de operación, no de un pago individual. Nuevos valores de `estado_clasificacion`:
`sin_clasificar` / `parcial` / `completo_automatico` / `completo_manual` (antes solo existía `completo` genérico).
`EstadoClasificacionPagosView.get` precalcula todo en bloque (3 queries agregadas + 1 prefetch de M2M) en vez de
1-por-pago, porque recorre TODO el `qs` filtrado (no solo la página) para poder filtrar por estado — con la
versión ingenua esto hubiera sido un N+1 severo. Resultado tras el fix sobre el dataset actual: 722
`completo_automatico`, 7 `parcial`, 7 `sin_clasificar` (los que de verdad necesitan atención del contador).

En el frontend, `ClasificacionPagoModal` (`Reportes.jsx`) ahora usa `pago.monto_operacion_usd` (con fallback a
`monto_usd`) como denominador de la barra de progreso — para la mayoría de los pagos (sin hermanos) es el mismo
valor, pero para operaciones multi-método/multi-alumno refleja el total real de la operación en vez del monto
parcial de un solo hermano.

## `desglose-contable` podía duplicar montos de operaciones con varios Pago "hermanos"

`RegistrarPagoView.post` enlaza el mismo conjunto completo de M2M (`mensualidades_pagadas`,
`cuotas_inscripcion_pagadas`, `cuotas_solvencia_pagadas`, `proyectos_inversion_pagados`) a **todos** los `Pago`
creados en una operación (`for pago in pagos_creados: pago.<relacion>.set(...)`, cobranza/views.py ~L494-568) —
no solo al "principal". Como `DesgloseContableView` iteraba sobre cada `Pago` del rango y por cada uno
reconstruía el desglose automático completo de su operación (`calcular_desglose_automatico(principal)`), una
operación con 2+ hermanos (ej. un pago repartido en dos alumnos, o entre dos métodos de pago) hacía que el
reporte emitiera la lista completa de conceptos una vez por hermano, duplicando (o triplicando) el monto real
en el Excel/PDF que se le entrega al contador.

Se corrigió llevando un `set()` de `operacion_uuid` ya emitidas: el desglose automático de una operación ahora
se agrega una sola vez, usando los datos del pago "principal" (primero por `id` dentro de la operación) en vez
de repetirlo por cada hermano. Los otros dos orígenes de fila (`clasificaciones_manuales` y el fallback
`sin_clasificar`) no tenían este problema porque están atados a un `Pago` específico, no al M2M compartido.

Caso borde no cubierto: si el pago "principal" de una operación cae fuera del rango de fechas filtrado, o no
matchea el filtro `representante_documento` mientras un hermano sí, el desglose de esa operación no se emite
(en vez de duplicarse). Es preferible a duplicar montos, pero si en producción aparece este caso conviene
extender la búsqueda del principal a ignorar esos filtros (solo por `operacion_uuid`, sin las condiciones de
`qs`).

**Actualización — la causa de fondo real era otra, y ya estaba resuelta en el código:** al investigar por qué
seguía apareciendo duplicado después del fix de arriba, se encontró que el propio dataset de prueba (pagos del
2026-07-21) tenía docenas de operaciones con pagos "hermanos" que **no** compartían `operacion_uuid` — cada uno
tenía uno aleatorio distinto, aunque enlazaban las mismas cuotas. Esto es exactamente el bug que el commit
`2349fda` ("Agrupa pagos con varios métodos bajo una sola operación", 2026-07-22) ya corrigió en
`RegistrarPagoView` (antes generaba un `operacion_uuid` nuevo en vez de reusar uno por request) — pero el fix de
código no reparó retroactivamente los pagos ya guardados con el bug, que quedaron así en la base de datos usada
para esta auditoría. Ese mismo commit ya incluía `cobranza/management/commands/agrupar_pagos_historicos.py`
para fusionar esos pagos históricos por heurística (mismo alumno/cajero/concepto, ventana de segundos). Se corrió
`python manage.py agrupar_pagos_historicos --confirm` (2026-08-05): 361 pagos reasignados, 273 operaciones
fusionadas — eso, junto con el dedup por `operacion_uuid` de `DesgloseContableView` de arriba, es lo que elimina
la duplicación real observada en el reporte. Si vuelve a aparecer duplicación de este tipo en producción, correr
este comando de nuevo (es idempotente, dry-run por defecto) antes de sospechar de un bug nuevo.

Como defensa adicional contra que esto vuelva a pasar (doble clic en "Registrar pago", o reintentar un envío
sobre una selección de UI que quedó desactualizada), se agregó una validación en
`PagoCreateSerializer.validate()` (cobranza/serializers.py) que rechaza la operación si alguna
mensualidad/cuota de inscripción/cuota de solvencia/proyecto de inversión seleccionada YA está pagada — con
`select_for_update()` para cerrar la ventana de carrera entre dos envíos casi simultáneos dentro de la misma
transacción atómica de `RegistrarPagoView`. En el frontend (`Cobranza.jsx`) se agregó además un `ref` síncrono
(`enviandoPagoRef`) para que un doble clic muy rápido no llegue a disparar una segunda petición antes de que el
botón se deshabilite por estado de React.

## El checklist de "Resumen de Transacciones Detalladas" (conciliación) agrupaba por operación, no por banco

Después de correr `agrupar_pagos_historicos --confirm` (ver nota de arriba), operaciones legítimamente multi-método
(ej. Jorge Tremont: Punto de Venta + Transferencia + Efectivo Bs. en un solo registro) empezaron a mostrarse como
UNA sola fila con UN solo checkbox de "revisado" en `Reportes.jsx` (sección Conciliación), porque el agrupamiento
en `gruposPorRepresentante` usaba solo `operacion_uuid` como clave. El problema: cada método de pago corresponde a
un extracto bancario distinto (Punto de Venta → Tesoro, Transferencia → Banesco, etc.), así que compararlos contra
el estado de cuenta real requiere poder marcarlos como conciliados de forma independiente — agruparlos bajo un
único checkbox obliga a marcar como "revisado" un banco cuyo extracto todavía no se comparó, solo porque comparte
operación con otro que sí.

Se corrigió agregando método de pago + banco a la clave de agrupación (`claveConciliacion(p)` en `Reportes.jsx`,
usada en `operacionesInfo`, `gruposPorRepresentante`, `detalleChecked` y `handleFinalizarLote`): una operación
multi-método ahora se muestra como varias filas (una por combinación método+banco), cada una con su propio
checkbox, pero `handleFinalizarLote` sigue enviando `pago_ids` individuales al backend igual que antes, así que
no cambió el contrato con `LoteRevisionCajaListCreateView`. El "Desglose Contable" (`DesgloseContableView`,
nota de arriba) es un reporte distinto y no se tocó: ahí sí se quiere un solo total por operación, sin importar
cuántos métodos la compongan.

## Filtro por concepto/banco en Clasificación de Pagos: `PagoFilter` ya tenía un campo `concepto` con otro significado

Se agregaron filtros `concepto` y `banco` a `EstadoClasificacionPagosView` (tabla en pantalla) además de
`DesgloseContableView` (Excel/PDF, ver nota de arriba), para que lo que el contador ve en pantalla sea lo mismo
que va a imprimir. El significado de `concepto` aquí es la categoría canónica del desglose (mensualidad/
inscripcion/solvencia/proyecto_inversion/otro — ver `_categoria_concepto_desglose`), que SÍ detecta pagos
`concepto='mixto'` cuyo desglose automático toca esa categoría.

Al implementarlo apareció un bug: `EstadoClasificacionPagosView` arma su queryset con `PagoFilter`
(cobranza/filters.py), que **ya tiene su propio campo `concepto`** — un filtro exacto contra `Pago.concepto`
crudo (`mensualidad|inscripcion|materiales|proyecto_inversion|multa|otro`, sin `mixto` como opción value). Como
`PagoFilter` procesaba `request.query_params` completo, el `concepto=inscripcion` que se pensaba para mi lógica
de categoría canónica lo interceptaba primero `PagoFilter`, filtrando el queryset a pagos con
`Pago.concepto == 'inscripcion'` exacto — **excluyendo todos los pagos 'mixto'**, que son justamente los que más
necesitan este filtro (un pago mixto que cubre inscripción + proyecto de inversión desaparecía del filtro
concepto=inscripcion). El conteo bajó de 655 pagos esperados a 38.

Se corrigió excluyendo `concepto` de los query params antes de pasarlos a `PagoFilter` (`params_sin_concepto = 
request.query_params.copy(); params_sin_concepto.pop('concepto', None)`), y aplicando el filtro de categoría
canónica por separado, en bloque, después. Nótese que a diferencia de `DesgloseContableView` (donde cada FILA es
un concepto y la suma de todos los filtros da el total exacto), aquí cada fila es un PAGO completo — un pago
mixto con 2 conceptos aparece en los resultados de AMBOS filtros, así que la suma de todas las categorías puede
superar el total sin filtrar. Es el comportamiento correcto para esta tabla (mostrar qué pagos tocan cada
concepto), pero es una diferencia de semántica a tener en cuenta si se comparan los conteos de ambos endpoints.

## Excel del desglose contable no puede resaltar en color las filas `sin_clasificar`

El PDF (`Reportes.jsx::handleExportClasifPdf`) pinta de rojo claro las filas con `origen='sin_clasificar'` vía
`jspdf-autotable`'s `didParseCell`. El Excel (`handleExportClasifExcel`) no puede replicar esto: el proyecto usa
`xlsx` (SheetJS community build), que no soporta estilos de celda (relleno/color) — eso requiere la edición Pro.
Como paliativo se agregó una columna `Estado` con el texto literal `SIN CLASIFICAR`/`Manual`/`Automático` para que
el contador pueda filtrar/ordenar por esa columna en Excel. Si en el futuro se necesita el resaltado visual real,
evaluar `exceljs` (sí soporta estilos, pero es una librería nueva a introducir — consultar antes de agregarla).
