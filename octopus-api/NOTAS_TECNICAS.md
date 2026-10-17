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

## Módulo "Cobros por WhatsApp" — el flujo de email de mora queda huérfano funcionalmente

Con WhatsApp como canal principal de cobranza, `notificar_mora()` (notificaciones/services.py) sigue enviando el
correo de mora día 0/5/10/15 tal cual estaba (no se tocó, para no ampliar el alcance de este cambio). Si el
colegio decide desactivar por completo el email de cobranza, ese código y las plantillas `mora_dia_*.html`
quedarían sin uso real — no se eliminó porque `ConfiguracionNotificaciones.dias_recordatorio_1/2` /
`dias_alerta_director` siguen siendo la fuente de verdad del cronograma y también los usa el envío WhatsApp
legado en `notificar_mora()` (distinto del nuevo `cobro_whatsapp.py`, que es on-demand y no corre por Celery).

## `enviar_whatsapp(..., template_data=...)` (Modo B) no se probó contra la API real de Meta/Twilio

El payload `type: template` de `_wa_meta` y el `content_sid`/`content_variables` de `_wa_twilio` se construyeron
siguiendo la documentación oficial, pero no hay forma de verificarlos end-to-end sin una cuenta de WhatsApp
Business API con una plantilla aprobada real. Los tests (`notificaciones/tests_cobro_whatsapp.py`) solo verifican
que se llame a `requests.post` con `type='template'`, no la respuesta real de Meta. Antes de activar Modo B en
producción, probar con `ProbarNotificacionView` (o un envío real) contra una plantilla aprobada.

## Selección múltiple / envío masivo de cobros WhatsApp no se implementó

Quedó fuera de alcance de esta fase (solo tendría sentido en Modo B, con plantilla Meta aprobada, ya que Modo A
requiere que la secretaria abra `wa.me` una vez por representante). Si se activa Modo B a futuro, `Morosos.jsx`
necesitaría selección de filas + un endpoint que reciba una lista de `representante_cedula` en vez de uno solo.

## Dev DB local traía migraciones de `cobranza` sin aplicar (0044/0045)

Durante la verificación en navegador de este módulo se detectó que el SQLite de desarrollo no tenía aplicadas
`cobranza.0044_reglarecargopago_dia_desde_and_more` y `cobranza.0045_cuotainscripcion_monto_pagado`, lo que rompía
con 500 tanto `/api/cobranza/morosos/` (ya existente) como el nuevo `previsualizar-cobro-whatsapp` (ambos usan
`cobranza/mora.py`). Se aplicaron sobre el DB local de este entorno; no es un problema del código nuevo, pero vale
la pena confirmar que no ocurra lo mismo en staging/producción antes de desplegar.

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

## Recargo por Pago Tardío (`ReglaRecargoPago`/`resolver_recargo`) — no cubre `CuotaInscripcion`/`CuotaSolvencia`

- Solo se implementó para `Mensualidad`. Extenderlo a `CuotaInscripcion`/`CuotaSolvencia` no está hecho porque
  esos modelos no tienen mes/fecha de vencimiento propia — `cobranza/mora.py` las da por vencidas desde que se
  CREAN (no existe un "día límite" configurable como `dia_limite_pago`/`dia_aplicacion`), así que un recargo
  "a partir del día N del mes" no está definido para ellas sin antes decidir qué fecha usar como ancla
  (¿fecha de creación de la cuota? ¿inicio del período escolar?). Eso es una decisión de negocio nueva, fuera
  de alcance de esta entrega.
- El modelo actual no requeriría una migración destructiva para extenderlo si se decide hacerlo después:
  `LineaRecargoPago.mensualidad` (FK directa a `Mensualidad`) tendría que generalizarse a una FK genérica
  (`ContentType` + `object_id`) o agregar FKs opcionales paralelas (`cuota_inscripcion`, `cuota_solvencia`),
  y `ReglaRecargoPago` necesitaría un campo que indique a qué tipo de cargo aplica cada regla.
- `tipo='descuento'` **ya está implementado** (ver sección "Descuento por Pago Dentro de Rango" más abajo) —
  este bullet queda solo como referencia histórica de que antes no lo estaba.
