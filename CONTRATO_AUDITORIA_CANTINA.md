# Auditoría de Cantina — Contrato de API (congelado en Fase 0)

> Autocontenido: cada carril paralelo (B1–B4, F1–F5) recibe este archivo +
> `PLAN_AUDITORIA_CANTINA.md`. Si un carril necesita cambiar algo de este
> contrato, **no lo cambia**: lo reporta y se resuelve en la integración.

Estado: **Fases 0–3 completas e integradas en `feature/auditoria-cantina`.** Modelos, migraciones (0005–0007), bitácora,
permiso, rutas stub (responden `501`) y mocks del frontend están en la rama
`feature/auditoria-cantina`.

---

## 0. Convenciones

- Base: `/api/cantina/auditoria/`. Auth: la misma del staff (JWT).
- **Permiso:** `EsDirector` (rol `director` activo, o superusuario — D5) en
  todo, salvo `cierres/<id>/reabrir/` (`EsAdminCantina`: director o
  administrador — D4). Otros roles → `403`.
- **No existe ningún endpoint DELETE.** Nada de este módulo se borra.
- Montos: **string decimal en USD** con 2 decimales (`"12.50"`), igual que el
  resto de cantina. Porcentajes: string con 2 decimales (`"8.33"`).
- Fechas de filtro: `fecha_inicio` / `fecha_fin` en `YYYY-MM-DD` (mismos
  nombres que `reportes/ventas/` existente). Si se omiten → hoy.
- Fechas-hora de respuesta: ISO 8601 con zona (`2026-10-15T14:05:00-04:00`).
  El frontend las formatea con date-fns `es`.
- `area`: `cantina` | `libreria`; omitido = ambas.
- Errores de validación: `400 {"error": "mensaje legible"}` (patrón de
  cantina). Transición inválida: `409 {"error": "..."}`.
- Listados paginados: `StandardResultsPagination` → `?page=&page_size=`
  (máx. 100) y respuesta `{count, next, previous, results}`.
- **Turno** = una `AperturaCajaCantina`. Se representa siempre como:
  ```json
  "turno": {"apertura_id": 41, "etiqueta": "Turno #41 · 07:02–12:30",
            "inicio": "2026-10-15T07:02:00-04:00", "fin": "2026-10-15T12:30:00-04:00"}
  ```
- **Usuario** se representa siempre como `{"id": 7, "nombre": "Ana Pérez"}`.

---

## 1. Modelos (ya migrados)

| Modelo | Uso |
|---|---|
| `EventoAuditoriaCantina` | Bitácora append-only encadenada por hash. **Solo** se escribe con `cantina.auditoria.bitacora.registrar_evento()` |
| `RevisionCierre` | 1:1 con `CierreCajaCantina`; nace `pendiente` por signal |
| `AdjuntoRevision` | Respaldos del Director (imagen/PDF ≤ 5 MB) |
| `ReaperturaCajaCantina` | Cierre original + apertura nueva + motivo |
| `AlertaCantina` | Alertas del motor; deduplicadas por `clave_dedupe` |
| `ParametroAuditoriaCantina` | Singleton de umbrales: `ParametroAuditoriaCantina.obtener()` |

Campos nuevos en modelos existentes:
- `ProductoCantina.costo` (null = desconocido)
- `DetalleVentaCantina.costo_unitario` (snapshot al vender; null = desconocido)
- `VentaCantina.descuento_usd`, `motivo_descuento`, `motivo_anulacion`,
  `origen_producto` (`escaner|manual|mixto`), `origen_alumno`
  (`escaner|manual|no_aplica`), `es_manual`; propiedad `subtotal_usd`.
  `total_usd` es el **neto** (ya con descuento).
- `MovimientoInventario.tipo` admite `merma` (cantidad positiva, resta stock).

Transiciones de revisión: `pendiente→{revisado,aprobado,observado}`,
`revisado→{aprobado,observado}`, `observado→{revisado,aprobado}`,
`aprobado` es terminal (`RevisionCierre.puede_pasar_a()`).

### Tipos de evento de bitácora (`EventoAuditoriaCantina.TIPOS`)

