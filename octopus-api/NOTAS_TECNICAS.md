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

## Ya no existe una herramienta para backfillear `CuotaInscripcion` de alumnos YA promovidos (con grado)

`CargarCuotasInscripcionView` (secretaria/views.py, botón del panel) y el comando `generar_cuotas_inscripcion`
(cobranza/management/commands/) ahora comparten el mismo criterio: solo alumnos activos SIN `grado_seccion` (no
inscritos). Antes del cambio, el comando servía específicamente para el caso contrario — alumnos YA promovidos por
`PromocionAlumnosView` (que sí tienen `grado_seccion` del nuevo período) a quienes por algún error se les había
promovido sin generarles la `CuotaInscripcion`/`CuotaProyectoInversion` correspondiente. Ese caso de uso quedó sin
cobertura automática: si vuelve a ocurrir, hay que crear las cuotas a mano (Django admin/shell) o escribir un
comando puntual, ya que ninguno de los dos puntos de entrada actuales las genera para alumnos con grado asignado.

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

## Cantina — Fase 8: contradicción encontrada y corregida (`PortalComprobantePagoView` no validaba referencia cruzada contra `cantina.RecargaTarjeta`)

Durante la revisión de Fase 8 (pulido final) se comparó `cantina.md` §5.9 contra la implementación real. `cobranza/serializers.py` y `cantina`'s `RecargarTarjetaCajeroView`/`PortalRecargarTarjetaView` (portal/views.py) ya delegaban correctamente en `pagos_comunes.referencias.buscar_referencia_duplicada` (la fuente única de verdad para "esta referencia ya se usó en cualquier módulo de pagos"), con tests explícitos cubriendo el caso cruzado en ambas direcciones.

Pero `PortalComprobantePagoView` (portal/views.py, endpoint `POST /api/portal/comprobante/` — el que sube el comprobante de pago de una **mensualidad**) tenía su propio bloque "ANTIFRAUDE 4" con consultas inline contra `ComprobantePago`/`cobranza.Pago` solamente — nunca llamaba a la función compartida ni sabía que `cantina.RecargaTarjeta` existe. Efecto práctico: exactamente el escenario que motivó crear `pagos_comunes/referencias.py` (ver cantina.md §5.9, "alguien podría pagar una mensualidad con un comprobante de transferencia y reutilizar el mismo número de referencia para 'pagar' una recarga de cantina, o viceversa") seguía sin bloquearse en este endpoint específico, y no había ningún test cubriéndolo.

Se corrigió agregando un chequeo adicional (ANTIFRAUDE 4b) que llama a `buscar_referencia_duplicada` y rechaza con 409 si la referencia ya está en uso en `cantina.RecargaTarjeta` — sin tocar el comportamiento existente de los chequeos contra `ComprobantePago`/`Pago` (que siguen intactos). Se agregó `portal/tests.py::PortalComprobanteTests::test_rechaza_referencia_ya_usada_en_recarga_de_cantina` cubriendo el caso. Suite completa (`cantina` + `cobranza.tests` + `portal.tests`, 201 tests) corre en verde tras el fix.

**Nota sobre la ordenación de validaciones (verificada, sin bug):** se revisó específicamente si `PortalRecargarTarjetaView` repetía el mismo patrón de IDOR que se corrigió recientemente en `PortalComprobantePagoView` (validar campos antes que ownership). No es el caso: `PortalRecargarTarjetaView` valida `alumno_id` requerido y el enum de `metodo_pago` (ninguno depende del objeto) y recién después verifica que el alumno pertenezca al representante autenticado (líneas ~763-773) — antes de tocar banco/monto/referencia, que sí son específicos del objeto. El orden es correcto.

## Cantina — contradicción de permisos entre `cantina.md` y la implementación real (cajero con acceso total, no solo POS)

`cantina.md` §2/§5.8/§6.1 documenta que el Cajero solo debe operar `/cantina/pos` y `/cantina/cierre-caja`, mientras que gestión de inventario, tarjetas (generar lote/asignar/reponer) y reportes quedan restringidos a `administrador`/`director` vía la clase `EsAdminCantina`. En el código real, **todas** las vistas de `cantina/views.py` (incluyendo `GenerarLoteTarjetasView`, `AsignarTarjetaView`, `ReponerTarjetaView`, `TarjetasListView`, `ProductosListCreateView`, `MovimientoInventarioCreateView`, `AnularVentaView`, `AprobarRecargaView`/`RechazarRecargaView`, `ReporteVentasView`, `ExportarVentasExcelView`, y las vistas nuevas fuera de spec `ParametroCantinaView`/`AjustarCreditoTarjetaView`/`ReporteMorosidadView`) usan `EsCajeroOAdmin`, no `EsAdminCantina` — hay comentarios explícitos en el código ("DECISIÓN DE PERMISO: el cliente confirmó explícitamente que el cajero debe tener el mismo nivel de acceso que administrador/director en todo el módulo cantina") documentando que fue un cambio de alcance posterior, pedido por el cliente. La clase `EsAdminCantina` (`cantina/permissions.py`) sigue definida pero ya no la usa ninguna vista — queda muerta en el código.

Esto es consistente con el conjunto actual de tests (`cantina/tests_reportes.py::test_cajero_tiene_el_mismo_acceso_que_admin`, `cantina/tests_credito_morosidad.py::test_cajero_tiene_el_mismo_acceso_que_admin`, etc.) y con el frontend (`App.jsx` ya usa `allowedRoles={['cajero', 'administrador', 'director']}` en las rutas de tarjetas/inventario/reportes) — backend y frontend están alineados entre sí, así que **no es un bug funcional**. Pero **`cantina.md` nunca se actualizó** para reflejar esta decisión: el documento sigue diciendo que el Cajero "no gestiona tarjetas, solo vende con ellas en el POS" (§5.8) y que las rutas de Tarjetas/Inventario/Reportes quedan restringidas a `['administrador', 'director']` (§6.1) — quien lea el spec sin mirar el código real se lleva una idea equivocada del modelo de permisos vigente. Vale la pena actualizar cantina.md (o al menos anotar el cambio ahí) para que quede como fuente de verdad real. Considerar también eliminar `EsAdminCantina` de `permissions.py` si definitivamente no se va a volver a usar, o dejarla documentada como "reservada por si el cliente revierte la decisión".

## Cantina — `PortalRecargarTarjetaView` no exige el formato de referencia de 6 dígitos que sí exige `RecargarTarjetaCajeroView`