- `cobranza/utils_pdf.py::generar_recibo_pdf` no tenía desglose línea por línea para NINGÚN concepto antes de
  este cambio — solo mostraba el `monto_usd`/`tasa_aplicada`/`monto_ves` agregado del `Pago` completo (una
  sola celda "Monto en Divisas"). Es una limitación preexistente, no algo introducido por esta feature: se
  agregó desglose únicamente para mensualidad+recargo (el caso que pedía esta entrega); inscripción, solvencia
  y proyecto de inversión siguen sin desglosarse en el PDF, aunque `calcular_desglose_automatico`
  (`cobranza/serializers.py`, consumido por `ComprobanteSerializer` en la API de reimpresión) sí los desglosa
  desde antes — solo el PDF generado por `generar_recibo_pdf` se quedó atrás.
- `RegistrarPagoView.post` no valida hoy (ni antes ni después de este cambio) que la suma de `pagos` cubra
  exactamente el monto esperado de las mensualidades/cuotas seleccionadas — no existía esa validación en el
  código antes de esta feature, así que no se agregó una nueva para el recargo tampoco (se mantuvo el mismo
  nivel de confianza en el monto que envía el frontend). Si se decide agregar esa validación en el futuro,
  debe sumar `monto_usd + recargo` por mensualidad, no solo `monto_usd`.
- Cuando una operación de pago se divide en varios "pagos hermanos" (métodos mixtos, mismo `operacion_uuid`),
  el M2M `mensualidades_pagadas` ya se enlaza igual a TODOS los pagos de la operación (patrón preexistente,
  no introducido aquí). Para no duplicar el monto del recargo en el desglose contable, `LineaRecargoPago` se
  asocia únicamente al PRIMER pago creado de la operación (`pagos_creados[0]`) — el mismo criterio que usa
  `ComprobanteSerializer._get_principal_con_conceptos` (ordenado por `id`) para elegir el "pago principal" de
  la operación al desglosar. Si en el futuro se necesita saber cuánto de CADA método cubrió el recargo
  específicamente, haría falta un cambio de modelo (hoy no se rastrea esa relación para ningún concepto).

## Descuento por Pago Dentro de Rango (`ReglaRecargoPago tipo='descuento'`/`resolver_descuento`)

- **Mecanismo de "abono fantasma"**: a diferencia del recargo (dinero EXTRA cobrado, nunca toca
  `Mensualidad.monto_usd`/`monto_pagado`), el descuento debe CERRAR la mensualidad aunque el representante pague
  menos de `monto_usd`. Se resolvió acreditando el monto perdonado (`monto_descontado_usd`) directamente a
  `monto_pagado` en `RegistrarPagoView`, sin tocar `monto_usd` — así `mora.py`, `solvencia_reportes.py` y todo
  cálculo de saldo existente (`monto_usd - monto_pagado`) sigue funcionando sin cambios. La alternativa (reducir
  `monto_usd` permanentemente) se descartó por tocar ~10 lugares del código. Si en el futuro se necesita
  distinguir "cuánto pagó el representante" de "cuánto se le perdonó" en algún reporte financiero/contable que
  hoy no lo separe, ese dato vive en `LineaDescuentoPago.monto_descontado_usd`, no en `Mensualidad`.
- **Una sola regla global activa** (`tipo='descuento'`), sin alcance por sede, igual que el recargo. No se
  soportan rangos múltiples no solapados (ej. "5-8 → $31" y "15-18 → $30" simultáneos) — habría que cambiar la
  constraint de unicidad en `ReglaRecargoPago.clean()` y agregar validación de solape entre rangos.
- **Modo único**: solo "monto final" (`modo_calculo` forzado a `monto_fijo_usd`). No se implementaron "restar
  $X" ni "restar X%" — si se necesitan, agregar nuevos valores a `MODOS` y su lógica en
  `descuentos.py::resolver_descuento`.
- **Validación de solape con mora**: `ReglaRecargoPago.clean()` bloquea en duro el solape entre la regla de
  descuento y la de recargo (ambas globales), pero NO valida contra `Alumno.dia_limite_pago` (mora, que es
  POR ALUMNO) — no se puede garantizar sin solape para todos los alumnos con una sola regla global. Queda como
  advertencia a criterio del admin al configurar, no como bloqueo.
- **Sin reporte agregado**: no existe un reporte de "descuentos otorgados" (análogo a `ReporteCostoBecasView`).
  El único rastro es `LineaDescuentoPago` por pago individual (desglose del recibo/JSON contable). Si se pide,
  sería una vista nueva que sume `LineaDescuentoPago` por rango de fechas.
