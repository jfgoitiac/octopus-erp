# Contrato de API — Cobranza Inteligente v4, Fase D: reglas editables, perfil de pagador, proyección de caja y A/B (backend)

Base: `/api/cobranza/inteligente/`. Todo lo de las [Fase A](CONTRATO_COBRANZA_V4_FASE_A.md), [B](CONTRATO_COBRANZA_V4_FASE_B.md) y [C](CONTRATO_COBRANZA_V4_FASE_C.md) sigue vigente: JWT + rol de personal de cobranza, `409 {"detail": "Cobranza Inteligente está apagada.", "apagada": true}` si ninguna sede accesible tiene el toggle encendido (salvo lo indicado en §1), errores `400/404 {"detail": "..."}` y visibilidad por sedes.

Esta fase **no cambia** ningún endpoint anterior de forma incompatible; solo agrega campos (marcados "nuevo") y rutas. Pendiente del frontend: editor de reglas con los campos nuevos, perfil en ficha y cartera, tarjeta de proyección en Hoy y Reportes, pantalla del reporte A/B. El simulador por fecha ya existe (`motor/simulacion/`, Fase A).

Migraciones: `0054_regla_recordatorio_extra_paga_tarde`, `0055_ab_plantillas_variante` (reversibles, solo agregan columnas con valor por defecto).

---

## 1. Reglas del motor — `reglas/`

Es lo que la pestaña Automatizaciones ya espera (`getReglasCobranza`, `crearReglaCobranza`, `actualizarReglaCobranza`). Con esto el frontend deja de caer a "solo lectura" (el 404/405 ya no ocurre).

- **No responde 409 "apagada"**: las reglas se pueden preparar con el módulo apagado.
- **Permisos:** GET personal de cobranza; POST y PATCH solo director / administrador / sistemas (`403` si no).
- **Sede:** `?sede=<id>` como en `configuracion/`. Sin `?sede=` son las reglas **globales** (sede nula). Una sede ajena a la del usuario da `404`; `?sede=x` da `400`.
- **No hay DELETE:** los envíos referencian la regla y son historial. Para retirarla: `PATCH {"activa": false}`.

### Forma de una regla

```jsonc
{ "id": 3, "sede": 1, "heredada": false,
  "nombre": "Seguimiento cordial", "etapa": "temprana",          // preventiva | temprana | prioritaria
  "dia_relativo": 3,                                              // -30 … 90 (negativo = antes de vencer)
  "canal": "whatsapp",                                            // whatsapp | email | ambos | interno
  "plantilla": "seguimiento_1",                                   // preventivo | vence_manana | vence_hoy | seguimiento_1 | seguimiento_2 | prioritaria | critico_director
  "plantilla_meta": "cobro_seguimiento",                          // "" = texto libre
  "plantilla_meta_b": "cobro_seguimiento_v2",                     // nuevo (§4)
  "ab_activo": true,                                              // nuevo: derivado, A y B definidas
  "saldo_minimo": "0.01",                                         // string decimal USD
  "destinatario": "representante",                                // representante | responsable | director
  "activa": true,
  "recordatorio_extra_paga_tarde": false }                        // nuevo (§2)
```

### GET `reglas/?sede=&todas=1`

`{ "count": 7, "results": [regla, …] }` ordenado por `dia_relativo`. Sin `todas=1` solo las activas. Si la sede **no tiene reglas propias** se devuelven las globales con `heredada: true` (así las usa el motor). El frontend ya acepta lista o `{results}`.

### POST `reglas/?sede=`

Obligatorios: `nombre` (máx. 100), `etapa`, `dia_relativo`, `canal`, `plantilla`. Opcionales: `plantilla_meta`, `plantilla_meta_b`, `saldo_minimo` (≥ 0), `destinatario` (por defecto `representante`), `activa` (por defecto `true`), `recordatorio_extra_paga_tarde`. Campos desconocidos (`id`, `sede`, `heredada`…) se ignoran. `201` con la regla y `reglas_copiadas_de_globales`.

