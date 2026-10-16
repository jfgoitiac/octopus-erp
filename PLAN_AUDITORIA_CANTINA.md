# PLAN — Módulo "Auditoría de Cantina" (exclusivo Director)

> Objetivo: que Dirección supervise la cantina sin intervenir en las ventas,
> con trazabilidad completa de dinero, inventario y cierres.
> Estado: **implementado** — Fases 0 a 3 integradas en `feature/auditoria-cantina`.

---

## 1. Punto de partida (lo que ya existe)

Revisado en `octopus-api/cantina/` y `octopus-frontend/src/cantina/`:

| Necesidad del módulo | Qué hay hoy | Brecha |
|---|---|---|
| Ventas por período/producto/categoría | `VentaCantina`, `DetalleVentaCantina`, `ReporteVentasView`, export Excel | Falta agrupar por turno y responsable; no hay PDF |
| Esperado vs. efectivo reportado | `CierreCajaCantina` (`totales_por_metodo`, `conteo_fisico`, `diferencia`) | Conteo físico solo de efectivo; no hay estado de revisión |
| Turnos | `AperturaCajaCantina` (hasta 3 simultáneas por cajero/área) | No hay campo "turno": se **deriva** de la apertura (1 apertura = 1 turno) |
| Anulaciones | `estado='anulada'`, `anulada_por`, `anulada_en` | Falta motivo obligatorio y registro en bitácora |
| Descuentos | **No existen** | Hay que modelarlos (ver decisión D1) |
| Ventas manuales | Búsqueda manual de producto/alumno en POS | La venta no guarda si fue manual (ver D2) |
| Movimientos de inventario | `MovimientoInventario` (entrada / salida / ajuste) | "Merma" está mezclada con "ajuste" (ver D3) |
| Rentabilidad | `ProductoCantina.precio` | **No hay costo**: hay que agregar `costo` y congelarlo en el detalle de venta |
| Cambios de precio | `ProductoDetailView` actualiza en sitio | Sin historial |
| Reapertura de caja | **No existe el flujo** | Solo se puede auditar si se crea (ver D4) |
| Historial inalterable | `simple_history` instalado (usado en cobranza); `BitacoraEgreso` en egresos | No hay bitácora en cantina |
| Alertas automáticas | Celery Beat activo (`verificar-saldos-negativos-cantina` 7:00) | Falta motor de alertas de auditoría |
| Permisos | `EsCajeroOAdmin`, `EsAdminCantina` (director+admin) | Falta `EsDirector` (solo director) |

---

## 2. Decisiones que necesito antes de arrancar

- **D1 — Descuentos.** Hoy no existen en el POS. Opción A: agregar descuento
  por línea/venta en el POS (con motivo) para poder auditarlo. Opción B: dejar
  "descuentos" fuera hasta que el POS los tenga. *Recomiendo A, acotado:
  descuento por venta con motivo obligatorio.*
- **D2 — Venta manual.** ¿Se considera "manual" la venta en que el producto o
  el alumno se eligió por búsqueda en vez de escáner? *Recomiendo sí: el POS
  envía `origen_producto` / `origen_alumno` y se guarda en la venta.*
- **D3 — Merma.** Separar `merma` como tipo propio de `MovimientoInventario`
  (migración de datos: los ajustes negativos con motivo "merma" pasan a merma).
- **D4 — Reapertura de caja.** No existe. ¿La creamos (solo director o
  administrador, con motivo) o la bitácora solo registra el evento cuando
  exista? *Recomiendo crearla en la Fase 2, ya que el requerimiento la nombra.*
- **D5 — Superusuario.** Todo el proyecto deja pasar al superusuario. ¿Se
  mantiene en este módulo o es estrictamente rol `director`?
- **D6 — Adjuntos del Director.** ¿Imagen y PDF hasta 5 MB, igual que los
  comprobantes del portal?

---