`cambio_precio`, `producto_creado`, `anulacion_venta`, `descuento_venta`,
`venta_manual`, `movimiento_inventario`, `ajuste_inventario`, `merma`,
`apertura_caja`, `cierre_caja`, `reapertura_caja`, `cierre_modificado`,
`revision_cierre`, `adjunto_cierre`, `alerta_atendida`, `parametros_auditoria`.

### Qué registra cada carril (instrumentación)

| Dónde | Evento | `antes` / `despues` | `motivo` |
|---|---|---|---|
| B1 · Crear producto | `producto_creado` | — / `{precio, costo, stock_actual}` | — |
| B1 · Editar producto (si cambia precio o costo) | `cambio_precio` | `{precio, costo}` | opcional |
| B1 · Anular venta | `anulacion_venta` | `{estado, total_usd, metodo_pago}` | **obligatorio** (`motivo_anulacion`) |
| B1 · Registrar venta con descuento | `descuento_venta` | — / `{subtotal_usd, descuento_usd, total_usd}` | `motivo_descuento` (obligatorio si descuento > 0) |
| B1 · Registrar venta manual | `venta_manual` | — / `{origen_producto, origen_alumno, total_usd}` | — |
| B1 · Movimiento de inventario | `movimiento_inventario` (entrada) / `ajuste_inventario` / `merma` | `{stock}` | ajuste y merma: **obligatorio** |
| B1 · Abrir caja | `apertura_caja` | — / `{monto_inicial, area}` | — |
| B1 · Cerrar caja | `cierre_caja` | — / `{total_ventas, total_efectivo, conteo_fisico, diferencia}` | observaciones |
| B2 · Revisar cierre | `revision_cierre` | `{estado}` / `{estado}` | comentario del Director |
| B2 · Subir adjunto | `adjunto_cierre` | — / `{adjunto_id, nombre}` | descripción |
| B4 · Reabrir caja | `reapertura_caja` | `{cierre_id, apertura_id}` / `{apertura_nueva_id}` | **obligatorio** |
| B4 · Atender alerta | `alerta_atendida` | `{estado}` / `{estado}` | nota |
| B4 · Cambiar parámetros | `parametros_auditoria` | valores previos / nuevos | — |

`registrar_evento()` debe llamarse **dentro** de la `transaction.atomic()` de
la operación, para que una operación fallida no deje evento.

---

## 2. Panel ejecutivo — `GET panel/?area=`  · B2 / F1

```json
{
  "generado_en": "2026-10-15T14:05:00-04:00",
  "ventas": {
    "hoy":    {"total_usd": "182.50", "cantidad": 96, "variacion_pct": "12.40"},
    "semana": {"total_usd": "940.00", "cantidad": 512, "variacion_pct": "-3.10"},
    "mes":    {"total_usd": "3820.75", "cantidad": 2101, "variacion_pct": "5.00"}
  },
  "caja_hoy": {
    "esperado_usd": "120.00",
    "reportado_usd": "117.50",
    "diferencia_usd": "-2.50",
    "cajas_abiertas": 1,
    "cierres_realizados": 2
  },
  "diferencias_pendientes": {
    "cantidad": 3,
    "monto_total_usd": "-6.75",
    "cierres": [
      {"id": 88, "fecha": "2026-10-14", "cajero": {"id": 7, "nombre": "Ana Pérez"},
       "diferencia_usd": "-4.00", "estado_revision": "pendiente"}
    ]
  },
  "top_productos": [
    {"producto_id": 3, "nombre": "Empanada", "cantidad": 210, "total_usd": "210.00"}
  ],
  "bajo_inventario": [
    {"producto_id": 9, "nombre": "Jugo natural", "stock_actual": 2, "stock_minimo": 5, "area": "cantina"}
  ],
  "alertas": {
    "abiertas": 4,
    "recientes": [
      {"id": 12, "tipo": "exceso_anulaciones", "severidad": "advertencia",
       "titulo": "Ana Pérez anuló 5 ventas hoy", "fecha": "2026-10-15"}
    ]
  }
}
```