- **Portal y pantalla de cobro admin solo muestran el descuento de mensualidades "vencidas"** (mes actual o
  anterior, ver `mensualidades_pendientes`/`mensualidades_vencidas`) — los adelantos de meses futuros
  (`mensualidades_futuras`) no se enriquecen con `resolver_descuento`, porque el rango de la regla se evalúa
  contra el mes PROPIO de la mensualidad y normalmente no coincide con "hoy" para un mes futuro. Si alguna vez
  se necesita cotizar el descuento de un adelanto (pagar octubre en septiembre, dentro del rango de octubre),
  habría que enriquecer también esa lista.
- **Gap preexistente corregido de paso, no introducido por esta feature**: antes de este cambio, la pantalla de
  cobro admin (`BuscarAlumnoCobranzaView`/`Cobranza.jsx`) no mostraba el recargo por pago tardío en absoluto en
  el preview, y el total a cobrar (`subtotalAlumnoUSD`/`sumarLista` en el frontend) se calculaba con
  `monto_usd` bruto en vez del saldo real — un cajero que no escribiera el monto a mano habría cobrado de
  menos en una mensualidad con recargo (o de más en una con descuento, antes de esta corrección). Se corrigió
  como parte de esta entrega porque el descuento lo necesitaba para funcionar correctamente, y de paso quedó
  arreglado también para el recargo. Sigue sin existir una validación server-side de que el monto de los
  `pagos` cubra exactamente lo esperado (ver bullet de recargo más arriba) — el frontend ahora calcula bien el
  default, pero un cajero todavía puede sobreescribir el monto a cualquier valor sin que el backend lo rechace.

## `InscripcionStatsView` (indicador de inscripciones del Dashboard) duplica la ocupación por grado de `cobranza/stats/`

Al implementar `GET /api/secretaria/inscripciones/stats/` (`secretaria/views.py::InscripcionStatsView`) para el
nuevo indicador de inscripciones del Dashboard administrativo, dos puntos quedan anotados sin corregir (fuera de
alcance de esa tarea):

1. **`ConfiguracionGrado` no está sedeada.** El modelo (`secretaria/models.py`) no tiene campo `sede` — es global
   para todo el sistema, deuda técnica ya conocida de antes. Como resultado, `ocupacion.por_grado` de este nuevo
   endpoint (y su `global_pct`) se calcula cruzando TODAS las configuraciones de grado existentes contra los
   inscritos ya filtrados por sede/período del usuario — el conteo de inscritos por grado sí respeta la sede,
   pero el catálogo de grados contra el que se cruza (y por lo tanto qué grados aparecen y sus `cupos_maximos`)
   es global, no de la sede del usuario. El resto del indicador (`total_inscritos`, `por_tipo_ingreso`,
   `mes_actual`, `documentos_pendientes`, `serie_mensual`) sí queda correctamente filtrado por sede porque no
   depende de `ConfiguracionGrado`.
2. **Ocupación por grado duplicada entre dos bloques del Dashboard.** `cobranza/views.py::DashboardStatsView`
   (bloque financiero/cobranza existente, `GET /api/cobranza/dashboard-stats/` o ruta equivalente) ya calcula y
   expone su propia ocupación por grado (`grados: [{grado, cupos_maximos, cupos_utilizados, total_alumnos,
   morosos}]`), basada en `Alumno.objects.filter(activo=True)` por grado — no en `Inscripcion` del período activo.
   Ahora el Dashboard tiene DOS indicadores de "ocupación por grado" con semántica ligeramente distinta (alumnos
   activos por grado vs. inscripciones del período activo por grado) y ninguno delega en el otro. Queda pendiente
   decidir si unificarlos (un solo cálculo de ocupación reutilizado por ambos bloques) o mantenerlos separados
   porque miden cosas distintas a propósito — no se tomó esa decisión en esta tarea para no tocar el bloque
   financiero/cobranza existente.

De paso, se movió `_periodo_escolar_activo()` (antes vivía solo en `academico/services.py`, con
`ConfiguracionSistema`/`Nota` importados a nivel de módulo desde `secretaria`/`academico`) a un helper neutral
nuevo `common/periodo.py::periodo_escolar_activo()`, para que `secretaria` pudiera consultar el período activo sin
crear un ciclo de imports `secretaria → academico → secretaria`. `academico/services.py::_periodo_escolar_activo`
se dejó como alias que delega en el helper nuevo (mismo comportamiento y mismo fallback), porque otros módulos de
`academico` siguen importándolo por ese nombre.