`cantina/serializers.py` (`RecargaTarjetaSerializer`) valida que `pago_movil`/`transferencia` traigan una referencia numérica de exactamente 6 dígitos (regla nueva de cantina, cantina.md §5.9 punto 3), y `RecargarTarjetaCajeroView` la usa. `PortalRecargarTarjetaView` (portal/views.py) arma y valida sus campos a mano (no reutiliza ese serializer) y solo exige que la referencia no esté vacía para esos métodos — no valida el formato de 6 dígitos. Efecto práctico: un representante puede enviar una referencia con letras o de cualquier longitud desde el portal, mientras que la misma recarga hecha por un cajero en caja con la misma referencia sería rechazada. No es un problema de seguridad (la deduplicación cruzada sí corre igual en ambos casos), solo una inconsistencia de validación de formato entre los dos caminos de entrada del mismo dato. Si se quiere unificar, aplicar la misma regex/`isdigit()+len==6` en `PortalRecargarTarjetaView` antes de crear la `RecargaTarjeta`.

## Sitio Institucional (CMS) — Fase 3, deuda pendiente

- **Resuelto en Fase 3**: creación de páginas desde el admin. Se agregó `POST /api/sitio/admin/paginas/con-secciones/`
  (`sitio/views.py::PaginaConSeccionesAdminView`, atómico) y `CrearPaginaModal.jsx` (metadatos + galería de 9
  plantillas + "página en blanco", catálogo en `octopus-frontend/src/components/sitio/plantillas.js`, portado de
  `octopus-sitio/src/templates/index.js`). El flujo completo (crear página → elegir plantilla → editar bloques →
  publicar → verla en el sitio público) ya es usable sin tocar Django admin/shell.
- **[RESUELTO] Edición de metadatos de una página existente.** `TablaPaginas.jsx`'s `onEditar` (en `GestionSitio.jsx`)
  ahora abre `EditarPaginaModal.jsx` (nuevo, reutiliza el paso 1 de `CrearPaginaModal.jsx` sin el selector de
  plantilla) con título/es_home/mostrar_en_menu/seo_titulo/seo_descripcion precargados y llama a `updatePagina`
  al guardar. El `slug` se muestra solo lectura porque el backend lo autogenera una única vez (`Pagina.save()` en
  `sitio/models.py` solo lo setea si está vacío) y es read-only en `PaginaListSerializer`/`PaginaDetalleSerializer`.
  Verificación: `npm run build` compila sin errores. La verificación manual en navegador (login → editar página →
  guardar → tabla refrescada) quedó pendiente por no contar con credenciales de director/sistemas en este entorno.
- **La plantilla "Artículo · Lectura" (`articulo-lectura` en `octopus-sitio/src/templates/index.js`) queda fuera
  de la galería de páginas del admin.** Su composición usa `tipo: 'cuerpo'`, que no existe en `Seccion.TIPO_CHOICES`
  — es diseño para el detalle de un `Articulo` (modelo distinto, con su propio campo `cuerpo` de rich text), no una
  `Pagina`. `ArticuloDetalle.jsx` (sitio público) sigue con su renderer simple sin animar; conectarlo al sistema de
  diseño de `templates/_kit` (o a `ArticuloLectura.jsx`, ya implementado pero sin usar en el flujo real) queda
  pendiente.
- **[RESUELTO] 6 variantes de `cards` sin tratamiento visual propio en `BloqueCards`.** Se implementaron
  `CardsHito` (línea de tiempo vertical con filete/punto de marca), `CardsPasos` (secuencia numerada con conector
  `ArrowRight` en desktop), `CardsContacto` (icono + dato en tarjeta compacta, clicable si trae `url`),
  `CardsDestacada` (primer item a doble ancho con foto, resto en rejilla menor), `CardsLista` (filas compactas con
  filete y thumbnail, tipo índice de boletín) y `CardsAgenda` (insignia de icono + evento en filas) en
  `octopus-sitio/src/templates/_kit/bloques.jsx`, cada una como sub-componente propio (no cae al estilo genérico de
  `contenidas`). Todas reutilizan exclusivamente la forma de `item` ya fijada en el contrato (§4 de
  `SITIO_CONTRATO_API.md`: `icono`/`imagen`/`titulo`/`texto`/`url`), respetan `prefers-reduced-motion` (vía
  `Revelar`/`ItemStagger`/`Tarjeta` existentes) y son mobile-first (grid sin columnas en el breakpoint base, se
  abren en `sm`/`lg`). Verificado con `npm run build` (compila sin errores) y `npx eslint` sobre el archivo (sin
  errores nuevos). **Pendiente de verificación visual en navegador**: las 5 plantillas que las usan
  (Nosotros·Cronología, Admisiones·Ruta, Contacto·Recepción, Noticias·Boletín, Eventos·Agenda) siguen con
  `implementada: false` en `octopus-sitio/src/templates/index.js` — no tienen componente de página propio ni datos
  demo en `datosDemo.js`, así que no hay ruta para verlas montadas end-to-end en `/plantillas` todavía (eso es
  trabajo de otra tarea: crear los 5 archivos de plantilla + su demo). Para revisar cada variante hoy, importar el
  `Bloque*` directo con datos de prueba (mismo patrón que `HomeUmbral.jsx`) o esperar a que se cree la plantilla
  completa.
- **[RESUELTO] `BloqueCarrusel` no era operable sin puntero (hallazgo QA Fase 5, severidad media).** Los botones
  prev/next tenían `className="hidden ... sm:flex"`, ocultos por debajo de 640px, y no había ningún binding de
  teclado — en mobile (~375px) un usuario sin touch/drag (teclado, switch device) no tenía forma de avanzar el
  carrusel. Fix en `octopus-sitio/src/templates/_kit/bloques.jsx` (`BloqueCarrusel`): los botones ahora se
  muestran en todos los viewports (se quitó `hidden`/`sm:flex`, quedan siempre visibles a 44×44px), se agregó un
  handler `manejarTeclado` (← / → llaman `emblaApi.scrollPrev()`/`scrollNext()`) en el contenedor del carrusel
  (`tabIndex={0}`, `role="region"`, `aria-roledescription="carousel"`) y también en los propios botones, y se
  sumaron atributos ARIA (`aria-label` descriptivo en los botones, `role="group"`/`aria-roledescription="slide"` +
  `aria-label` de posición en cada slide). El autoplay ya respetaba `prefers-reduced-motion` (vía `useReducedMotion`
  de Framer Motion) desde antes, sin cambios ahí. No se agregó ninguna librería nueva (binding manual, sin plugin de
  teclado de Embla). Verificado con `npm run build` (compila sin errores) y `npx eslint` sobre el archivo (mismo
  único error preexistente en `ICONOS_DISPONIBLES`, confirmado con `git stash` que ya existía antes de este cambio).