- `variacion_pct`: contra el período anterior equivalente (ayer, semana
  pasada, mes pasado). `null` si el anterior es 0.
- Ventas = solo `estado='completada'`, `total_usd` neto.
- `esperado_usd` = Σ por cierre del día (monto inicial + efectivo de ventas,
  recargas y abonos). `reportado_usd` = Σ `conteo_fisico`.
- `diferencias_pendientes` = cierres con `diferencia ≠ 0` y revisión en
  `pendiente` u `observado` (máx. 5 en `cierres`).
- `top_productos`: top 5 del mes. `bajo_inventario`: `stock_actual < stock_minimo`, activos.

---

## 3. Cierres diarios · B2 / F2

### `GET cierres/` (paginado)
Filtros: `fecha_inicio`, `fecha_fin`, `cajero` (id), `area`, `apertura`
(turno), `estado` (`pendiente|revisado|aprobado|observado`),
`con_diferencia=true`.

```json
{"count": 41, "next": "...", "previous": null, "results": [{
  "id": 88,
  "fecha": "2026-10-14",
  "area": "cantina",
  "cajero": {"id": 7, "nombre": "Ana Pérez"},
  "turno": {"apertura_id": 41, "etiqueta": "Turno #41 · 07:02–12:30", "inicio": "...", "fin": "..."},
  "total_ventas_usd": "182.50",
  "esperado_efectivo_usd": "60.00",
  "conteo_fisico_usd": "56.00",
  "diferencia_usd": "-4.00",
  "estado_revision": "pendiente",
  "revisado_por": null,
  "revisado_en": null,
  "tiene_adjuntos": false,
  "fue_reabierto": false
}]}
```

### `GET cierres/<id>/`
Todo lo anterior más:
```json
{
  "monto_inicial_usd": "20.00",
  "totales_por_metodo": [
    {"metodo": "efectivo", "etiqueta": "Efectivo Divisas", "ventas_usd": "40.00",
     "recargas_usd": "0.00", "abonos_usd": "0.00", "total_usd": "40.00"}
  ],
  "observaciones_cajero": "Faltó sencillo",
  "revision": {
    "estado": "observado",
    "comentario_director": "Justificar faltante",
    "revisado_por": {"id": 2, "nombre": "Director"},
    "revisado_en": "2026-10-15T09:10:00-04:00",
    "transiciones_permitidas": ["revisado", "aprobado"]
  },
  "adjuntos": [
    {"id": 5, "nombre": "acta.pdf", "url": "/media/cantina/auditoria/adjuntos/2026/10/acta.pdf",
     "tipo_mime": "application/pdf", "tamano_bytes": 18233, "descripcion": "",
     "subido_por": {"id": 2, "nombre": "Director"}, "subido_en": "...", "reemplaza_a": null}
  ],
  "reaperturas": [
    {"id": 1, "apertura_nueva_id": 52, "motivo": "...", "autorizado_por": {"id": 2, "nombre": "Director"}, "creado_en": "..."}
  ],
  "resumen_ventas": {"cantidad": 96, "anuladas": 2, "con_descuento": 1, "manuales": 4}
}
```
`totales_por_metodo` se arma desde `CierreCajaCantina.totales_por_metodo`
(JSON existente) normalizado a lista.
`metodo` usa las claves reales de `VentaCantina.METODOS_PAGO` (`efectivo`,
`efectivo_ves`, `pago_movil`, `tarjeta_prepago`, …) y `etiqueta` su texto.
`esperado_efectivo_usd` = `conteo_fisico − diferencia` (exacto, incluye
abonos); si el cierre no tiene conteo, se aproxima con monto inicial +
efectivo de ventas + recargas. *(Ajustado en la integración de la Fase 1.)*

### `POST cierres/<id>/revision/`
Body: `{"estado": "aprobado", "comentario": "OK"}`.
- `comentario` **obligatorio** para `observado`; opcional en el resto.
- Transición no permitida → `409`. Devuelve el detalle completo (como GET).
- Registra `revision_cierre`.