## Frontend — "Ocupación por grado" no es una Row propia de `Dashboard.jsx`

El documento de tarea del módulo de Solvencia asumía que `pages/Dashboard.jsx` tenía un bloque "Ocupación por
grado" como una Row independiente (Row 4) donde montar el nuevo bloque "Solvencia por grado" justo debajo. En
el código real, "Ocupación por grado" es una `Card` colapsable (`ocupacionAbierta`) que vive DENTRO de
`components/dashboard/InscripcionesBlock.jsx` (Row 2 de `Dashboard.jsx`), no una Row propia de `Dashboard.jsx`.
Se montó `SolvenciaGradoBlock` inmediatamente después de `<InscripcionesBlock />` (que es donde vive
"Ocupación por grado") para cumplir la intención del requerimiento sin inventar una Row que no existe. Anotado
para que se revise si la ubicación visual final es la esperada.

## Frontend — `ROLE_GROUPS.SOLVENCIA_DASHBOARD` rompe el patrón de exclusión de `sistemas`

`constants/roles.js` documenta explícitamente que el rol `sistemas` NO participa de ningún `ROLE_GROUPS`
existente ("quedó restringido a los 4 módulos de administración del sistema"). El requerimiento del bloque
"Solvencia por grado" pide expresamente que `sistemas` vea ese bloque del Dashboard administrativo, así que se
creó `ROLE_GROUPS.SOLVENCIA_DASHBOARD = [director, administrador, cobranza, sistemas]` rompiendo ese patrón a
propósito. Queda anotado por si esto no era intencional a nivel de arquitectura de permisos — de ser un error,
basta con quitar `ROLES.SISTEMAS` de ese array.

## `ResumenPorConceptoView` (cobranza/solvencia_reportes.py) puede sobre-contar en `vista=grado` para conceptos de nivel `representante`

`_agregar_conteos` agrupa con `.values(*group_fields).annotate(...)`, y para `vista=grado` incluye
`representante__alumnos__grado_seccion` en `group_fields`. Para conceptos de nivel `alumno` (mensualidad,
inscripción, solvencia) esto es correcto: cada fila tiene un solo alumno y por lo tanto un solo grado. Pero para
conceptos de nivel `representante` (cargos especiales), el join a `representante__alumnos__grado_seccion` hace
fan-out: si un representante tiene hijos en dos grados distintos, su misma `CuotaProyectoInversion` se cuenta una
vez bajo CADA grado en el desglose `grados` de la línea — el total de la suma de `grados` puede superar el
`total` de la línea (que sí es correcto, viene de contar el queryset sin ese join). No se corrigió porque ningún
caso de los bloques 1-4 ni del bloque 9 de tests lo ejercita (los tests de cargo especial existentes cubren la
vista de detalle `EstadoPorConceptoView`, que sí deduplica con `.distinct()` vía `filtrar_por_sede`, no el
resumen agregado con `vista=grado`). Si el frontend llega a mostrar `estado-por-concepto/resumen/?vista=grado`
para un cargo especial, revisar si esta atribución "un representante cuenta en cada grado de sus hijos" es el
comportamiento deseado o si hay que deduplicar (ej. contar el representante una sola vez, en su primer grado, o
mostrar la fila sin desglose por grado para conceptos de nivel representante).

## `EstadoPorConceptoView`/`ExportarEstadoPorConceptoExcelView` (cobranza/solvencia_reportes.py) no filtran por alumno activo

A diferencia de `SolvenciaMensualView` (excluye alumnos con `activo=False` y becados) y de
`EstadoCuentaRepresentanteView` (cargos solo de alumnos activos), el detalle "estado por concepto" incluye
mensualidades/inscripción/solvencia de alumnos retirados (`activo=False`) si existen filas históricas para ellos.
El documento de tarea (PROMPT_MODULO_SOLVENCIA.md) no pide ese filtro para este endpoint en particular — es
plausible que sea intencional (reporte de cobranza histórico completo, no solo alumnos activos), pero queda
anotado por si el frontend espera ver solo alumnos activos aquí también, igual que en los otros dos reportes.

## Infra — falta aplicar el fix de cache-control en el nginx de `app.clhma.com`

