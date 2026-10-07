# Contrato API — Cuentas por Pagar

Base `/api/cuentas-por-pagar/`. Autenticación obligatoria. F8: `administrador` y `director` pueden consultar, crear, editar, pagar, aplazar y anular; sólo `administrador`/`director` administran configuración y aprueban pagos cuando aplique. El filtro multisede responde `404` para una sede no autorizada. No existe borrado físico.

Errores comunes: `400 {"detalle":"...","campos":{"campo":["..."]}}`, `401`, `403`, `404`, `409`. Montos y tasas son strings decimales; moneda es `USD` o `VES`. La tasa BCV se obtiene por fecha con `finanzas.monedas`; una tasa manual requiere `motivo_cambio_tasa`.

## Cuenta y flujo de egreso

`CuentaPorPagar` usa número `CXP-000001`, origen `factura|manual|recurrente`, estado `pendiente|parcial|pagada|anulada` y situación calculada `al_dia|por_vencer|vence_hoy|vencida`. `por_vencer` es los siete días previos. Cada cuenta conserva snapshots `monto_usd`, `monto_ves`, `tasa_aplicada` y saldo en la moneda documental.

Al crear un pago parcial sólo se registra `PagoCuentaPagar`; nunca se crea Egreso. Al último pago válido que deja el saldo en cero, el servicio genera un único egreso usando `egresos.services.crear_desde_cuenta_pagada(cuenta_id, cuenta, abonos)`: fecha del último abono, suma total y detalle inmutable de cada pago, tasa, USD, VES y comprobantes. Al anular un abono se usa `revertir_pago`; al anular cuenta `anular_por_cuenta`.

Ejemplo completo de alta:
```json
{"origen":"factura","proveedor":7,"categoria":3,"sede":1,"concepto":"Internet octubre","descripcion":"Factura ISP 102","moneda":"VES","tasa_aplicada":"150.0000","monto_documento":"5000.00","fecha_emision":"2026-10-01","fecha_vencimiento":"2026-10-15","prioridad":"alta","responsable":4,"etiquetas":["servicio"],"notas":"Pagar por transferencia"}
```
Respuesta: `{"id":12,"numero":"CXP-000012","estado":"pendiente","situacion":"por_vencer","monto_usd":"33.33","monto_ves":"5000.00","saldo":"5000.00","egreso_id":null}`.

## Endpoints

| Método y ruta | Operación, filtros o cuerpo |
|---|---|
| `GET,POST /` | Lista con `sede,estado,situacion,proveedor,categoria,prioridad,desde,hasta,moneda,q`; crea cuenta con el cuerpo de ejemplo. |
| `GET,PATCH /{id}/` | Detalle o edición de pendiente/parcial. |
| `POST /{id}/pagar/` | Pago: `{"fecha_pago":"2026-10-15","moneda":"VES","tasa_aplicada":"150.0000","monto_pagado":"5000.00","monto_aplicado":"5000.00","metodo_pago":"transferencia","banco":"Banco","referencia":"REF","nota":""}`. Devuelve pago, saldo, estado y, si se salda, `egreso_id`. |
| `POST /{id}/aplazar/` | `{"fecha_nueva":"2026-10-20","motivo":"Acuerdo proveedor"}`; desde el tercer aplazamiento exige aprobación de director. |
| `POST /{id}/posponer-recordatorio/` | `{"hasta":"2026-10-14","motivo":"..."}`. |
| `POST /{id}/acuerdo-cuotas/` | `{"cuotas":[{"fecha_vencimiento":"2026-10-10","monto":"2500.00"}]}`. |
| `POST /{id}/confirmar-monto/` | `{"monto_documento":"5000.00","tasa_aplicada":"150.0000"}` para una cuenta por confirmar. |
| `POST /{id}/anular/` | `{"motivo":"Documento duplicado"}`. |
| `POST /{id}/duplicar/` | Crea nueva pendiente sin pagos, avisos ni egreso. |
| `GET /{id}/pagos/` | Lista pagos y comprobantes. |
| `POST /pagos/{id}/anular/` | `{"motivo":"Referencia incorrecta"}`; recalcula saldo y revierte egreso final si corresponde. |
| `POST /pagos/{id}/adjuntos/` | Multipart `archivo,descripcion`; JPG/PNG/WEBP/PDF, 10 MB máximo. |
| `POST /pagos-multiples/` | `{"pagos":[{"cuenta":12,"monto_aplicado":"10.00", "moneda":"USD","tasa_aplicada":"150.0000","fecha_pago":"2026-10-15","monto_pagado":"10.00","metodo_pago":"zelle"}]}`. |
| `GET,POST /plantillas/` | Lista (`sede,activa,proveedor`) y crea plantilla recurrente. |
| `GET,PATCH /plantillas/{id}/` | Edita o pausa con `{"activa":false}`. |
| `GET,PATCH /configuracion/` | Singleton: `dias_antes:[7,3,1,0]`, `ventana_por_vencer:7`, `frecuencia_vencidas_dias:3`, `max_aplazamientos_sin_director:2`, canales, destinatarios, resumen opcional `hora_resumen:"07:00"`, aprobación opcional y `umbral_aprobacion_usd:"150.00"`. |
| `GET /bandeja/` | Avisos con filtros `leido,cuenta`; `PATCH /bandeja/{id}/` marca leído. |
| `GET /tablero/` | Totales por situación y moneda; filtros `sede,desde,hasta`. |
| `GET /calendario/` | Vencimientos y cuotas; filtros `sede,desde,hasta`. |
| `GET /proyeccion/` | Proyección de salida por fecha y moneda. |
| `GET /proveedores/{id}/estado/` | Deuda, vencidas, historial y próximos vencimientos del proveedor. |
| `GET /reportes/{nombre}/` | Ocho informes: `antiguedad-saldos`, `por-proveedor`, `por-categoria`, `vencimientos`, `pagos`, `flujo-proyectado`, `aplazamientos`, `recordatorios`. |

## Servicios internos

Para compatibilidad futura con Egresos: `crear_desde_egreso(datos)`, `actualizar_desde_egreso(datos)`, `anular_por_egreso(egreso_id, usuario_id, motivo)` y `resumen_pagos_de_egreso(egreso_id)`. Reciben/devuelven diccionarios primitivos, no modelos. La creación directa de CxP permite origen `factura` aunque Egresos no expone crédito.

## Recordatorios

Por defecto se envían a 7, 3, 1 y 0 días antes, vencidas cada tres días; bandeja y correo activos, WhatsApp disponible pero apagado. El resumen diario es opcional, a las 07:00 y sólo se envía con cuentas por vencer o vencidas. `RecordatorioEnviado` evita duplicados por cuenta/canal/tipo/fecha.