**Regla de herencia:** las reglas propias de una sede *reemplazan* a las globales. Por eso, si la sede solo hereda, el primer POST **copia primero las globales** a la sede y luego crea la nueva (`reglas_copiadas_de_globales` > 0): la sede no pierde el resto de la línea de tiempo sin querer. Al encender el módulo la sede ya recibe las reglas por defecto, así que normalmente es 0.

### POST `reglas/copiar-globales/`

Body opcional `{ "sede": <id> }` (también vale `?sede=`; es obligatoria: sin sede `400`, la sede ajena `404`). Si la sede **solo hereda** las reglas globales, las copia a la sede (misma lógica que el primer POST de regla) para poder editarlas una a una. **Idempotente:** si la sede ya tiene reglas propias no copia nada. Respuesta `200`: `{ "count": n, "results": [regla, …], "copiadas": k }`, con las reglas propias de la sede (`heredada: false`; solo activas salvo `?todas=1`); `copiadas` es 0 si ya tenía propias. Mismos permisos que el POST de reglas (director / administrador / sistemas; `403` al resto) y se audita en `LogAuditoria` como `COBRANZA_REGLAS_COPIADAS_DE_GLOBALES` (`detalles: {sede, copiadas}`) solo cuando copió algo. No responde 409 "apagada".

### PATCH `reglas/<id>/`

Edición parcial de cualquier campo anterior; `sede` no se puede cambiar. Una regla global solo la edita quien tiene acceso a todas las sedes (el resto recibe `404`). Cada alta o cambio deja un `LogAuditoria` (`COBRANZA_REGLA_CREADA` / `COBRANZA_REGLA_EDITADA`, con el antes y el después).

### Errores `400 {"detail"}` (mostrar el texto)

Nombre vacío o largo; `etapa`/`canal`/`destinatario` inválidos; `dia_relativo` no entero o fuera de −30…90; plantilla de texto desconocida; `saldo_minimo` negativo o no numérico; **"Ya existe una regla para el día +3"** (una regla por día y sede); y las de §2 y §4. Cambiar reglas afecta solo a los envíos que se creen de ahí en adelante.

---

## 2. Perfil de pagador

Se calcula **al vuelo** (no se guarda) con los últimos 6 meses de mensualidades **ya vencidas** de los alumnos activos del representante (sin becados). `cobranza/perfil_pagador.py`. Una mensualidad pagada con más de 3 días de atraso es "tarde"; una impaga cuenta solo si lleva más de 3 días vencida (en gracia no define nada).

| `codigo` | `etiqueta` | Criterio (en este orden) |
|---|---|---|
| `sin_historial` | Sin historial | nada evaluable en la ventana |
| `cronico` | Crónico | 3 o más impagas atrasadas, o 4+ evaluables con la mitad o más impagas |
| `moroso_nuevo` | Moroso nuevo | 1 o 2 impagas atrasadas |
| `paga_tarde` | Paga tarde pero paga | sin impagas y (2 o más pagadas tarde o 1/3 o más tarde) |
| `puntual` | Puntual | todo lo demás |

Los umbrales son constantes del módulo (ajustables con el colegio piloto). Un descriptor compacto es `{ "codigo": "paga_tarde", "etiqueta": "Paga tarde pero paga" }`.

### Dónde aparece (nuevo)

- `cartera/` — cada fila: `perfil_pagador` (descriptor).
- `representantes/<id>/expediente/` — `perfil_pagador` a nivel raíz y en cada ciclo.
- `representantes/<id>/perfil-pagador/` (GET, ficha) — el detalle:

```jsonc
{ "representante": 7, "perfil": "moroso_nuevo", "etiqueta": "Moroso nuevo",
  "ventana_meses": 6, "dias_gracia": 3, "evaluadas": 4,
  "impagas_atrasadas": 1, "pagadas_tarde": 0, "pagadas_a_tiempo": 3,
  "meses": [ { "mensualidad": 11, "periodo": "04/2026", "vencimiento": "2026-04-10",
               "pagada": true, "dias_atraso": 0, "tarde": false }, … ] }
```
`409` si el módulo está apagado; `404` si el representante no tiene alumnos en sedes accesibles.

### Recordatorio extra en −3 para "Paga tarde" (opcional por regla)

