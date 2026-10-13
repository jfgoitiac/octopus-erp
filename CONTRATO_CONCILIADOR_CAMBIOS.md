# Cambios respecto al contrato API del Conciliador (backend)

El contrato se respeta tal cual. Detalles y adiciones:

- `GET cobranza/bancos/?para=conciliador` (NUEVO, aditivo): devuelve los bancos
  con `activo_conciliador=True` (incluye el Banco Digital de los Trabajadores,
  que esta inactivo para caja: `activo=False`). Sin el parametro, el endpoint se
  comporta como antes (solo `activo=True`, cacheado). Los bancos exponen ademas
  `formato_estado_cuenta`, `color` y `activo_conciliador`.
  El selector del conciliador debe llamar con `?para=conciliador`.
- `BancoInstitucional.config_estado_cuenta` (NUEVO, JSON, default `{}`, migracion
  cobranza 0050): ajustes del parser por banco, sin tocar codigo. Se devuelve en
  `GET cobranza/bancos/?para=conciliador` y en `bancos/admin/` (lectura/escritura
  solo director, sistemas y administrador, igual que el resto del CRUD de bancos).
  Contrato (todas las claves opcionales; claves desconocidas -> 400):
  `{"columnas": {"referencia"|"fecha"|"descripcion"|"debito"|"credito"|"monto": [str]},
  "formato_fecha": "auto"|"dd/MM/yyyy"|"MM/dd/yyyy"|"yyyy-MM-dd",
  "separador_decimal": "auto"|","|".", "filas_encabezado_max": 1..50}`.
  Los alias de `columnas` se suman a los del preset; listas no vacias de textos
  de maximo 80 caracteres. `formato_estado_cuenta` admite: generico, bancaribe,
  banesco, tesoro, bdt. Errores en `config_estado_cuenta` (mensajes en espanol).
- Los montos (`monto_ves`, `monto_banco_ves`, `diferencia_ves`, ...) se devuelven
  como string decimal con 2 decimales (convencion DRF del proyecto). La
  diferencia es con signo: `monto_banco - monto_sistema`.
- `conciliaciones[].banco` en `lotes/abierto/` es el NOMBRE del banco; el id va en
  `banco_id`. Cada conciliacion incluye ademas `id, lote_id, tolerancia_aplicada_ves,
  archivo_estado_cuenta, comprobante_aprobado_id`.
- `POST conciliar/`: errores como `{error: "..."}` con 400 (fuera de tolerancia sin
  observacion, doble conciliacion, linea de banco reutilizada, comprobante de otro
  banco / ya procesado), 404 (operacion o comprobante fuera de la sede del usuario
  o inexistente), 403 (rol sin permiso). Si se aprueba un comprobante con
  advertencias antifraude, la respuesta trae `advertencias: [...]`.
- `POST lotes/abierto/finalizar/`: devuelve el lote finalizado con
  `conciliaciones`; 404 si no hay lote abierto, 400 si esta vacio.
- `GET conciliacion/resumen/`: cada pago trae `conciliacion_bancaria` (objeto o
  `null`) con `id, lote_id, referencia_banco, fecha_banco, monto_banco_ves,
  monto_sistema_ves, diferencia_ves, fuera_tolerancia, observacion`. Filtro nuevo:
  `fuera_tolerancia=true`.
- `GET conciliacion/lotes/<id>/`: agrega `conciliaciones: [...]` (mismo formato).
  `GET conciliacion/lotes/` (historial) lista solo lotes `finalizado`; todos los
  lotes traen `estado`.
- `POST conciliacion/lotes/` (Finalizar Lote manual): si el usuario tiene un lote
  abierto, suma los pagos a ESE lote y lo finaliza (responde 201 con ese lote).
- `tolerancia_conciliacion_ves` (default 200.00) se lee/edita por
  `ConfiguracionSistemaView` (GET docente+, POST admin/director/sistemas). Si aun no
  existe configuracion, GET devuelve `{}` y el servidor usa 200.

## Conciliacion masiva con filtro de fechas

- `GET conciliacion/candidatos/` acepta `desde` y `hasta` (AAAA-MM-DD, inclusivos,
  hora local). Filtran por `Pago.fecha_pago`; para comprobantes pendientes se usa
  `ComprobantePago.fecha_subida` (el modelo no guarda otra fecha de pago). `ref`
  (4-6 digitos) sigue obligatorio salvo que venga `desde` y/o `hasta`; si viene
  junto al rango, se aplican ambos. Fechas invalidas o `desde > hasta` -> 400. El
  tope de 50 resultados se mantiene (para volumen usar `auto/propuestas/`).
- `POST conciliacion/auto/propuestas/` (solo lectura): body `{banco, desde, hasta,
  tolerancia?, digitos? (4..8, def. 6), transacciones:[{referencia, fecha, monto}]}`
  (max 5000 transacciones; duplicados referencia+fecha se descartan). Respuesta
  `{propuestas, resumen, sin_operacion}` segun contrato. Detalles:
  - Candidatas: operaciones (pagos `completado` agrupados por `operacion_uuid`) y
    comprobantes `pendiente` del banco en el rango, no conciliadas. Lineas ya
    usadas (banco+referencia+fecha) se ignoran y no salen en `sin_operacion`.
  - Emparejamiento por ultimos `digitos` digitos (referencias normalizadas a solo
    digitos; si alguna tiene menos digitos que `digitos`, igualdad completa).
  - Asignacion uno-a-uno por acuerdo mutuo: operacion y linea se emparejan si cada
    una elige a la otra de forma unica (unica opcion; o unica diferencia exacta;
    o, sin exactas, unica dentro de tolerancia). Si no, `ambigua` con `candidatas`
    (lineas aun libres). Una operacion cuyas lineas fueron tomadas por otras queda
    `sin_banco`.
  - `sin_operacion`: lineas sin ninguna operacion candidata por referencia.
  - `id` = indice en el orden (fecha, tipo, uuid/comprobante); estable mientras no
    cambien los datos. Comprobantes: `seleccionada_por_defecto` siempre false.
  - Errores: 400 (banco/fechas/digitos/transacciones invalidos), 404 banco
    inexistente, 403 rol sin permiso.
- `POST conciliacion/auto/confirmar/`: body `{banco, tolerancia?, archivo?,
  items:[{operacion_uuid|comprobante_id, transaccion, observacion?}]}`. Respuesta
  `{conciliadas:[{indice, conciliacion_id, advertencias?}], errores:[{indice, error}],
  lote:{id, total_operaciones}|null}` (`lote` es null si nada se concilio y no hay
  lote abierto). Cada item pasa por `conciliar_item` (servicio compartido con
  `conciliar/`: tolerancia recalculada, observacion obligatoria fuera de
  tolerancia, unicidades, aprobacion de comprobantes) en su propio savepoint. Max
  500 items (400 si excede o lista vacia). Banco inexistente 404; sede ajena o
  comprobante/operacion inexistente -> el item va a `errores`.
