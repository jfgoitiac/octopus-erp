# Cambios respecto al contrato API del Conciliador (backend)

El contrato se respeta tal cual. Detalles y adiciones:

- `GET cobranza/bancos/?para=conciliador` (NUEVO, aditivo): devuelve los bancos
  con `activo_conciliador=True` (incluye el Banco Digital de los Trabajadores,
  que esta inactivo para caja: `activo=False`). Sin el parametro, el endpoint se
  comporta como antes (solo `activo=True`, cacheado). Los bancos exponen ademas
  `formato_estado_cuenta`, `color` y `activo_conciliador`.
  El selector del conciliador debe llamar con `?para=conciliador`.
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