El panel (`octopus-frontend`) usa `vite-plugin-pwa` con Service Worker (`vite.config.js`), y el Service Worker
ahora se registra al arrancar la app (antes solo se registraba al activar push, ver `src/pwaUpdate.jsx` /
`src/main.jsx`). Para que la detección de versión nueva sea rápida y pareja en todos los dispositivos, el nginx
de cada colegio necesita cabeceras `Cache-Control` explícitas — sin eso, cada navegador decide por su cuenta
cuánto cachear `index.html`/`sw.js`, lo que causa que algunos dispositivos no vean actualizaciones nuevas por
mucho tiempo (o nunca hasta un cierre completo del navegador).

Ya se aplicó en `app.clhmacoro.com` (2026-09-04): assets con hash de Vite → cache larga e inmutable;
`sw.js`/`manifest.webmanifest`/`registerSW.js` → `no-cache`; `index.html` → `no-cache`. Config de referencia en
`deploy/nginx/app.clhmacoro.com.conf` (este repo).

**Falta aplicar el mismo parche en `app.clhma.com`** (el otro colegio) — ese nginx tampoco vive en este repo
(ver `deploy/nginx/app.clhma.com.snippet.conf`), así que hay que pedirle el archivo real al servidor primero y
adaptar el parche igual que se hizo acá, no copiar `app.clhmacoro.com.conf` a ciegas (los puertos/rutas pueden
diferir).

## `CuotaSolvencia` no tiene historial de abonos individuales