### `POST cierres/<id>/adjuntos/` (multipart)
Campos: `archivo` (imagen/PDF ≤ 5 MB), `descripcion` (opcional),
`reemplaza_a` (id opcional). `201` con el adjunto. Registra `adjunto_cierre`.

### `GET cierres/<id>/historial/`
Eventos de bitácora del cierre, de su apertura y de sus reaperturas, en
orden cronológico — mismo formato de evento que §5.

### `POST cierres/<id>/reabrir/` · B4 (Fase 2) · director o administrador
Body: `{"motivo": "..."}` (obligatorio). Crea una apertura nueva para el
mismo cajero/área; el cierre original no se toca. `409` si el cajero ya
tiene una caja abierta. `201 {"reapertura_id", "apertura_nueva_id"}`.

---

## 4. Reportes · B3 / F4

Filtros comunes: `fecha_inicio`, `fecha_fin`, `area`, `cajero`.

### `GET reportes/ventas/?agrupar=producto|categoria|turno|responsable|dia`
```json
{
  "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-15", "agrupar": "producto",
  "filas": [{"clave": "3", "etiqueta": "Empanada", "cantidad": 210,
             "ventas": 180, "total_usd": "210.00", "descuento_usd": "0.00"}],
  "totales": {"cantidad": 512, "ventas": 300, "total_usd": "940.00", "descuento_usd": "4.50"}
}
```
`cantidad` = unidades (para `producto`/`categoria`); `ventas` = nº de ventas.

### `GET reportes/excepciones/?tipo=anulaciones|descuentos|manuales` (paginado)
```json
{"count": 9, "next": null, "previous": null,
 "resumen": {"cantidad": 9, "monto_usd": "18.50"},
 "por_responsable": [{"usuario": {"id": 7, "nombre": "Ana Pérez"}, "cantidad": 5, "monto_usd": "10.00"}],
 "results": [{
   "venta_id": 1201, "fecha_hora": "...", "cajero": {"id": 7, "nombre": "Ana Pérez"},
   "turno": {"apertura_id": 41, "etiqueta": "..."}, "metodo_pago": "efectivo",
   "total_usd": "3.00", "descuento_usd": "0.00", "motivo": "Cliente desistió",
   "anulada_por": {"id": 7, "nombre": "Ana Pérez"}, "origen_producto": "manual", "origen_alumno": "no_aplica"
 }]}
```
**Devoluciones:** el sistema no tiene un flujo de devolución separado; la
anulación revierte el cobro. El tipo `anulaciones` cubre ambas.

### `GET reportes/inventario/?tipo=entrada|salida|ajuste|merma&producto=` (paginado)
```json
{"count": 30, "next": null, "previous": null,
 "resumen": {"entrada": 120, "salida": 96, "ajuste": -2, "merma": 5},
 "results": [{"id": 77, "fecha_hora": "...", "producto": {"id": 9, "nombre": "Jugo natural"},
   "tipo": "merma", "cantidad": 3, "stock_antes": 10, "stock_despues": 7,
   "motivo": "Vencido", "usuario": {"id": 7, "nombre": "Ana Pérez"}, "venta_id": null}]}
```

### `GET reportes/rentabilidad/?agrupar=producto|categoria`
```json
{
  "filas": [{"clave": "3", "etiqueta": "Empanada", "unidades": 210,
             "ventas_usd": "210.00", "costo_usd": "126.00", "margen_usd": "84.00",
             "margen_pct": "40.00", "unidades_sin_costo": 0}],
  "totales": {"ventas_usd": "940.00", "costo_usd": "520.00", "margen_usd": "420.00",
              "margen_pct": "44.68", "unidades_sin_costo": 35},
  "advertencia": "35 unidades vendidas no tienen costo registrado y se excluyen del margen."
}
```
Costo = Σ `costo_unitario × cantidad` del detalle (snapshot); las líneas sin
costo se excluyen del costo **y** de `ventas_usd` usado para el margen.
`advertencia` es `null` si no hay unidades sin costo.

**Exportación:** PDF (jsPDF + autotable) y Excel (xlsx) se generan en el
frontend con los mismos datos de estos endpoints (F4).