## 3. Arquitectura propuesta

### Backend (Django — subpaquete dentro de `cantina`)

Archivos **nuevos** para no chocar con `views.py` (1.797 líneas):

```
octopus-api/cantina/
├── auditoria/
│   ├── __init__.py
│   ├── models.py          # EventoAuditoriaCantina, RevisionCierre, AdjuntoRevision, AlertaCantina, ParametroAuditoria
│   ├── bitacora.py        # registrar_evento(...) — única puerta de escritura
│   ├── permissions.py     # EsDirector
│   ├── serializers.py
│   ├── views_panel.py     # KPIs del panel ejecutivo
│   ├── views_cierres.py   # consulta + revisar / observar / aprobar
│   ├── views_reportes.py  # ventas, anulaciones, inventario, rentabilidad
│   ├── views_bitacora.py  # bitácora + alertas
│   ├── services_alertas.py
│   ├── tasks.py           # evaluar_alertas_auditoria_cantina (Beat)
│   └── urls.py            # montado en cantina/urls.py → 'auditoria/'
└── tests_auditoria_*.py
```

**Modelos clave**

- `EventoAuditoriaCantina` — bitácora **append-only**: `tipo` (cambio_precio,
  anulacion, ajuste_inventario, merma, reapertura_caja, cierre_modificado,
  revision_cierre, descuento…), `usuario`, `fecha`, `objeto_tipo/objeto_id`,
  `antes` / `despues` (JSON), `motivo`, `ip`, `hash_anterior` + `hash`
  (cadena SHA-256 para detectar manipulación).
  `save()` rechaza updates, `delete()` lanza error, admin de solo lectura y,
  en PostgreSQL, un trigger `BEFORE UPDATE OR DELETE` como segunda barrera.
- `RevisionCierre` — 1:1 con `CierreCajaCantina`: `estado`
  (pendiente / revisado / aprobado / observado), `comentario_director`,
  `revisado_por`, `revisado_en`. Cada transición genera un evento.
  Transiciones permitidas: pendiente→revisado→aprobado|observado,
  observado→revisado. Un cierre **aprobado no se modifica**; cualquier
  corrección crea un evento nuevo, no edita el anterior.
- `AdjuntoRevision` — archivos del Director (nunca se borran; se marcan
  `reemplazado_por`).
- `AlertaCantina` — `tipo`, `severidad`, `fecha`, `referencia`, `estado`
  (abierta / atendida), deduplicada por `(tipo, referencia, fecha)`.
- `ParametroAuditoria` (singleton, o campos nuevos en `ParametroCantina`):
  tolerancia de diferencia de caja, límite de anulaciones/día, límite de %
  descuento, hora tope de cierre.
- Cambios a modelos existentes: `ProductoCantina.costo`,
  `DetalleVentaCantina.costo_unitario` (snapshot), `VentaCantina.descuento_usd`
  + `motivo_anulacion` + `es_manual`, `MovimientoInventario` tipo `merma`.

**Instrumentación** (único punto que toca `views.py`): llamar a
`registrar_evento(...)` dentro de la misma `transaction.atomic()` en anular
venta, editar producto (precio), movimiento de inventario, cierre de caja y
reapertura.

**Permisos:** `EsDirector` en todos los endpoints de `auditoria/`. No hay
ningún endpoint `DELETE`. Los `PATCH` solo cambian el estado de revisión.

### Frontend (React 19 + router v7)

```
octopus-frontend/src/cantina/auditoria/
├── api/auditoriaApi.js
├── pages/
│   ├── AuditoriaPanel.jsx         # panel ejecutivo
│   ├── AuditoriaCierres.jsx       # lista + filtros (fecha, responsable, turno, estado)
│   ├── AuditoriaCierreDetalle.jsx # desglose por método, diferencia, revisión, adjuntos, historial
│   ├── AuditoriaReportes.jsx      # tabs: ventas / anulaciones-descuentos / inventario / rentabilidad
│   └── AuditoriaBitacora.jsx      # bitácora + alertas
└── components/ (KpiCard, EstadoRevisionBadge, LineaTiempoEventos, FiltrosPeriodo, Skeletons…)
```