`recordatorio_extra_paga_tarde: true` en una regla hace que, **además de su propio día**, esa regla se envíe en el día **−3** (3 días antes del vencimiento) a los representantes con perfil `paga_tarde`. Usa el canal, la plantilla de texto y la de Meta de esa regla (típicamente la de −5, preventiva). Es un envío normal del motor: pasa por las mismas verificaciones (baja, horario, tope semanal, comprobante, etc.) y se rige por la clave única (representante, regla, fecha).

- Solo una regla por sede puede llevarlo (`400` "solo puede haber una").
- Solo reglas para el `representante` y con canal distinto de `interno` (`400`).
- Si la sede ya tiene una regla propia en el día −3, esa manda y el extra no se envía.
- Una regla inactiva no genera el extra.
- El `EnvioCobranza.detalle` trae `dia_relativo: -3` y `extra: "paga_tarde"`; `motor/simulacion/` agrega `recordatorio_extra: true` a la fila (la `regla.dia_relativo` sigue siendo el de la regla).

---

## 3. Proyección de caja de la semana — `proyeccion-caja/`

GET `proyeccion-caja/?fecha=AAAA-MM-DD&sede=` (mismos permisos y `409` que Hoy). Semana de lunes a domingo de `fecha` (por defecto, hoy). `400` si la fecha es inválida.

Qué se proyecta: las cuotas **pendientes** de **promesas** (`tipo=promesa`) y **convenios** (`tipo=convenio`) **vigentes** con fecha dentro de la semana, ponderadas por la probabilidad de cumplimiento del perfil de pagador del representante. No incluye mensualidades que vencen esa semana ni cuotas atrasadas de semanas anteriores (esas son tarjetas `promesa_vencida`).

**Probabilidad por perfil:** la tasa **histórica** (cuotas ya vencidas de convenios no cancelados que se pagaron, entre representantes de ese perfil) si hay al menos 10 cuotas de muestra; si no, el valor por defecto: puntual 0.95, paga tarde 0.75, moroso nuevo 0.55, crónico 0.25, sin historial 0.60.

```jsonc
{ "semana": { "desde": "2026-07-20", "hasta": "2026-07-26" },
  "casos": 3, "comprometido_usd": "80.00", "esperado_usd": "37.50",
  "por_fuente": { "promesas":  { "casos": 1, "comprometido_usd": "30.00", "esperado_usd": "7.50" },
                  "convenios": { "casos": 2, "comprometido_usd": "50.00", "esperado_usd": "30.00" } },
  "por_perfil": { "cronico": { "etiqueta": "Crónico", "casos": 1, "comprometido_usd": "30.00", "esperado_usd": "7.50",
                               "probabilidad": { "valor": "0.25", "fuente": "por_defecto", "muestra": 0 } }, … },
  "por_dia": [ { "fecha": "2026-07-20", "casos": 0, "comprometido_usd": "0.00", "esperado_usd": "0.00" }, … 7 días ],
  "detalle": [ { "cuota": 9, "convenio": 4, "tipo": "promesa", "numero": 1, "fecha": "2026-07-22",
                 "monto_usd": "30.00", "representante": { "id": 7, "nombre": "Luis Gil", "cedula": "V2" },
                 "perfil_pagador": { "codigo": "cronico", "etiqueta": "Crónico" },
                 "probabilidad": "0.25", "esperado_usd": "7.50" } ],
  "regla": "…texto explicativo para mostrar…" }
```
`probabilidad.fuente`: `"historica"` | `"por_defecto"`; `muestra` = cuotas vencidas de ese perfil usadas. Todos los perfiles aparecen en `por_perfil` (en cero si no aplican).

**En Hoy (nuevo):** `GET hoy/` trae `proyeccion_caja` con la versión compacta (`semana`, `casos`, `comprometido_usd`, `esperado_usd`, `por_fuente`), sin `detalle`. Para Reportes, usar el endpoint completo.

---

## 4. Comparación A/B de plantillas

