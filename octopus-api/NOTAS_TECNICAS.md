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

## `CuotaInscripcion.pagado` sigue siendo un booleano no derivado (a diferencia de `CuotaSolvencia`)

Se agregó `CuotaSolvencia.monto_pagado` y `save()` deriva `pagado`/`fecha_pago` automáticamente a partir de
`monto_pagado` vs `monto_usd` (ver cobranza/models.py), porque editar `monto_usd` después de cobrado dejaba la
cuota marcada `pagado=True` con deuda nueva invisible para `mora.py`. `CuotaInscripcion` tiene el mismo booleano
"plano" sin acumulador, pero hoy no le pega el mismo bug porque no tiene CRUD administrativo para editar su monto
(ver nota de arriba). Si en el futuro se habilita editar `CuotaInscripcion.monto_usd` desde algún lado, aplicar el
mismo patrón (`monto_pagado` + `save()` derivado) antes de exponerlo, o reaparecerá el mismo problema.
