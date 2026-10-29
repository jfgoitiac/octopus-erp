# Contrato v2 — Comprobantes del portal procesados en caja (2026-10-29)

Repo (worktree): C:\Octopus\.claude\worktrees\representantes-comprobantes-flujo-9dc0df
Rama SIN push: las migraciones nuevas de esta rama (portal 0007/0008, notificaciones 0013/0014) se pueden EDITAR o regenerar en lugar de crear migraciones de limpieza.
Contrato anterior (v1, parcialmente reemplazado): docs/contratos/CONTRATO_REVISION_COMPROBANTES.md

## Decisiones del usuario (mandan sobre todo)
1. El representante solo sube el archivo (ya implementado, no cambia).
2. **Aprobar = procesar el pago en la pantalla de cobro de caja** (`src/pages/Cobranza.jsx`, endpoint `POST cobranza/registrar-pago/`). Desaparecen la aprobación rápida con formulario propio (`FormularioRevision`), el endpoint `portal/admin/comprobantes/tasa/` y la rama `datos_pago` de `resolver_comprobante`. El RECHAZO con motivos, plantillas, AvisoPortal, push y correo se mantiene tal cual.
3. Si la fecha del pago no es hoy, caja activa el **modo retroactivo** automáticamente: tasa sugerida por fecha y editable, motivo prellenado ("Pago reportado en el portal (comprobante #<id>)", editable). **No se pide comprobante adjunto**: el archivo del ComprobantePago se usa como comprobante del pago.
4. **Excedente**: si se paga de más, el pago se procesa normal y la diferencia se clasifica como EXCEDENTE (no vuelto, no saldo a favor). Aplica a TODO caja, no solo a comprobantes del portal. Ej.: se deben Bs. 1.950, transfieren Bs. 2.000 → Bs. 50 de excedente.
   - Todas las líneas son métodos bancarios (transferencia, pago_movil, zelle, punto_de_venta) → la diferencia es excedente siempre.
   - Hay alguna línea en efectivo (efectivo, efectivo_ves) → por defecto vuelto (como hoy); el cajero puede marcar "Registrar como excedente".
   - El saldo a favor queda FUERA (deuda técnica).
5. Conciliación: un solo camino. Se quita el auto-aprobado de comprobantes pendientes al conciliar; en su lugar "Procesar en caja" prellenado con los datos de la línea del banco.

## Backend — `POST cobranza/registrar-pago/` (RegistrarPagoView + PagoCreateSerializer)
Campos nuevos opcionales en el payload (JSON o dentro de `payload` del FormData):
- `comprobante_portal_id` (int): comprobante del portal que este pago procesa.
- `excedente_usd`, `excedente_ves` (decimal ≥ 0, default 0). Mutuamente excluyentes con vuelto: no pueden venir vuelto > 0 y excedente > 0 a la vez → 400.

Con `comprobante_portal_id`:
- Dentro del MISMO atomic del registro: `select_for_update` del ComprobantePago; si no está `pendiente` → 409 `{"error": "Este comprobante ya fue procesado (estatus: aprobado)."}`; si su mensualidad no pertenece a uno de los alumnos del pago → 400.
- Al crear los pagos: `comprobante.estatus='aprobado'`, `comprobante.pago = pagos_creados[0]`, `revisado_por`, `fecha_revision`; copiar a `referencia_bancaria`/`metodo_pago`/`banco_receptor` del comprobante los de la primera línea bancaria (para mostrar en el portal y en la lista).
- Modo retroactivo sin `comprobante_retroactivo` subido: `Pago.comprobante_retroactivo` apunta al MISMO archivo del ComprobantePago (asignar el name del FileField; no duplicar bytes). Si se sube uno, manda el subido.
- Notificaciones (fuera del atomic, best-effort): las de caja de siempre (correo "pago confirmado" con recibo, una por operación) + `AvisoPortal` tipo `comprobante_aprobado` con la plantilla + push. Sin correos duplicados.
- Respuesta 201 igual que hoy + `"comprobante_portal_id": <id>`.