Al corregir el bug de abono parcial de solvencia (2026-09-16), se agregó soporte para acumular abonos vía
`monto_pagado` (mismo patrón que `Mensualidad`/`CuotaProyectoInversion`), pero **no existe una tabla de
"abonos" o "líneas de pago por cuota"** — solo el acumulador `CuotaSolvencia.monto_pagado`. Esto alcanza para
saber cuánto se debe hoy, pero no para mostrar un historial ("abonó $50 el 3 de marzo, $30 el 10 de abril,
método X, cajero Y") sin reconstruirlo indirectamente cruzando `CuotaSolvencia.pagos` (M2M a `Pago`) — que
tampoco guarda cuánto de CADA `Pago` fue aplicado a esa cuota específica cuando un mismo pago cubre varias
cuotas o mensualidades a la vez. Si se pide un historial de abonos por solvencia (dashboard del representante,
portal), hay que decidir primero si conviene: (a) inferirlo cruzando `pagos.all()` ordenados por fecha
(impreciso si un pago cubre varias deudas), o (b) modelar una tabla explícita de abonos, análoga a
`LineaDescuentoPago`/`LineaRecargoPago`, que registre monto/fecha/pago/cuota por cada abono aplicado. No se
implementó ninguna de las dos: fuera del alcance del bug reportado (que solo pedía que el saldo pendiente
quedara bien calculado).

## `CuotaSolvencia` con abonos parciales pre-existentes al bug de 2026-09-16 quedaron mal registradas

Antes de esta corrección, `RegistrarPagoView` siempre marcaba `CuotaSolvencia.monto_pagado = monto_usd` (saldo
completo) sin importar cuánto se cobró realmente en un abono parcial — ver el bloque de `cuota_solvencia_ids`
en `views.py` (antes de este fix hacía `cuota.monto_pagado = cuota.monto_usd` sin condicional). Toda solvencia
que haya recibido un abono parcial por caja antes de esta fecha quedó marcada `pagado=True` con
`monto_pagado=monto_usd`, perdiendo el saldo real pendiente sin dejar rastro recuperable en la BD (el campo fue
sobrescrito, y no hay historial de abonos — ver nota de arriba). No se puede diferenciar automáticamente una
solvencia "de verdad pagada al 100%" de una "marcada pagada por este bug" solo mirando `CuotaSolvencia`. Un
indicio parcial: cruzar el monto total cobrado en cada `Pago` vinculado (M2M `pagos`) contra la suma de
`monto_usd` de las `CuotaSolvencia` que ese pago saldó — si lo cobrado fue menor a esa suma, es candidata a
revisión manual. Requiere decisión de negocio (¿se audita caso por caso con el colegio? ¿se asume pérdida y se
sigue adelante?) antes de tocar datos de producción — no se implementó ninguna migración de corrección.

**Caso real confirmado y corregido a mano (2026-09-17):** `CuotaSolvencia` id=210 (alumna Jhanna Sofía Uzcategui
Olivera, id=826, período 2026-2027, concepto "deuda") tenía `monto_usd=110.00` y `monto_pagado=90.00`, pero el
único `Pago` real vinculado (id=764, 2026-08-17, transferencia) era de solo `$30.00`. El indicio de arriba lo
confirmó: `monto_pagado` no coincidía con la suma real de `pagos` vinculados. Se corrigió a mano en producción
(`c.monto_pagado = Decimal('30.00'); c.save()`, vía shell, con confirmación explícita del usuario de que no
había otro cobro sin registrar) — saldo pasó de $20 (incorrecto) a $80 (real).

**Auditoría completa corrida sobre producción (2026-09-17):** de las 119 `CuotaSolvencia` con `monto_pagado > 0`,
86 salieron "sospechosas" en una primera pasada (comparando `monto_pagado` contra la suma de `monto_usd` de sus
`Pago` vinculados). **84 de esas 86 son falsos positivos**: el criterio ingenuo no distingue una cuota pagada
junto con OTRAS deudas en la misma operación (mensualidades, inscripción, proyecto de inversión) — cuando eso
pasa, el mismo `Pago` queda vinculado por igual a todas las deudas de esa operación (ver nota de arriba sobre
`desglose-contable`/pagos "hermanos"), así que la suma "esperada" sale mayor sin que haya ningún error real. El
criterio que sí aisló los 2 casos reales fue el opuesto: `monto_pagado` **mayor** a lo rastreable en pagos
reales (nunca al revés).

Los 2 casos reales:
- **id=210 (Jhanna Sofía Uzcategui Olivera)** — corregido, ver arriba.
- **id=259 (Freddy Sebastián Guillén Primera)**, período 2026-2027, concepto `'50 Proyect'`: `monto_usd=100.01`,
  `monto_pagado` decía `100.00` pero el único `Pago` real vinculado (id=648, 2026-07-22, transferencia) era de
  `$50.00`. Mismo patrón que Jhanna. Corregido a mano (`monto_pagado = Decimal('50.00')`), con confirmación del
  usuario — saldo pasó de $0.01 (Íntegramente pagada, solo faltaba 1 centavo) a **$50.01** (real).

**id=163 (Shantal Caridad Rivas García) quedó sin tocar, a propósito.** `monto_usd=95.00`, `monto_pagado=95.00`,
concepto `'junio, julio, agosto y proyecto'` (sugiere que esta cuota se usó como bolsa genérica para varias
deudas, no solo el cargo de solvencia). Dos `Pago` reales vinculados de la misma operación: $75.00 (punto de
venta) + un leg en bolívares cuyo equivalente en USD es prácticamente cero (`monto_ves=0.75`, `tasa_aplicada=
827.74` → ≈$0.0009). El real trazable (~$75) no cuadra con `monto_pagado` ($95), así que técnicamente encaja en
el mismo patrón — pero dado que el concepto mezcla varias deudas y no hay certeza de qué se cobró realmente ese
día, **el usuario decidió explícitamente dejarla como está** hasta que alguien de cobranza la revise con más
contexto, en vez de corregirla a ciegas. Si se investiga, empezar por revisar todos los `Pago`/mensualidades de
esa alumna cerca del 2026-09-10 (fecha de esos 2 pagos) para reconstruir qué se cobró de verdad.

Los otros 84 "falsos positivos" (pagos combinados con otras deudas) **quedaron sin revisar individualmente** —
se descartaron por patrón, no uno por uno. Si en el futuro se quiere confirmar con certeza que ninguno esconde
un caso real, habría que repetir el análisis por operación completa (sumando todos los conceptos que cada
`Pago`/grupo de "hermanos" efectivamente cubrió), no solo por esta cuota aislada.

## `CorregirPagoView` — edición de monto solo soportada para pagos con UNA cuota ligada en total (o ninguna)

Al extender "Corregir Pago" (Función A) para permitir editar `monto_usd` del `Pago` y, si aplica, el abono
(`monto_pagado` absoluto) de la cuota ligada (`cobranza/correcciones.py::corregir_pago` / `elegibilidad_monto`),
se generalizó a las 4 M2M — `CuotaSolvencia`, `Mensualidad`, `CuotaProyectoInversion` y `CuotaInscripcion` —
pero restringido a pagos ligados a **como máximo UNA cuota en total**, sin importar el tipo (ej. una mensualidad
+ una cuota de solvencia a la vez también cuenta como 2 y se rechaza). Cualquier otro caso devuelve 400 y pide
un ajuste manual de Sistemas, en vez de adivinar cómo repartir el cambio entre varias. La raíz del problema es
la misma que ya documenta la nota de arriba ("`CuotaSolvencia` no tiene historial de abonos individuales"):
ninguna de esas M2M guarda cuánto de CADA `Pago` fue aplicado a esa cuota, así que no hay forma segura de saber
qué le corresponde a cada una cuando hay varias.

`CuotaInscripcion` es un caso especial dentro de esta generalización: no tiene `monto_pagado` (solo un booleano
`pagado`, todo-o-nada — ver su modelo). Cuando la única cuota ligada es de ese tipo, se puede corregir
`monto_usd` del pago pero NO hay campo de abono que editar (`cuota_monto_pagado` se rechaza con 400).

**Quirk de `Mensualidad.save()` a tener en cuenta si se toca esta lógica de nuevo:** a diferencia de
`CuotaSolvencia`/`CuotaProyectoInversion`, `Mensualidad.save()` tiene una compatibilidad especial (ver su
docstring) — si `pagado` ya estaba en `True` y el `monto_pagado` nuevo es menor a `monto_usd`, lo interpreta
como "esto se pagó por el total" y sincroniza `monto_pagado` HACIA ARRIBA en vez de bajarlo. `corregir_pago()`
resetea `pagado=False` a mano antes de guardar la mensualidad para evitar que esa compatibilidad revierta la
corrección silenciosamente (se detectó con un test que fallaba exactamente por esto).

Además, la auditoría del cambio de monto (quién, cuándo, valores antes/después de `Pago` y de la
`CuotaSolvencia`) se registra en `LogAuditoria` (accion=`CORREGIR_PAGO_MONTO`) — genérico, sin migración nueva
— porque `CuotaSolvencia` no tiene `HistoricalRecords` (a diferencia de `Pago`, que ya lo cubre solo). Si en el
futuro se necesita reconstruir un historial de abonos de solvencia navegable (no solo un log de auditoría
plano), aplica la misma decisión pendiente de la nota de arriba: inferirlo cruzando pagos, o modelar una tabla
explícita de abonos.

## `abonos_parciales_requieren_usd` ya NO restringe abonos parciales de mensualidades VENCIDAS (decisión de negocio, 2026-09-17)

Antes, si `ConfiguracionSistema.abonos_parciales_requieren_usd` estaba activo, un abono parcial de CUALQUIER
mensualidad (vencida o adelanto de mes futuro) exigía que TODAS las líneas de la transacción fueran en Zelle o
Efectivo Divisas (USD). Se decidió (pedido explícito del usuario, confirmado con opción concreta) que esa
restricción deje de aplicar a mensualidades **ya vencidas**: recibir un abono parcial de deuda real vencida en
cualquier moneda es mejor que no recibir nada — la restricción de USD tiene sentido para proteger al colegio de
descuadres de tasa en **adelantos** (dinero que ni siquiera necesita todavía), no para bloquear la recuperación
de deuda ya generada.

Cambios: `cobranza/serializers.py::PagoCreateSerializer.validate()` ahora evalúa el abono parcial solo sobre
`mensualidad_adelanto_ids` (antes evaluaba `mensualidad_ids` + `mensualidad_adelanto_ids` juntos). En el
frontend, `Cobranza.jsx::hayAbonoParcial` refleja lo mismo (ya no mira `selectedMens`, solo `selectedFuturas`).
El campo del modelo y su `help_text` se actualizaron para reflejar el alcance nuevo (migración
`secretaria/migrations/0030_alter_configuracionsistema_abonos_parciales_requieren_usd.py`, solo cambia el
`help_text`, no el tipo ni el default).

**Nota de diseño:** esto deja a `abonos_parciales_requieren_usd` funcionalmente solapado con
`adelantos_requieren_usd` en el caso común (un adelanto completo YA exige USD vía `adelantos_requieren_usd`),
pero siguen siendo independientes por diseño: si algún día se desactiva `adelantos_requieren_usd` (adelantos
completos permitidos en Bs.) pero se deja `abonos_parciales_requieren_usd` activo, un abono PARCIAL de un
adelanto seguiría exigiendo USD — ese matiz es intencional (ver comentario en el modelo) y por eso no se fusionó
en un solo flag.

## Módulo sitio institucional eliminado (2026-10-17)

Módulo sitio institucional eliminado, incluidas sus tablas `sitio_*` (migración de limpieza en secretaria).