- **`config_estilo` (ancho/espaciado_top/espaciado_bottom/fondo) y `animacion` de `Seccion` no siempre tienen
  efecto visual una vez conectados al renderer animado.** `RenderSeccion.jsx` (sitio público) los pasa como props a
  cada `Bloque*` de `_kit/bloques.jsx`, pero varios de esos componentes fijan su propio ancho/espaciado/animación
  por variante en vez de leer las props (`BloqueHero`, `BloqueGaleria`, `BloqueCta`, `BloqueTestimonios`,
  `BloqueCarrusel` no aceptan `espaciadoTop`/`espaciadoBottom`/`ancho`; solo `Hero`, `TextoImagen` y `Cards`
  respetan `animacion`). Es intencional en el sistema de diseño del kit ("grilla estructurada por bloque", ver
  `DESIGN_SYSTEM.md`), pero el panel de propiedades del admin (`PanelPropiedadesBloque.jsx`) sigue ofreciendo esos
  controles para **todos** los tipos de bloque sin distinción, así que un director puede cambiar, por ejemplo, la
  animación de un CTA desde el editor y no ver ningún cambio en el sitio publicado. Si se quiere cerrar del todo,
  hay dos caminos: (a) hacer que cada `Bloque*` del kit respete esas props, o (b) que `PanelPropiedadesBloque`
  oculte/deshabilite los controles que no aplican según `tipo`.
- **Resuelto**: advertencia de Tiptap "Duplicate extension names found: ['link']". `EditorArticulo.jsx` registraba
  `@tiptap/extension-link` explícitamente además de `StarterKit`, que ya incluye su propia configuración de `Link`.
  Se corrigió pasando `StarterKit.configure({ link: false })` para dejar la extensión `Link` explícita como única
  fuente de esa funcionalidad.
- **[RESUELTO] Contraste insuficiente en pills/botón sobre `--color-primario` fijo a `text-white` (bug de accesibilidad
  encontrado en QA de Fase 5, no anotado antes).** `octopus-sitio/src/pages/Articulos.jsx` (pills de categoría) y
  `octopus-sitio/src/pages/NotFound.jsx` (botón "Volver al inicio") ponían `bg-[var(--color-primario)] text-white`
  directo, en vez de usar el token `--marca-primario-texto` que el resto del kit calcula por luminancia WCAG
  (`textoSobre()` en `octopus-sitio/src/templates/_kit/tema.js`, aplicado en `aplicarTemaColegio`). Con colores de
  marca claros (ej. `#d671cd` usado en QA) el texto blanco fijo da 2.96:1, por debajo del 4.5:1 que exige WCAG AA.
  Se corrigió reemplazando `text-white` por `style={{ color: 'var(--marca-primario-texto)' }}` en ambos archivos —
  mismo patrón ya usado en `Seccion`/`Boton` (`_kit/primitivos.jsx`) y `_kit/chrome.jsx` — sin tocar el fondo
  (`--color-primario`). El token se recalcula en `ConfiguracionProvider` (`context/ConfiguracionContext.jsx`, envuelve
  toda la app) apenas llega la config del sitio, y tiene fallback `#ffffff` en `styles/tokens.css` mientras tanto
  (mismo comportamiento transitorio que ya tenían `Seccion`/`Boton`, no es una regresión nueva). Verificado con
  `npm run build` y `npx eslint` sobre ambos archivos, sin errores.
- **`Media` en el sitio público requiere `request.build_absolute_uri()` en cada serializer que la expone**
  (`sitio/serializers.py`: `_media_a_dict`, `expandir_media_en_contenido`, y los `context={'request': request}`
  agregados en las vistas públicas de `sitio/views.py`). Si se agrega un nuevo endpoint público que devuelva
  `Media` (directa o anidada en `Seccion.contenido`), hay que recordar pasar `context={'request': request}` al
  serializer o las imágenes volverán a salir con URL relativa (rota en el origen del sitio público, que corre en
  otro dominio/puerto).
- **[RESUELTO] QA Fase 5 — página publicada con `secciones: []` renderizaba un `<div>` vacío sin `<h1>`.**
  `octopus-sitio/src/pages/PaginaDinamica.jsx` y `Home.jsx` no distinguían "página sin bloques" de "página con
  contenido": el backend permite publicar una `Pagina` con `secciones: []`, y el frontend simplemente mapeaba el
  array vacío, dejando un contenedor sin heading entre header y footer (mala accesibilidad, sin señal de qué pasó).
  Ahora ambos componentes, cuando `pagina.secciones.length === 0`, renderizan un estado propio con `<h1>{pagina.titulo}</h1>`
  (el título ya viene en `PaginaPublicaSerializer`) y el texto "Esta página todavía no tiene contenido." — no es un
  error, es un estado normal de página nueva.
- **[RESUELTO] QA Fase 5 — `articulo.autor?.nombre` se leía en `ArticuloDetalle.jsx` pero el endpoint público nunca
  lo exponía.** `ArticuloPublicoSerializer` (`sitio/serializers.py`) no incluía `autor` en `fields`, así que el
  byline del artículo nunca se mostraba. Se agregó `autor` como `SerializerMethodField` que devuelve
  `{'nombre': obj.autor.get_full_name() or obj.autor.username}` (o `None` si `autor_id` es null — el FK
  `Articulo.autor` admite `null=True`), sin exponer email ni otros datos del `Usuario`. También se agregó `'autor'`
  al `select_related` de `ArticuloDetallePublicoView` para no sumar una query extra. `ArticuloDetalle.jsx` no
  necesitó cambios: ya esperaba exactamente esa forma (`articulo.autor?.nombre`).
- **[RESUELTO] QA Fase 5 — no había forma de crear un `Menu` (`principal`/`footer`) desde el panel admin,
  bloqueante en instalación nueva.** `MenuListAdminView` (`sitio/views.py`) solo tenía `GET`; `TabMenu` en
  `GestionSitio.jsx` solo listaba/editaba ítems de menús ya existentes. En una instalación nueva
  `Menu.objects.all()` está vacío y no había ninguna acción en la UI para crear el primero, así que la navegación
  pública (`LayoutPublico.jsx`, que pide `getMenu('principal')`/`getMenu('footer')`) quedaba vacía para siempre a
  menos que alguien lo creara por Django admin/shell. Se agregó `POST api/sitio/admin/menus/` (mismo permiso
  `IsDirectorOrSistemas` que el resto de vistas admin del módulo) con `MenuInputSerializer` nuevo
  (`sitio/serializers.py`): `nombre` restringido por `ChoiceField` a `'principal'`/`'footer'` (únicos valores que
  el sitio público consulta, confirmado en `LayoutPublico.jsx`) y `validate_nombre` que devuelve 400 con mensaje
  claro si el menú ya existe (antes hubiera sido un 500 de `IntegrityError` por el `unique=True` del modelo).
  Frontend: `createMenu(nombre)` en `api/sitio.service.js` (mismo patrón que el resto del archivo) y `TabMenu`
  (`GestionSitio.jsx`) ahora muestra un estado vacío dedicado cuando no hay ningún menú (guía para crear
  `principal` y `footer` con dos botones) y, una vez que hay al menos uno, una barra con botón de creación para
  el que falte — usa `react-toastify` para éxito/error y refresca la lista tras crear. Verificado con
  `manage.py check` y, vía `manage.py shell` simulando requests con `APIClient` (sin credenciales de
  director/sistemas reales disponibles en este entorno): sin auth → 401; usuario con `perfil.rol='sistemas'` →
  `GET` vacío devuelve `[]`, `POST {'nombre': 'principal'}` → 201, `POST` duplicado → 400 con mensaje claro,
  `POST {'nombre': 'sidebar'}` (no permitido) → 400. `npm run build` compila sin errores. No existe una suite de
  tests para la app `sitio` en el proyecto (no se creó una nueva, según el alcance de esta tarea).
