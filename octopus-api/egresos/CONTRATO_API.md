# Contrato API — Finanzas y Egresos

Base: `/api/`. Todas las rutas requieren autenticación y los roles `administrador` o `director`. Los recursos con `sede` se filtran con el criterio multisede existente: un identificador de una sede no autorizada responde `404`, nunca `403`.

Errores: `400 {"detalle":"...", "campos":{"campo":["..."]}}`, `401`, `403` (rol), `404`, `409 {"detalle":"conflicto de unicidad"}`. No hay borrado físico: las anulaciones y eliminaciones de comprobantes son lógicas y quedan en bitácora.

## Convenciones monetarias y fiscales

`moneda` es `USD` o `VES`; todos los montos son strings decimales. Al crear se toma la tasa BCV de `fecha_emision`; si se entrega otra, `motivo_cambio_tasa` es obligatorio. La respuesta siempre incluye `monto_usd`, `monto_ves` y `tasa_aplicada` como snapshots. `fiscal_activo=false` oculta campos fiscales en UI, sin borrar datos. Retenciones IVA/ISLR se activan por factura. El umbral de alerta de precio es 15% por defecto.

Ejemplo de egreso de contado completo:
```json
{
  "proveedor": 7, "categoria": 3, "sede": 1, "tipo_documento": "factura", "numero_documento": "A-102",
  "numero_control": "00-123", "fecha_emision": "2026-10-07", "descripcion": "Compra de útiles",
  "moneda": "VES", "tasa_aplicada": "150.0000", "motivo_cambio_tasa": "",
  "subtotal": "5000.00", "porcentaje_iva": "16.0000", "monto_iva": "800.00", "aplica_igtf": false,
  "monto_igtf": "0.00", "retiene_iva": true, "porcentaje_retencion_iva": "75.0000", "monto_retencion_iva": "600.00",
  "retiene_islr": false, "porcentaje_retencion_islr": "0.0000", "monto_retencion_islr": "0.00",
  "total_documento": "5800.00", "condicion": "contado", "fecha_egreso": "2026-10-07",
  "tasa_pago": "150.0000", "metodo_pago": "transferencia", "banco_pago": "Banco Ejemplo", "referencia_pago": "REF-1",
  "renglones": [{"descripcion":"Cuaderno", "cantidad":"10.00", "precio_unitario":"500.00", "descuento":"0.00"}]
}
```
Respuesta (fragmento):
```json
{"id":45,"estado":"registrado","origen":"factura","monto_usd":"38.67","monto_ves":"5800.00","total_pagado":"5200.00","fecha_egreso":"2026-10-07"}
```

## Endpoints