---

## 5. Bitácora · B4 / F5

### `GET bitacora/` (paginado)
Filtros: `fecha_inicio`, `fecha_fin`, `tipo` (repetible), `usuario`,
`objeto_tipo` + `objeto_id`, `area`.
```json
{"count": 120, "next": "...", "previous": null, "results": [{
  "id": 501, "tipo": "cambio_precio", "tipo_etiqueta": "Cambio de precio o costo",
  "creado_en": "...", "usuario": {"id": 7, "nombre": "Ana Pérez"}, "usuario_rol": "cajero",
  "area": "cantina", "objeto_tipo": "productocantina", "objeto_id": "9",
  "objeto_etiqueta": "Jugo natural",
  "antes": {"precio": "1.50", "costo": "0.80"}, "despues": {"precio": "2.00", "costo": "0.80"},
  "motivo": "", "ip": "10.0.0.5"
}]}
```
`hash` no se expone en el listado.

### `GET bitacora/verificar/`
`{"ok": true, "total": 120, "primer_error_id": null, "motivo": ""}` —
resultado de `verificar_cadena()`.

---

## 6. Alertas · B4 / F5

### `GET alertas/?estado=abierta|atendida&tipo=&fecha_inicio=&fecha_fin=` (paginado)
```json
{"count": 4, "next": null, "previous": null, "results": [{
  "id": 12, "tipo": "exceso_anulaciones", "tipo_etiqueta": "Exceso de anulaciones",
  "severidad": "advertencia", "fecha": "2026-10-15", "area": "cantina",
  "titulo": "Ana Pérez anuló 5 ventas hoy (límite 3)",
  "detalle": {"cajero_id": 7, "cantidad": 5, "limite": 3},
  "referencia_tipo": "usuario", "referencia_id": "7",
  "estado": "abierta", "atendida_por": null, "atendida_en": null, "nota_atencion": ""
}]}
```

### `GET alertas/resumen/`
`{"abiertas": 4, "por_severidad": {"critica": 1, "advertencia": 3, "info": 0}}`
— alimenta el badge del menú.

### `POST alertas/<id>/atender/`
Body: `{"nota": "Conversado con la cajera"}` (obligatoria). `409` si ya está
atendida. Registra `alerta_atendida`.

### Reglas del motor (`services_alertas.py`, tarea Beat diaria + al cerrar caja)

| Tipo | Condición | Severidad | `clave_dedupe` |
|---|---|---|---|
| `diferencia_caja` | `abs(cierre.diferencia) > tolerancia_diferencia_caja` | crítica si > 5× tolerancia | `diferencia_caja:cierre:<id>:<fecha>` |
| `exceso_anulaciones` | anulaciones del día por cajero > límite, o total > límite total | advertencia | `exceso_anulaciones:usuario:<id>:<fecha>` / `...:total:-:<fecha>` |
| `exceso_descuentos` | descuentos del día por cajero > límite, o una venta con % > límite | advertencia | `exceso_descuentos:usuario:<id>:<fecha>` / `...:venta:<id>:<fecha>` |
| `inventario_inconsistente` | para un producto en el día, `stock_despues` de un movimiento ≠ `stock_antes` del siguiente, o una venta completada sin su salida de inventario | crítica | `inventario_inconsistente:producto:<id>:<fecha>` |
| `cierre_faltante` | pasada `hora_tope_cierre`, aperturas del día aún abiertas | advertencia | `cierre_faltante:apertura:<id>:<fecha>` |
| `stock_bajo_minimo` | `stock_actual < stock_minimo` (activos) | info | `stock_bajo_minimo:producto:<id>:<fecha>` |

---

## 7. Parámetros — `GET` / `PUT parametros/` · B4 / F5

```json
{
  "tolerancia_diferencia_caja": "1.00",
  "limite_anulaciones_dia_cajero": 3,
  "limite_anulaciones_dia_total": 10,
  "limite_descuentos_dia_cajero": 5,
  "limite_descuento_porcentaje": "10.00",
  "hora_tope_cierre": "18:00",
  "actualizado_por": {"id": 2, "nombre": "Director"},
  "actualizado_en": "..."
}
```
`PUT` acepta los mismos campos editables; registra `parametros_auditoria`.