- *(Ajustado tras la entrega: el módulo vive en el panel administrativo,
  `/auditoria-cantina/*` dentro de `MainLayout`, grupo propio en el menú.)*
  Rutas lazy bajo `/cantina/auditoria/*` dentro de `CantinaLayout`, con
  `ProtectedRoute allowedRoles={[ROLES.DIRECTOR]}`; ítem de menú con
  `roles: [ROLES.DIRECTOR]`.
- Reutiliza `Modal.jsx`, `TablaScroll.jsx`, `TotalesPorMetodo.jsx`,
  `ResumenCierreCaja.jsx`.
- Exportación PDF con jsPDF + autotable y Excel con xlsx (ya en el stack).
- Fechas con date-fns `es`; skeleton loaders; react-toastify en errores.
- Estándar responsive de CLAUDE.md (mobile-first, `dvh`, grillas con breakpoint).

---

## 4. Fases y reparto en paralelo

Cada **carril** es una sesión de Claude Code en su propio worktree, cortada de
la rama de integración `feature/auditoria-cantina`. Dos carriles nunca editan
los mismos archivos; la tabla de "dueño de archivos" es la regla.

```
Fase 0 (secuencial) ──► Fase 1 (5 carriles en paralelo) ──► Integración 1
                                                              │
                         Fase 2 (4 carriles en paralelo) ◄────┘
                                   │
                         Fase 3 (3 carriles en paralelo) ──► Merge a main
```

### Fase 0 — Cimientos y contrato (1 sesión, secuencial) · ~1 día

Bloquea todo lo demás. La hago yo en esta sesión.

1. Rama `feature/auditoria-cantina`.
2. Modelos + migraciones (incluidos los cambios a modelos existentes).
3. `bitacora.py` con `registrar_evento` y las protecciones append-only + tests.
4. `EsDirector` + `auditoria/urls.py` con **todas** las rutas apuntando a
   vistas stub (devuelven 501) → nadie más toca `urls.py`.
5. `CONTRATO_AUDITORIA_CANTINA.md`: endpoints, query params, forma exacta de
   cada respuesta JSON y ejemplos (como `CONTRATO_CONSTANCIAS.md`).
6. Frontend: `auditoriaApi.js` con todas las funciones + fixtures mock, rutas
   lazy registradas en `App.jsx` con páginas vacías, ítem de menú.
7. Commit y push → punto de partida de los carriles.

### Fase 1 — Núcleo (5 carriles en paralelo) · ~2 días

| Carril | Alcance | Archivos que posee |
|---|---|---|
| **B1 · Instrumentación** | Bitácora en anular venta (motivo obligatorio), edición de producto (precio/costo), movimientos de inventario (merma), cierre de caja; descuento y `es_manual` en `RegistrarVentaView` | `cantina/views.py`, `cantina/serializers.py`, tests de esos flujos |
| **B2 · Panel + cierres API** | KPIs día/semana/mes, esperado vs. reportado, diferencias pendientes, top productos, bajo stock; listado/detalle de cierres; transiciones de revisión, comentarios, adjuntos | `auditoria/views_panel.py`, `views_cierres.py`, sus serializers y tests |
| **F1 · Panel ejecutivo UI** | `AuditoriaPanel` contra mocks del contrato | `pages/AuditoriaPanel.jsx`, `components/Kpi*`, `components/Skeleton*` |
| **F2 · Cierres UI** | Lista con filtros, detalle, acciones revisar/observar/aprobar, uploader de adjuntos, línea de tiempo del historial | `pages/AuditoriaCierre*.jsx`, `components/EstadoRevision*`, `components/LineaTiempo*` |
| **F3 · POS (descuento/manual)** | Campo de descuento con motivo y marca de origen manual en el POS; motivo obligatorio al anular | `components/cantina/pos/*`, `CantinaPOS.jsx` |