- **[RESUELTO] Auditoría del módulo — la galería de plantillas de `CrearPaginaModal` (paso 2) no ofrecía ninguna
  vista previa real, solo tarjetas de texto (nombre/familia/resumen), y `ConstructorPaginas` tampoco tenía forma de
  ver cómo quedaba una página en edición sin publicarla.** Se agregó un flujo de "vista previa" de extremo a extremo
  que reutiliza el motor de render animado real (Framer Motion/Embla, scroll-reveal/parallax/stagger incluidos) del
  sitio público en vez de una réplica simplificada:
  - **Backend**: modelo nuevo `PreviewSesion` (`sitio/models.py`, migración `0003_previewsesion`) — payload JSON +
    token opaco (`secrets.token_urlsafe`) + `expira_en` (TTL 30min). Persistido en tabla (no cache de proceso)
    porque el backend corre con varios workers gunicorn y el token se genera en uno y se lee en otro.
    `POST admin/paginas/<id>/preview/` (`PaginaPreviewAdminView`) genera el token a partir de las secciones REALES
    de una página guardada, sea cual sea su `estado` (a diferencia del endpoint público, que solo sirve
    `publicado`). `POST admin/preview-plantilla/` (`PreviewPlantillaAdminView`) hace lo mismo para secciones
    "sueltas" que todavía no son una `Pagina` (el catálogo de `plantillas.js`), validadas con
    `SeccionPlantillaSerializer`/`PreviewPlantillaInputSerializer` nuevos. `GET preview/<token>/`
    (`PreviewPublicoView`, `AllowAny`) es el único endpoint público que no filtra por `estado='publicado'` — el
    token opaco de 32+ bytes es la credencial. Purga oportunista de sesiones vencidas en cada creación (sin cron
    dedicado — volumen esperado bajo).
  - **`octopus-sitio`**: ruta nueva `/preview/:token` (`pages/PaginaPreview.jsx`, dentro de `LayoutPublico` para que
    la vista previa incluya el header/footer reales) — mismo `RenderSeccion` que `PaginaDinamica.jsx`, con un
    banner sticky "Vista previa — sin publicar". `vite.config.js` fija `server.port: 5174` (antes tomaba el 5173
    por default, el mismo que `octopus-frontend`, imposible correr ambos dev servers a la vez).
  - **`octopus-frontend`**: `CrearPaginaModal.jsx` — cada tarjeta de plantilla muestra, en vez de la descripción de
    texto que tenía antes, una miniatura ANIMADA real (`MiniVistaPrevia`): un `<iframe>` a `/preview/<token>` de
    octopus-sitio (el mismo motor de render, con sus animaciones) renderizado a tamaño "laptop" (1440×900) y
    escalado con `transform: scale()` a partir del ancho real de la tarjeta (`ResizeObserver`, no un valor fijo —
    la tarjeta va en 1 o 2 columnas según breakpoint). Las 9 vistas previas del catálogo se piden en paralelo
    apenas se abre el modal (`Promise.allSettled`, un fallo individual no bloquea al resto) para que ya estén
    listas al llegar al paso 2. Cada tarjeta conserva un botón "expandir" (ícono `Maximize2`, superpuesto arriba a
    la derecha) para abrir esa misma vista previa en una pestaña completa.
    `ConstructorPaginas.jsx` — botón "Vista previa" (deshabilitado si la página no tiene bloques) que llama a
    `crearPreviewPagina(pagina.id)`. Ambos usan la env var nueva `VITE_SITIO_URL`
    (`http://localhost:5174` en dev, `https://clhma.com` en prod — agregada a `.env`/`.env.production`) para armar
    la URL, porque el sitio público corre en otro *origin* que el panel admin en producción
    (`deploy/nginx/clhma.com.conf`: `clhma.com` sirve `octopus-sitio/dist`, `app.clhma.com` sirve el panel + la
    API) — de paso corrige un bug preexistente: el botón "Ver sitio público" del header de `GestionSitio.jsx` hacía
    `window.open('/', '_blank')`, que en producción abre la raíz del propio panel admin, no el sitio público.
  - Verificación: `manage.py check` + migración aplicada; extremo a extremo con `APIClient` simulando request de un
    superusuario (`preview-plantilla` → 200 con token, `preview/<token>/` sin auth → 200 con el payload esperado,
    token inválido → 404 con mensaje claro). `npm run build` compila sin errores en `octopus-frontend` y
    `octopus-sitio`; `npx eslint` sin errores nuevos en los archivos tocados (los 4 errores que reporta
    `react-compiler` en `ConstructorPaginas.jsx`/`GestionSitio.jsx` son preexistentes, en código no tocado por este
    cambio). Confirmado en el navegador (Vista pública real corriendo en `localhost:5174/preview/<token>`): renderiza
    hero + CTA con el banner de vista previa, sin errores de consola. No se pudo probar el flujo completo por UI del
    panel admin (login → crear página → clic en "Ver cómo queda") por no contar con credenciales de
    director/sistemas en este entorno.
