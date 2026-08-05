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