---

## 8. Cambios que B1 hace en endpoints existentes

- `POST /api/cantina/ventas/registrar/` acepta además:
  `descuento_usd` (≥ 0, ≤ subtotal; default 0), `motivo_descuento`
  (obligatorio si descuento > 0), `origen_producto`, `origen_alumno`.
  `es_manual = origen_producto != 'escaner' or origen_alumno == 'manual'`.
  Al crear cada `DetalleVentaCantina` se copia `producto.costo` a `costo_unitario`.
- `POST /api/cantina/ventas/<id>/anular/` exige `motivo` (no vacío) → `motivo_anulacion`.
- `POST /api/cantina/inventario/movimiento/` acepta `tipo='merma'` (cantidad
  positiva); `motivo` obligatorio para `ajuste` y `merma`.
- Serializer de producto expone y acepta `costo`.
- La venta serializada expone `descuento_usd`, `motivo_descuento`,
  `motivo_anulacion`, `es_manual`, `origen_producto`, `origen_alumno`.

---

## 9. Frontend (Fase 0 ya dejó)

- `src/cantina/auditoria/api/auditoriaApi.js` — una función por endpoint de
  este contrato. Con `VITE_AUDITORIA_MOCK=true` responde con
  `src/cantina/auditoria/api/mocks.js` (mismas formas de este documento).
- Rutas lazy (solo `ROLES.DIRECTOR`) dentro del panel administrativo
  (`MainLayout`) bajo `/auditoria-cantina`: `panel` · `cierres` · `cierres/:id`
  · `reportes` · `bitacora`. Constantes en `src/cantina/auditoria/rutas.js`.
  `/cantina/auditoria/*` redirige allí.
- Grupo "Auditoría Cantina" en el menú lateral del panel (`Sidebar.jsx`) y
  acceso directo "Auditoría" en `CantinaLayout`, ambos solo para el Director,
  con el contador de alertas (`useResumenAlertas` + `ContadorAlertas`).
- Páginas vacías en `src/cantina/auditoria/pages/` para que cada carril F
  las reemplace.

---

## 10. Correcciones (el Director modifica desde Auditoría)

Permiso: `EsDirector` (superusuario también). Otros roles → `403`.
**Sin DELETE.** Todo cambio exige `motivo` (string, ≥ 5 caracteres tras `trim`,
≤ 500) y queda en la bitácora (hash-chain) con valores antes/después, dentro de
la misma transacción. Errores: `400 {"error": "..."}` validación ·
`404` no existe · `409 {"error": "..."}` regla de negocio.

Nuevos tipos de evento de bitácora: `correccion_venta` y `nota_cierre`.

### 10.1 Buscar ventas — `GET /api/cantina/auditoria/ventas/`

Query: `q` (texto: id de venta, username/nombre del cajero, nombre/apellido
del alumno, nombre del representante/cliente, referencia), `fecha_inicio`,
`fecha_fin` (YYYY-MM-DD; omitidas → hoy), `area` (`cantina|libreria`),
`estado` (`completada|anulada`, opcional), `page`, `page_size` (≤ 100).
Más recientes primero. Respuesta paginada estándar:

```json
{"count": 1, "next": null, "previous": null, "results": [
  {"id": 311, "fecha": "2026-10-15T09:14:00-04:00", "area": "cantina",
   "cajero": {"id": 7, "nombre": "Ana Pérez"},
   "total_usd": "4.50", "descuento_usd": "0.50", "metodo_pago": "efectivo",
   "estado": "completada",
   "cliente": {"tipo": "alumno", "id": 12, "nombre": "Luis Gómez"},
   "turno": {"apertura_id": 41, "etiqueta": "Turno #41 · 07:02–12:30",
             "inicio": "...", "fin": "..."},
   "cierre_id": 88, "cierre_cerrado": true,
   "corregible": false}
]}
```
- `cliente`: `null` (venta anónima) o `{"tipo": "alumno|representante|cliente", "id", "nombre"}`
  (prioridad: representante/cliente a cuenta, si no el alumno).