- **[RESUELTO] Seguimiento del punto anterior — el mockup de cada tarjeta en `CrearPaginaModal` no mostraba nada
  usable: los bloques de una plantilla usaban `contenidoPorDefecto()`, que existe para sembrar un bloque EN BLANCO
  recién agregado (título genérico, `items`/`imagenes`/`slides` vacíos) — así que `cards`/`testimonios`/`carrusel`/
  `galeria` renderizaban sus estados vacíos ("Sin cards agregadas", etc.) y `hero`/`texto_imagen`/`cta` mostraban
  el ícono `ImageOff` en vez de una foto.** Se agregó `contenidoDemoPorTipo` en `plantillas.js` — genera contenido
  de ejemplo (2-6 items según el tipo, con texto placeholder en español y fotos vía `https://picsum.photos/seed/
  <id>-<bloque>-.../<ancho>/<alto>`, deterministas por seed para no "parpadear" entre renders) que reemplaza a
  `contenidoPorDefecto()` solo al construir el catálogo de plantillas (`contenidoPorDefecto` sigue intacto para su
  uso original: agregar un bloque en blanco desde `ConstructorPaginas`). El hero de cada plantilla también usa
  ahora el `resumen` real de esa plantilla como subtítulo, en vez del genérico "Subtítulo del bloque".
  `resolverImagenUrl` (`bloques/utils.js`, admin) y `urlVariante` (`octopus-sitio/src/lib/media.js`, sitio público)
  se generalizaron para aceptar tanto el objeto `Media` expandido `{variantes, alt_text}` como un string URL
  directo — antes solo aceptaban el objeto, así que las fotos demo (strings) no hubieran resuelto en ninguno de
  los dos renderers. **De paso se encontró y corrigió un bug real preexistente, no introducido por este cambio**:
  `BloqueGaleria` (`octopus-sitio/src/templates/_kit/bloques.jsx`) leía `img.media`, pero el contrato
  (`SITIO_CONTRATO_API.md` §4: `{"media_id": 12, "caption": "..."}`), el backend (`sitio/serializers.py::
  _CLAVES_MEDIA_ID`) y el propio preview del admin (`Galeria.jsx`) usan `media_id` — las imágenes de galería
  jamás se habían renderizado en el sitio público real. Verificación: `npm run build`/`npx eslint` sin errores
  nuevos en ambos frontends; en el navegador, generando un preview de prueba con `APIClient` (hero + cards +
  galería + cta con fotos demo) se confirmó vía `document.querySelectorAll('img')` que las 8 imágenes (incluidas
  las de galería, ya con el fix) cargan (`complete: true`, `naturalWidth/Height` correctos) — las 2 que aparecían
  pendientes eran `loading="lazy"` fuera del viewport inicial, comportamiento esperado, no un fallo.
- **[RESUELTO] Auditoría de Fase 0 (2026-08-20) — imágenes rotas dentro del Editor visual del panel admin (Hero,
  Texto+Imagen, Galería, Cards, CTA, Testimonios, Carrusel, y el logo/favicon de la pestaña Config), aunque el
  sitio público y el flujo de "Vista previa" se vieran bien.** Causa raíz: 10 instancias de
  `SeccionSerializer`/`PaginaDetalleSerializer`/`ArticuloListSerializer`/`ArticuloDetalleSerializer`/
  `ConfiguracionSitioSerializer` en `sitio/views.py` (listar/crear/editar/publicar/despublicar secciones, páginas,
  artículos y configuración) se instanciaban sin `context={'request': request}`, así que `_media_a_dict` (y el
  `ImageField` nativo de DRF para `logo`/`favicon`) devolvía URLs relativas (`/media/sitio/media/variantes/1/
  03_md.webp`) en vez de absolutas. El navegador resolvía esa URL relativa contra el origen del panel admin en vez
  del backend — confirmado con `fetch()` directo: la respuesta era el `index.html` del fallback SPA de Vite
  (`content-type: text/html`, 200 OK), no la imagen. Mismo patrón que el bug ya resuelto antes para los endpoints
  públicos, reaparecido del lado admin en los sitios que quedaron fuera de aquel fix. Se agregó `context` en los 10
  call-sites de `sitio/views.py`. Verificado en navegador: recargando el Editor visual de una página con Hero +
  imagen, la imagen de fondo carga correctamente contra `localhost:8000` (antes devolvía el HTML del panel).
- **[RESUELTO] Auditoría de Fase 0 (2026-08-20) — la sanitización de HTML dejaba visible el código fuente de
  `<script>`/`<style>` inyectado, tanto en `Seccion.contenido['texto']` (bloques) como en `Articulo.cuerpo`
  (Tiptap).** Causa raíz: `bleach.clean(..., strip=True)` elimina las etiquetas no permitidas pero conserva su
  texto interno — para `<script>`/`<style>` eso deja el código JS/CSS crudo como contenido visible de la página
  publicada (confirmado con datos ya almacenados en la base de pruebas: `hi<script>alert(1)</script>` se había
  guardado como `'hialert(1)'`). No era XSS ejecutable (bleach sí quita el tag y el navegador no ejecuta
  `<script>` insertado vía `dangerouslySetInnerHTML`), pero sí contenido roto servido al público. Se agregó
  `_eliminar_elementos_peligrosos` (`sitio/serializers.py`, regex `<(script|style)\b[^>]*>.*?</\1>`) que remueve el
  elemento completo (tag + contenido) antes de pasar por `bleach.clean`, aplicado en `sanitizar_html_articulo` y
  `_sanitizar_texto_seccion`. Verificado: reproducción exacta del payload en shell (`hi<script>alert(1)</script>
  bye` → ahora `'hibye'`, antes `'hialert(1)'`) y en navegador, re-guardando la sección de prueba y confirmando en
  `octopus-sitio` que el texto publicado ya no contiene `alert(1)`.
- **Deuda anotada, no corregida en esta auditoría**: ninguna `Pagina` en la base de pruebas tiene `es_home=True`
  publicada, y el panel admin no avisa en ningún lugar cuando falta una home publicada — el sitio público en `/`
  cae al 404 genérico sin que el director se entere de por qué. No es un bug de código (el 404 es el comportamiento
  correcto por diseño), es un hueco de usabilidad — candidato natural para la fase de personalización/UX, no para
  esta fase de solo-bugs. También queda anotado: cuando `Media.alt_text` está vacío, el frontend usa el nombre de
  archivo original como alt ("03.png") — no rompe nada pero es inútil para lectores de pantalla.

### Fase 2 — Personalización (2026-08-20)

Alcance aprobado: patrones de bloque reutilizables, plantillas de página propias del usuario, papelera/duplicar
páginas, historial mínimo de edición, y los 2 hallazgos de usabilidad de la auditoría anterior (aviso de home sin
publicar, alt_text de imágenes). El sistema de tema (colores, tipografía, estilo de botones/menú/footer) y la
personalización por bloque (`config_estilo`: ancho/espaciado/fondo) ya existían de sesiones previas — no se
reimplementaron, solo se documentó su alcance real en el plan antes de codificar.

- **Modelos nuevos** (`sitio/models.py`, migración `0005`): `PatronBloque` (tipo/contenido/animación/config_estilo,
  igual shape que `Seccion` pero desacoplado de cualquier página) y `PlantillaPagina` (secciones congeladas como
  lista JSON). `Pagina` gana `actualizado_por` (FK, historial mínimo) y `eliminado_en` (soft-delete/papelera).
- **Papelera**: enviar a la papelera fuerza `estado=borrador` y `es_home=False` — los endpoints públicos (que ya
  filtraban por `estado=publicado`) excluyen páginas en papelera sin tocarlos. `DELETE paginas/<id>/` ahora
  rechaza con 400 si la página no pasó antes por la papelera (`eliminado_en is None`) — el borrado permanente solo
  es alcanzable desde la vista de papelera, como red de seguridad. Endpoints: `POST .../papelera/`,
  `POST .../restaurar/`, `GET paginas/papelera/`.
- **Duplicar página**: `POST paginas/<id>/duplicar/` copia página + secciones (deepcopy de `contenido`/
  `config_estilo`), slug con sufijo automático, siempre en borrador y sin `es_home`.