| Método y ruta | Operación |
|---|---|
| `GET,POST /finanzas/proveedores/` | Lista/busca (`q`, `activo`) y crea proveedor. |
| `GET,PATCH /finanzas/proveedores/{id}/` | Detalle y actualización; RIF único. |
| `GET,POST /finanzas/categorias/` | Árbol y creación; `padre` opcional, máximo dos niveles. |
| `GET,PATCH /finanzas/categorias/{id}/` | Detalle/gestión, incluida desactivación. |
| `GET,POST /finanzas/presupuestos/` | Filtros `sede,anio,mes,categoria,moneda`; crea combinación única categoría/sede/período/moneda. |
| `GET,PATCH /finanzas/presupuestos/{id}/` | Consulta/ajuste de presupuesto. |
| `GET,POST /egresos/` | Lista (`sede,estado,origen,proveedor,categoria,desde,hasta,moneda`) y alta **solo contado**. Usa el JSON anterior. |
| `GET,PATCH /egresos/{id}/` | Detalle y edición de borrador; no crea crédito. |
| `POST /egresos/{id}/guardar/` | Calcula y registra el contado. Request puede incluir `estado:"registrado"`; exige `fecha_egreso`. |
| `POST /egresos/{id}/anular/` | `{ "motivo":"..." }`; registra usuario/fecha/antes/después. |
| `POST /egresos/{id}/duplicar/` | Crea borrador de contado sin número, pago ni comprobantes. |
| `POST /egresos/{id}/calcular-totales/` | Recibe el cuerpo del egreso, devuelve subtotal, impuestos, retenciones, total y snapshots sin guardar. |
| `GET /egresos/articulos/` | Busca `q`, `proveedor`, `categoria`; devuelve precio/historial agregado. |
| `GET /egresos/articulos/{id}/historial/` | Compras no anuladas del artículo, con ambos montos. |
| `POST /egresos/{id}/comprobantes/` | Multipart `archivo,tipo,descripcion`; JPG/PNG/WEBP/PDF, máximo 10 MB y 5 activos por egreso. |
| `GET /egresos/{id}/comprobantes/` | Lista incluyendo metadatos de baja lógica según permiso. |
| `DELETE /egresos/{id}/comprobantes/{comprobante_id}/` | Baja lógica, con usuario y fecha. |
| `GET /egresos/tablero/` | `sede,desde,hasta,moneda`; presupuesto vs ejecutado en USD y VES. `comprometido_pendiente` y `comprometido_usd/ves` por categoría salen de la deuda abierta de CxP (pendiente/parcial, no anulada; saldo convertido con la tasa de la cuenta), filtrada por sedes autorizadas y `sede`. |
| `GET /egresos/reportes/{nombre}/` | Informes JSON (`sede,desde,hasta,moneda`; `moneda` = `usd`, `ves` u `original`, por defecto `original`; 400 si es otro valor). Gasto real (egresos registrados): `relacion-detallada`, `por-categoria`, `por-proveedor`, `por-sede`, `comparativo-mensual` (alias `por-periodo`, últimos 12 meses), `ejecucion-presupuestaria` (alias `presupuesto`), `historial-articulos` (`articulo`), `variacion-precios` (`articulo`; por artículo: precio inicial/actual/mín/máx, `variacion_porcentaje`, `supera_umbral` según `umbral_alerta_variacion`). Documentos fiscales por `fecha_emision` (pendientes y registrados, no anulados): `libro-compras`, `impuestos` (IVA/IGTF), `retenciones` (IVA/ISLR). Siempre limitados a las sedes autorizadas. Respuesta: `{reporte, moneda, resultados[]}`. El frontend exporta PDF/Excel. |
| `GET,PATCH /egresos/configuracion/` | Singleton: `fiscal_activo`, `umbral_alerta_variacion`, alícuotas. |

Crear proveedor: `{"razon_social":"Papelería C.A.","rif":"J-12345678-9","condicion_habitual":"contado","dias_credito_habitual":0,"categoria_defecto":3}`. Crear categoría: `{"nombre":"Transporte","padre":null}`. Crear presupuesto: `{"categoria":3,"sede":1,"anio":2026,"mes":10,"moneda":"USD","monto":"300.00"}`.

## Servicios internos llamados por Cuentas por Pagar

CxP **no importa modelos de Egresos**; llama estos servicios del módulo Egresos con datos primitivos. Ninguno crea egresos parciales.

`marcar_pagado(cuenta_por_pagar_id, abono)` y `crear_desde_cuenta_pagada(cuenta_por_pagar_id, cuenta, abonos)` reciben abonos con:
```json
{"fecha_pago":"2026-10-07","moneda":"VES","tasa_aplicada":"150.0000","metodo_pago":"transferencia","banco":"Banco Ejemplo","referencia":"REF-2","monto_documento":"5000.00","monto_usd":"33.33","monto_ves":"5000.00","comprobantes":[{"ruta":"...","nombre":"pago.pdf"}]}
```
Al liquidarse, `crear_desde_cuenta_pagada` crea o actualiza un único `Egreso` con `origen:"cuenta_por_pagar"`, `fecha_egreso` igual al último abono, total igual a la suma de abonos y `pagos_cuenta_por_pagar` con el detalle inmutable completo de cada pago, sus tasas, USD, VES y comprobantes. Respuesta: `{"egreso_id":45,"creado":true,"monto_usd_pagado":"100.00","monto_ves_pagado":"15000.00","abonos":3}`.

`revertir_pago(cuenta_por_pagar_id, abono_id)` reconstruye los totales/detalles del egreso final; si deja la cuenta sin saldar, anula el egreso final. `anular_por_cuenta(cuenta_por_pagar_id, motivo)` lo anula con bitácora. Las colisiones de `cuenta_por_pagar_id` activo responden `409`.