**Integración 1** (yo): merge de los 5 carriles, cambiar mocks por API real,
`python manage.py test cantina`, `npm run build`, `npm run lint`.

### Fase 2 — Reportes, alertas y reapertura (4 carriles) · ~2 días

| Carril | Alcance | Archivos que posee |
|---|---|---|
| **B3 · Reportes API** | Ventas por período/producto/categoría/turno/responsable; anulaciones, devoluciones, descuentos, ventas manuales; movimientos de inventario; rentabilidad (ventas, costo, margen) | `auditoria/views_reportes.py` + tests |
| **B4 · Alertas + bitácora API** | `services_alertas.py` con las 5 reglas, tarea Beat diaria (y evaluación al cerrar caja), endpoint de bitácora filtrable y alertas; reapertura de caja (si D4 = sí) | `auditoria/services_alertas.py`, `tasks.py`, `views_bitacora.py`, entrada en `CELERY_BEAT_SCHEDULE` |
| **F4 · Reportes UI** | 4 pestañas de reportes, filtros, export PDF y Excel | `pages/AuditoriaReportes.jsx`, `utils/exportarAuditoria.js` |
| **F5 · Bitácora + alertas UI** | Bitácora con filtros y detalle antes/después; bandeja de alertas; badge de alertas en el menú; parámetros de umbrales | `pages/AuditoriaBitacora.jsx`, `components/Alerta*` |

**Reglas de alerta (B4):**
1. Diferencia de caja `|diferencia| > tolerancia`.
2. Anulaciones o descuentos del día > límite (por cajero y total).
3. Inventario vs. ventas: `stock_antes − Σ salidas por venta ≠ stock_despues`
   en el día, o salidas sin venta asociada.
4. Apertura sin cierre pasada la hora tope.
5. Productos con `stock_actual < stock_minimo`.

**Integración 2** (yo): igual que la 1.

### Fase 3 — Endurecimiento (3 carriles) · ~1 día

| Carril | Alcance |
|---|---|
| **Q1 · Seguridad** | Revisión con `ecc:security-reviewer` + `ecc:django-reviewer`: que ningún rol distinto a director acceda, que no haya forma de editar/borrar eventos, validación de adjuntos |
| **Q2 · Calidad frontend** | `ecc:react-reviewer` + revisión estática del estándar responsive (grillas, `dvh`, `TablaScroll`, `Modal`) |
| **Q3 · Docs** | `docs/manual/33-cantina.md` (sección Auditoría), `NOTAS_TECNICAS.md` con la deuda detectada, `graphify update .` |

La verificación visual en los 4 tamaños de referencia la haces tú (según tu
preferencia); yo dejo la checklist de pantallas y rutas.

---

## 5. Reglas para los carriles paralelos

- Cada carril recibe: este plan, el contrato, su lista de archivos y la
  definición de "terminado" (tests verdes + build + lint).
- **Prohibido** tocar archivos fuera de su lista; si lo necesita, me lo
  reporta y lo resuelvo en la integración.
- Commits pequeños en español; push a su rama; yo hago el merge.
- Migraciones: **solo** en Fase 0. Si un carril necesita otra, me la pide.

## 6. Riesgos

- **Costo histórico:** las ventas anteriores no tienen costo → la rentabilidad
  solo es fiable desde que se cargue `costo`. Se mostrará la advertencia.
- **Volumen:** los reportes agregan en BD (`annotate`/`aggregate`), nunca en
  Python; índices en `creado_en`, `cajero`, `apertura`.
- **Trigger PostgreSQL** no aplica en SQLite (desarrollo): la protección de
  aplicación cubre ese caso y hay test que lo verifica.