- **Historial mínimo**: `actualizado_por` se setea no solo en PATCH de metadatos, sino en cualquier edición real de
  contenido — crear/editar/eliminar/reordenar secciones (`_marcar_pagina_actualizada`, `sitio/views.py`) — de lo
  contrario el historial hubiera quedado engañoso (la forma más común de "editar una página" es tocar sus bloques,
  no sus metadatos).
- **Patrones de bloque**: `GET/POST api/sitio/admin/patrones/`, `DELETE .../<id>/`. Se insertan en cualquier
  página vía el flujo normal de creación de sección (`POST paginas/<id>/secciones/`), así que pasan de nuevo por
  `sanitizar_contenido_seccion` al insertarse — sin superficie de XSS nueva.
- **Plantillas de página del usuario**: `GET/POST api/sitio/admin/plantillas-usuario/`, `DELETE .../<id>/`,
  `POST paginas/<id>/guardar-como-plantilla/` (congela las secciones actuales de una página ya existente).
  **Bug encontrado y corregido durante la implementación, antes de llegar al frontend**: la respuesta de
  `PlantillaPaginaSerializer` expande `media_id` a `{id, variantes, alt_text}` (necesario para el mockup con fotos
  reales en `CrearPaginaModal`), pero `PaginaConSeccionesAdminView` esperaba el id crudo — si el frontend hubiera
  reenviado la forma expandida como `secciones` al crear una página, se habría guardado el dict completo en vez del
  id en `Seccion.contenido`, rompiendo el contrato (`SITIO_CONTRATO_API.md` §4) en cuanto alguien usara una
  plantilla de usuario. Se resolvió con un flujo dedicado: el frontend manda `plantilla_usuario_id` en vez de
  `secciones`, y el backend copia las secciones RAW de `PlantillaPagina.secciones` directo en el servidor, sin pasar
  por el paso de expansión. Verificado con `APIClient`: el valor guardado en `Seccion.contenido['imagen_fondo']` es
  `int`, no `dict`.
- **Aviso de home sin publicar**: `GestionSitio.jsx` chequea si alguna página publicada tiene `es_home=True` y
  muestra un banner si no — resuelve el hallazgo de usabilidad de la Fase 0.
- **Alt text**: se dejó de auto-rellenar con el nombre de archivo al subir (`BibliotecaMedia.jsx`); ahora sugiere
  completarlo con un toast no bloqueante, y se conectó al frontend el PATCH de `alt_text` que ya existía en el
  backend (`MediaDetailAdminView.patch`) pero no se usaba desde ningún lado — se puede editar la descripción de una
  imagen ya subida desde su modal de detalle.
- Verificado end-to-end en navegador real (no solo API): crear patrón desde un bloque existente → aparece en "Tus
  patrones" del menú "Agregar bloque" → insertarlo crea una sección nueva; guardar página como plantilla → aparece
  en "Tus plantillas" de `CrearPaginaModal` con mockup de fotos reales → crear página desde ella; enviar página a
  la papelera → desaparece del listado normal → aparece en la papelera → restaurar → vuelve como borrador;
  duplicar página → copia en borrador con slug `-copia`.
- **Deuda técnica, no implementada en v1**: no hay UI para editar el nombre o eliminar patrones/plantillas de
  usuario desde otro lugar que no sea el momento de crearlos (el `DELETE` existe en el backend, falta el botón en
  el admin). No se reimplementó lock optimista ni versionado de contenido — el historial es de solo lectura
  (quién/cuándo), sigue como deuda ya anotada en fases anteriores.

### Fase 3 — Editor con preview en tiempo real (2026-08-20)

Alcance aprobado: reemplazar el flujo de "Vista previa" (token → abrir pestaña nueva, requería regenerar el token
y recargar para ver cada cambio) por un panel embebido que reacciona mientras se edita, sin recargar y sin pegarle
al backend en cada tecla. Se optó por **compartir el motor de render real** (`octopus-sitio` en un `<iframe>`) en
vez de mantener un tercer renderer propio del admin — el motor de admin (`EditorVisual/bloques/*.jsx`,
`PreviewBloque.jsx`) y el público (`octopus-sitio/src/templates/_kit/bloques.jsx`) ya se habían desincronizado una
vez (bug de `media_id` vs `media` en Galería, ver más arriba); agregar un tercero solo repetía el riesgo.

- **Mecanismo**: `postMessage` entre el panel admin (padre) y el iframe `/preview/<token>` de `octopus-sitio`
  (hijo), no fetch ni polling. El admin genera el token una sola vez al activar "Vista en vivo"
  (`crearPreviewPagina`, mismo endpoint que ya usaba el botón "Vista previa"), y de ahí en adelante empuja
  `{type: 'sitio-preview-update', token, pagina: {titulo, secciones}}` con debounce de 300ms cada vez que cambia
  `secciones` o el título — sin generar un token nuevo ni recargar el `<iframe>` en cada edición.
- **`octopus-sitio/src/pages/PaginaPreview.jsx`**: agrega un listener de `message` que sobreescribe el estado
  renderizado cuando recibe un `sitio-preview-update` con el `token` correcto. El fetch inicial por token (`GET
  preview/<token>/`) se mantiene intacto como carga inicial y como fallback — el botón "Vista previa" original
  (abre `/preview/<token>` en pestaña nueva, sin padre que le mande postMessage) sigue funcionando exactamente
  igual que antes, sin cambios de comportamiento.
- **Seguridad del postMessage**: el listener del iframe solo acepta mensajes de `event.source === window.parent`
  (si alguien más lo iframea, solo afecta a su propio iframe) y valida que el `token` del mensaje coincida con el
  de la URL — un mensaje mal dirigido o de otro preview no se aplica.
- **`ConstructorPaginas.jsx`**: botón "Vista en vivo" (toggle) agrega una tercera columna con el `<iframe>` cuando
  está activo (`lg:grid-cols-[1fr_320px_380px]`); se resetea (token, listo) al cambiar de página. Un indicador
  (ícono `Radio`, verde cuando el iframe ya confirmó estar listo para recibir) evita la falsa sensación de "está
  en vivo" antes de que el iframe realmente haya cargado.
- Verificado en navegador real: activar "Vista en vivo" → el iframe carga con el motor real de `octopus-sitio`
  (animaciones, imágenes correctas) → editar el título del Hero en el panel de propiedades → el iframe se
  actualiza en el momento, sin parpadeo de recarga → desactivar el toggle vuelve al layout de 2 columnas sin
  errores de consola nuevos.