### Configuración
`ReglaCobranza.plantilla_meta_b` (nuevo) junto a `plantilla_meta`. Con **ambas** definidas, la regla queda en A/B (`ab_activo: true`) siempre que sea un aviso por WhatsApp (`canal` whatsapp o ambos) al representante. Validaciones en el PATCH/POST: B exige A (`400`), y deben ser distintas (`400`). Quitar B apaga la comparación.

### Asignación
Alternada y **estable por representante**: id impar = **A**, id par = **B** (el mismo representante ve siempre la misma variante). La variante se guarda al crear el envío en `EnvioCobranza.variante` (`"A"`, `"B"` o `""`); el envío sale con la plantilla de Meta de su variante y el saliente de la conversación lo registra en `payload.variante`. `envios/` (cada fila) y `motor/simulacion/` (cada fila) traen `variante` (nuevo).

> Cambiar las plantillas A/B de una regla mientras corre la comparación mezcla los resultados: conviene crear la comparación con las plantillas definitivas y leer el reporte por rango de fechas (`desde`/`hasta`).

### GET `ab/reporte/?regla=<id>&desde=&hasta=&sede=`

`desde`/`hasta` (AAAA-MM-DD) filtran por la fecha del envío; `regla` limita a una. `400` con parámetros inválidos; `409` si está apagado. Una fila por regla con A/B definida (aparece en cero si aún no tiene envíos) o que haya tenido envíos con variante.

**Medición, "recuperado a 7 días":** de cada envío **enviado** (los simulados no cuentan), cuánto de su saldo se pagó en los 7 días siguientes = saldo (al crear el envío) de los ciclos cerrados por pago (`motivo_cierre: "pagada"`) con `cerrado_en` entre el envío y 7 días después. Los pagos parciales no cuentan hasta que el ciclo cierra. Solo se miden los envíos **maduros** (ya pasaron 7 días); el resto va en `por_medir`.

```jsonc
{ "dias_medicion": 7, "muestra_minima": 30, "diferencia_minima_pp": "2.0", "regla": "…", "count": 1,
  "results": [ {
    "regla": { "id": 3, "nombre": "Seguimiento cordial", "dia_relativo": 3, "sede": 1, "ab_activo": true },
    "A": { "plantilla": "cobro_seguimiento", "enviados": 40, "medidos": 34, "por_medir": 6, "pagaron": 21,
           "tasa_pago_pct": 61.76, "saldo_medido_usd": "1700.00", "recuperado_usd": "1050.00", "recuperado_pct": 61.76 },
    "B": { "plantilla": "cobro_seguimiento_v2", … },
    "muestra_suficiente": true, "ganadora": "A",          // "A" | "B" | "empate" | null
    "diferencia_recuperado_pp": "7.40" } ] }               // A menos B; null sin muestra suficiente
```
`ganadora` es `null` (y `muestra_suficiente: false`) hasta que **ambas** variantes tengan al menos 30 envíos medidos; con diferencia menor a 2 puntos porcentuales es `"empate"`. `tasa_pago_pct` y `recuperado_pct` son `null` si no hay base. Es una lectura orientativa: no hay prueba estadística. Para la UI: mostrar `por_medir` y la leyenda de muestra insuficiente en lugar de declarar ganador.

---

## 5. Resumen de cambios

| Tipo | Detalle |
|---|---|
| Rutas nuevas | `GET/POST reglas/`, `POST reglas/copiar-globales/`, `PATCH reglas/<id>/`, `GET representantes/<id>/perfil-pagador/`, `GET proyeccion-caja/`, `GET ab/reporte/` |
| Campos nuevos | `ReglaCobranza.recordatorio_extra_paga_tarde`, `ReglaCobranza.plantilla_meta_b`, `EnvioCobranza.variante` |
| Respuestas ampliadas | `cartera/` y `expediente/` (`perfil_pagador`), `hoy/` (`proyeccion_caja`), `envios/` y `motor/simulacion/` (`variante`; simulación también `recordatorio_extra`) |
| Comportamiento automático | Extra −3 para "Paga tarde" (si la regla lo pide); plantilla de Meta según variante A/B |
| `EnvioCobranza.detalle` | nuevo `saldos` (`{ciclo_id: saldo}` al crear el envío) y, en el extra, `extra: "paga_tarde"` |