- `cierre_id`/`cierre_cerrado`: cierre del turno de la venta (`null`/`false` si el turno sigue abierto).
- `corregible`: `false` si `estado='anulada'`. (Las ediciones financieras
  además se rechazan con 409 si el turno ya está cerrado, ver 10.2.)

### 10.2 Corregir venta — `POST /api/cantina/auditoria/ventas/<id>/corregir/`

Body (JSON); solo `motivo` es obligatorio y debe venir **al menos un** campo a cambiar:
```json
{"motivo": "Cliente pagó por Zelle, no en efectivo",
 "metodo_pago": "zelle", "referencia": "ZL-123",
 "descuento_usd": "0.50", "motivo_descuento": "Empleado",
 "observaciones": "texto libre"}
```
- `metodo_pago`: uno de `efectivo, efectivo_ves, zelle, transferencia, pago_movil, punto_de_venta`.
  Si el nuevo método es bancario (`zelle, transferencia, pago_movil, punto_de_venta`) se
  exige `referencia` (en el body o ya guardada en la venta).
- `descuento_usd`: ≥ 0 y ≤ subtotal (`total_usd + descuento_usd` actual). Si queda > 0,
  `motivo_descuento` es obligatorio (en el body o ya guardado). Recalcula
  `total_usd = subtotal − descuento` y `total_ves = total_usd × tasa_aplicada`
  (la tasa original no cambia). No toca stock.
- `observaciones`: texto libre (campo nuevo `VentaCantina.observaciones`, migración 0010).
- Campos que no cambian de valor se ignoran; si ningún campo cambia → `400`.

Respuesta `200`: la venta serializada con los campos de `VentaCantinaSerializer`
(`cantina/serializers.py`: `id, metodo_pago, total_usd, total_ves, descuento_usd,
motivo_descuento, subtotal_usd, estado, detalles, ...`) más `observaciones`.

Errores:
- `400` motivo ausente/corto, método o monto inválido, nada que cambiar, referencia faltante.
- `409` en estos casos (nada se modifica):
  - venta `anulada` ("Las ventas anuladas no se editan");
  - **cambio de `metodo_pago` o `descuento_usd` en un turno ya cerrado**: los totales del
    cierre son un snapshot y no se recalculan; el mensaje indica el cierre afectado.
    Sí se permiten en turno cerrado `motivo_descuento` y `observaciones` (no alteran importes);
  - método actual o nuevo = `tarjeta_prepago` o `credito_representante` (implican saldo/CxC;
    para eso se anula y se re-registra la venta). **Excepción:** `descuento_usd` en una venta
    `credito_representante` sí se permite y reajusta el `CargoCantina` (vía `services_cxc`);
    `409` si el cargo ya tiene abonos aplicados o el monto nuevo quedaría por debajo de lo
    ya pagado. En `tarjeta_prepago` el cambio de descuento → `409`.
- Bitácora: evento `correccion_venta` (`objeto_tipo='ventacantina'`) con
  `antes`/`despues` = solo los campos que cambiaron (`metodo_pago, referencia, descuento_usd,
  motivo_descuento, observaciones, total_usd, total_ves`) y el `motivo`.

### 10.3 Nota del Director en un cierre — `PATCH /api/cantina/auditoria/cierres/<id>/notas/`

Body: `{"motivo": "Aclaración tras revisar el conteo", "notas_director": "texto (puede ser vacío para limpiar, ≤ 2000)"}`.
`notas_director` edita `RevisionCierre.comentario_director` **sin cambiar el estado** de la
revisión (no hay migración). Funciona también si el cierre está `aprobado`.
Respuesta `200`: el detalle del cierre (igual a `GET cierres/<id>/`).
Errores: `400` motivo corto / `notas_director` ausente o demasiado larga; `404` cierre.
Bitácora: evento `nota_cierre` (`objeto_tipo='cierrecajacantina'`) con
`antes={"notas_director": "..."}`, `despues={"notas_director": "..."}`, `motivo`.