- **Deuda técnica, no implementada en v1**: sigue sin haber edición inline (clic sobre el bloque dentro del
  propio preview) — el flujo es panel de propiedades → preview reactivo al lado, no clic-para-editar-en-sitio.
  Evaluado en el plan como el paso intermedio razonable dado el alcance; edición inline requeriría que
  `RenderSeccion` (público) sepa entrar en "modo edición" dentro del iframe, cambio más grande que no se abordó
  acá. El indicador "listo" es una señal simple (booleano), no un ack por mensaje — si el iframe se recarga por
  error del navegador sin que el admin se entere, el indicador podría quedar en verde con el iframe en realidad
  esperando un nuevo "listo"; impacto bajo (el siguiente cambio de contenido dispara un nuevo postMessage de
  cualquier forma) pero queda anotado.

## Cantina — notificaciones push usan el tipo `'factura'`, no existe un tipo `'cantina'` dedicado

`notificaciones_cantina.notificar_recarga_aprobada`/`notificar_saldo_negativo` (Fase 6) envían push vía
`_push_representante(..., 'factura', ...)`. `_tipos_push_default()` en `notificaciones/models.py` solo contempla
`['circular', 'nota', 'factura', 'mensaje']` — no hay un tipo `'cantina'`, y agregarlo requeriría una migración en
`notificaciones` (fuera del alcance de la Fase 6, que no debía tocar modelos). Efecto práctico: un representante
puede desactivar solo las notificaciones de "factura" desde sus preferencias de push y sin darse cuenta también
apagaría los avisos de recarga aprobada / saldo negativo de cantina — no puede desactivar unas sin las otras. Si
se quiere que sean independientes, agregar `'cantina'` a `_tipos_push_default` (migración de datos, no de esquema,
ya que `tipos_activos` es un campo JSON) y actualizar las dos llamadas en `cantina/notificaciones_cantina.py`.

## RRHH / Nómina — dos modelos `Empleado` independientes; se agregó un vínculo opcional, no una fusión

Una auditoría encontró que `rrhh.Empleado` (`rrhh/models.py`) y `nomina.Empleado` (`nomina/models.py`) son dos
modelos totalmente independientes y desconectados, sin ninguna FK entre sí, con campos distintos (ej.
`sueldo_base` en `rrhh` vs `sueldo_base_ves` en `nomina`, moneda y validaciones distintas) y ciclos de vida
propios (`activo` en `rrhh.Empleado` no existe en `nomina.Empleado`). Esto es deuda de diseño histórica: ambos
módulos se construyeron por separado y cada uno mantiene su propio maestro de empleados. Riesgo concreto: un
empleado desactivado en RRHH puede seguir generando registros de nómina, y los datos personales/salariales de
ambos módulos pueden divergir sin ninguna alerta.

**Lo que se hizo (aditivo, sin tocar datos existentes):**
- Se agregó `nomina.Empleado.empleado_rrhh`, `ForeignKey('rrhh.Empleado', null=True, blank=True,
  on_delete=models.SET_NULL, related_name='registros_nomina')` — migración `nomina/migrations/
  0003_empleado_empleado_rrhh.py`. Todos los registros existentes quedan con `empleado_rrhh=NULL` hasta que se
  vinculen manualmente; no se corrió ningún backfill ni matching automático por cédula (podría cruzar mal si hay
  datos sucios entre los dos maestros).
- Se agregó `POST /api/nomina/empleados/<id>/vincular-rrhh/` (`nomina/views.py::VincularEmpleadoRRHHView`,
  protegido con `IsSystemAdminOrDirector` igual que el resto del módulo) para que un administrador vincule (o
  desvincule, enviando `rrhh_empleado_id: null`) manualmente un `nomina.Empleado` con su `rrhh.Empleado`
  correspondiente.
- `nomina/serializers.py::EmpleadoSerializer` ahora expone `empleado_rrhh` (id) y dos campos de solo lectura,
  `empleado_rrhh_activo` (bool o `null` si no hay vínculo) y `empleado_rrhh_nombre`, para que el admin pueda ver
  de un vistazo si hay divergencia de estado activo/inactivo entre los dos módulos.

**Lo que queda pendiente (fuera de alcance de este fix):** la unificación real — un único modelo `Empleado`
fuente de verdad, con `rrhh` y `nomina` como módulos que lo consumen en vez de duplicarlo — es una decisión de
producto y una migración de datos no trivial (hay que decidir qué campos gana cada lado, cómo se concilian
`sueldo_base`/`sueldo_base_ves`, y migrar los `Empleado` y sus relaciones existentes de ambas tablas sin perder
historial de `RegistroNomina`). No se implementó aquí para no tocar datos reales sin revisión previa. Tampoco se
agregó ninguna vista/UI en el frontend para consumir el nuevo endpoint de vinculación — eso queda como trabajo
de frontend a futuro si se decide usar este vínculo activamente.

## `LoginView` (`authentication/views.py`) es un login admin duplicado y sin usar

El frontend del panel administrativo nunca llamó a `POST /api/authentication/login/` (`LoginView`) — desde
siempre usa `POST /api/token/` (`CookieTokenObtainPairView`, `authentication/cookie_views.py`), que reutiliza el
mismo `MyTokenObtainPairSerializer` pero devuelve el refresh en cookie httpOnly en vez de en el body. `LoginView`
quedó como una segunda implementación de login (con su propio throttle, su propio `LogAuditoria.objects.create(...,
accion="INICIO_SESION")` y, hasta esta tarea, un rechazo explícito de `rol == 'docente'`) que ningún cliente
alcanza. Efecto colateral: el login real (`/api/token/`) nunca registra `LogAuditoria`, solo lo hacía la vista
muerta. No se tocó `LoginView` en esta tarea (login del staff se unificó sobre `/api/token/`, no sobre este
endpoint) pero vale decidir si se elimina o si se le migra el audit log a `CookieTokenObtainPairView`.

## El logout del staff (panel admin/docente/cajero) no invalida el refresh en el servidor

`AuthContext.logout()` (`src/context/AuthContext.jsx`) solo borra el access token en memoria — nunca llama a
`POST /api/authentication/logout/` (`LogoutView`, que sí hace blacklist del refresh token y borra la cookie). El
comentario en el propio archivo ya lo marca como "Opcional: llamar al backend... si se implementa blacklisting" —
o sea, `LogoutView` existe y funciona, pero no está conectado. Antes de esta tarea esto solo afectaba al panel
admin; ahora que docente/cajero comparten `AuthContext`, hereda el mismo hueco (antes tampoco lo cerraban:
`DocenteAuthContext`/`CantinaAuthContext` sólo borraban `localStorage`, sin blacklist). Efecto: un refresh token
robado sigue siendo válido hasta que expira (24h) aunque el usuario cierre sesión.

## `RegistrarPagoView` llamaba `task_notificar_pago_exitoso.delay()` sin try/except — bug real, corregido