Excedente:
- Modelo `Pago`: `excedente_usd` y `excedente_ves` (Decimal, default 0), solo en el primer pago de la operación (mismo criterio que vuelto). Migración en cobranza.
- Validación backend: el excedente no puede superar lo pagado de más (pagado − deuda, con tolerancia de redondeo ~0.01) → 400.
- Exponer el excedente en el serializer/recibo de la operación y en el historial de pagos ("Excedente: Bs. 50,00"). En el PDF del recibo (`cobranza/recibo_cobranza.py`) una línea "Excedente" cuando > 0.
- Reportes que restan vuelto (`cobranza/gestion.py`, `egresos/reportes.py`, `cobranza/views.py`): revisar; el excedente es dinero que SÍ entró al banco, NO se resta como vuelto. Documentar en el código.

## Backend — lista y detalle de comprobantes (admin)
- `GET portal/admin/comprobantes/<id>/` se mantiene, quitando el bloque `revision` de datos transcritos y agregando `"alumno_id"`, `"mensualidad_id"` (si no están). Para aprobados, `pago` resumido: `{"id", "factura_id", "fecha_pago", "monto_usd", "monto_ves", "metodo_pago", "referencia"}`; `null` si no hay.
- PATCH solo acepta `estatus: "rechazado"` (con `motivo_rechazo_id` y/o `observaciones`). `estatus: "aprobado"` → 400 `{"error": "Los comprobantes se aprueban registrando el pago en caja."}`.
- Quitar del modelo ComprobantePago los campos de revisión redundantes de la v1 (`fecha_pago`, `monto_recibido`, `moneda`, `tasa_aplicada`, `monto_usd_aplicado`); conservar `pago`, `revisado_por`, `fecha_revision`, `motivo_rechazo`. Editar la migración 0007 (rama sin push).

## Frontend — URL de caja prellenada (contrato entre agentes)
`/cobranza?cedula=<cedula>&comprobante=<id>` — desde la revisión. (Confirmar la ruta real de Cobranza.jsx en App.jsx; si no es `/cobranza`, se usa la real y se informa.)
Desde el conciliador se agregan los datos de la línea del banco:
`&metodo=<transferencia|pago_movil|zelle>&banco=<banco_id>&referencia=<ref>&fecha=<YYYY-MM-DD>&monto=<monto>&moneda=<VES|USD>&volver=conciliacion`
- Cobranza.jsx con `comprobante`: carga `GET portal/admin/comprobantes/<id>/`, preselecciona alumno y mensualidad, muestra el visor (panel lateral en lg+, botón "Ver comprobante" que abre Modal en móvil), activa retroactivo si `fecha` ≠ hoy (o cuando el cajero cambie la fecha), motivo prellenado, oculta/omite el adjunto retroactivo y envía `comprobante_portal_id`.
- Con `metodo/banco/referencia/monto/fecha`: prellena la primera línea de pago y la fecha.
- Tras registrar: si `volver=conciliacion` → navegar de vuelta a la ruta real del conciliador con `?operacion=<operacion_uuid>` para preseleccionarla; si no, volver a la revisión del siguiente comprobante pendiente o a la lista.
- Excedente en caja: en ResumenPago/Cobranza, cuando pagado > deuda, mostrar "Excedente" (todas bancarias) o "Vuelto" con un switch "Registrar como excedente" (si hay efectivo). Enviar `excedente_*` o `vuelto_*` según corresponda (nunca ambos).

## Reglas para todos los agentes
- Mismo worktree, en paralelo: toquen SOLO sus archivos asignados. NO `git commit/add/stash/checkout`.
- Verificación estática (tests, lint, build). NO abrir navegador.
- Estándar responsive del CLAUDE.md (mobile-first, dvh, Modal.jsx, TablaScroll.jsx, sin grid-cols-N sin breakpoint), bordes semirredondeados, fechas con date-fns `es`.
- Comentarios y nombres en español, como el código vecino.
- Deuda técnica: listarla en la respuesta final (no editar NOTAS_TECNICAS.md).
- Tests backend: `cd octopus-api && DJANGO_DEBUG=True C:/Octopus/octopus-api/venv/Scripts/python.exe manage.py test <apps> --noinput`. 10 tests de cobranza ya fallan en main (test_descuento_integracion, test_descuento_pago.PortalCotizacionDescuentoTest, test_metas_banco.MetaBancoProgresoTests, tests.DesgloseConceptosTest, tests.DobleAbonoSucesivoTest): no son tuyos, pero no agregues fallos nuevos.
- Frontend: `node_modules` ya está enlazado; `npx eslint <archivos>` y `npx vite build` desde octopus-frontend/.