Durante la sesión de remediación (auditoría de buenas prácticas → plan de blindaje) se encontró que
`cobranza/views.py::RegistrarPagoView.post`, al vincular mensualidades, llamaba
`task_notificar_pago_exitoso.delay(...)` sin envolver la llamada en try/except — a diferencia del mismo patrón en
`portal/views.py::PortalComprobantePagoDetailView.patch`, que sí lo hace con un comentario explícito ("el pago ya
quedó confirmado en BD y no debe revertirse solo porque no se pudo encolar el aviso"). Efecto real: si Celery/Redis
está caído (o tarda en responder) en el momento de registrar un pago de mensualidad, el endpoint respondía 500 al
cajero aunque el `Pago` ya se había guardado correctamente — el cajero ve un error y puede reintentar creyendo que
el pago no se registró, arriesgando un doble cobro. Se corrigió aplicando el mismo try/except con `logger.error`
que ya usa `portal/views.py`. No se encontró evidencia de que este bug ya se hubiera manifestado en producción
(depende de que Redis esté caído en el momento exacto de un pago de mensualidad), pero el código no tenía ninguna
protección contra ese escenario.

## `anular_pago` (cobranza/correcciones.py) no soporta pagos vinculados a Proyecto de Inversión

Se agregó la Función C del módulo de Corrección de Pagos (`anular_pago` + `AnularPagoView`,
`POST /api/cobranza/pagos/<id>/anular/`) para formalizar el flujo de reembolso/anulación que antes no existía
(`Pago.estatus='anulado'` se filtraba en varios lados pero nunca se seteaba desde ningún endpoint). Revierte
`pagado=False` en mensualidades/cuotas de inscripción, y `monto_pagado=0` en `CuotaSolvencia` (que deriva
`pagado` en `save()`).

**No soporta** pagos con `proyectos_inversion_pagados` — `CuotaProyectoInversion.monto_pagado` acumula abonos
parciales (`cuota.monto_pagado = min(cuota.monto_pagado + abono, cuota.monto_usd)` en `RegistrarPagoView`), y no
queda registrado en ningún lado cuánto abonó *este* pago específico a *esta* cuota — solo el acumulado total de
la cuota. Restar a ciegas el `monto_usd` del pago podría dejar `monto_pagado` incorrecto si hubo más de un abono
a la misma cuota. `anular_pago` rechaza explícitamente estos casos con un mensaje que pide ajuste manual por
Sistemas. Si se necesita automatizar esto, hay que primero registrar el abono por pago-cuota (una tabla
intermedia con el monto exacto), no solo el acumulado en la cuota.

## Nombre completo de usuario (first_name/last_name) — deuda encontrada durante la implementación

- `cobranza/serializers.py` tiene dos campos llamados `usuario_nombre` (líneas ~122 y ~190,
  `CierreCajaSerializer`/similar) que en realidad exponen `source='...username'`, no un nombre. El nombre
  del campo es engañoso — deberían llamarse `usuario_username` o exponer de verdad `nombre_completo`. No se
  tocó porque cambiar el nombre del campo rompe el contrato de API vigente (regla explícita de esta tarea:
  "No rompas contratos de API vigentes"); habría que agregar un campo nuevo y deprecar el viejo en una tarea
  aparte.
- `pages/GestionSedes.jsx` / `hooks/useUsuariosSede.js` (modal "Asignar usuario a sede") NO crean usuarios —
  asignan un `PermisoSede` a un usuario ya existente, buscado por `username` o `email`
  (`multisede/views.py::UsuariosSedeView.post`). El backend no acepta ni usa `first_name`/`last_name` ahí.
  El Paso 8 original pedía agregar esos campos a ese formulario; se omitió tras confirmarlo con el usuario
  porque no tendría efecto (el backend los ignoraría).
- `portal/pages/PortalPerfil.jsx` y `portal-docente/pages/DocentePerfil.jsx` ya usan
  `first_name`/`last_name` con fallback a `username` para el nombre del representante/docente, pero con
  lógica inline propia en vez del helper `utils/nombreUsuario.js` (son módulos de portal, fuera del alcance
  explícito del Paso 7 de esta tarea, que solo listó pantallas del panel admin). Deberían migrarse al
  helper único en una pasada futura para evitar duplicar la lógica de fallback.
- `UserManagementViewSet.partial_update` (`authentication/views.py`) está reservado exclusivamente a las
  acciones `reactivar`/`cambiar_rol` — nunca invoca `UserSerializer.update()`. Hoy no existe ningún endpoint
  de PATCH parcial para editar `first_name`/`last_name`/`email` de un usuario existente desde Sistemas; solo
  el PUT completo (`update()` estándar del ViewSet) pasa por el serializer. Si se quiere permitir editar
  nombre/apellido sin reenviar todos los campos (incluida `password`), habría que agregar soporte explícito
  en `partial_update` o exponer un endpoint dedicado.
- 13 usuarios existentes en la base de datos (al `2026-08-28`) quedaron sin `first_name`/`last_name`
  completos tras el Paso 1 (`AbstractUser` no los tenía poblados previamente): `admin`, `anarelis16`,
  `andrilugo`, `beatrizleal`, `director`, `ednysm`, `lilianalopez`, `mariamendez`, `mayerlincuauro`,
  `mmolina`, `nelidaguanipa`, `pruebadiag01`, `secprimaria`. Mientras no se completen a mano (vía
  `python manage.py completar_nombres --aplicar <csv>`), `nombreUsuario()` cae al `username` para ellos.

## Cargos Especiales Dinámicos (generalización de CuotaProyectoInversion) — alcance de PASO 1/2

- `cobranza/mora.py::annotate_mora_detalle` (`monto_proyecto_inversion_adeudado`) sigue filtrando SOLO por
  la semilla histórica "Proyecto de Inversión" (vía `services.tipo_cargo_proyecto_inversion()`), no por
  `bloquea_inscripcion=True` como sí hace `_condicion_mora` (que si detecta correctamente cualquier
  `TipoCargoEspecial` bloqueante en mora). Es deliberado: esa columna alimenta un renglón con la etiqueta
  fija "Proyecto de Inversión Adeudado (USD)" en morosos/Excel (`ExportarMorososExcelView`,
  `constants/reportes.js:49-51`, `ClasificacionPagosTab.jsx`) y en `sincronizar_solvencias`. Si se crean
  otros `TipoCargoEspecial` desde el PASO 3 (API) en adelante, su deuda SÍ cuenta para `en_mora`/bloqueo de
  inscripción, pero NO aparece en esa columna específica ni en el choice
  `('proyecto_inversion', 'PROYECTO DE INVERSIÓN')` de `cobranza/serializers.py:102` — haría falta una
  columna/desglose por tipo en un trabajo aparte (PASO 4 lo señala como pendiente explícito).
- `anular_pago` (`cobranza/correcciones.py`) generalizó solo el mensaje de error a "cargo especial"; la
  limitación funcional de fondo (no soporta pagos vinculados a NINGÚN `CuotaProyectoInversion`, sin importar
  el `tipo_concepto`) sigue igual — ver sección anterior sobre `anular_pago` y Proyecto de Inversión.
