# Contrato de API — Cobranza Inteligente v4, Fase A (backend)

Base: `/api/cobranza/inteligente/` (todas las rutas requieren JWT y rol de personal de cobranza: DIRECTOR, ADMINISTRADOR, COBRANZA, CAJERO, SISTEMAS).

**Módulo apagado:** todos los endpoints de esta lista responden `409` con `{"detail": "Cobranza Inteligente está apagada.", "apagada": true}` si ninguna sede accesible tiene el toggle encendido (igual que `bandeja/`, `convenios/`, etc.).
Errores de validación: `400 {"detail": "..."}`; no encontrado: `404 {"detail": "..."}`.
Parámetro opcional `?sede=<id>` donde se indica.
Fechas: `AAAA-MM-DD`; instantes: ISO 8601.

---

## GET `hoy/?sede=`

```jsonc
{
  "fecha": "2026-07-20",
  "resumen": {
    "frase": "Hoy: 6 casos requieren acción · 3 comprobantes por aprobar · 2 promesas vencidas. El sistema enviará 41 recordatorios a las 8:00.",
    "casos_requieren_accion": 6,        // = tarjetas.length
    "comprobantes_por_aprobar": 3,
    "promesas_vencidas": 2,
    "envios_programados_hoy": 41,       // evaluación en seco (solo los que saldrían de verdad)
    "hora_envios": "8:00"
  },
  "tarjetas": [ /* ver Tarjeta, ordenadas por prioridad desc */ ],
  "tarjetas_por_tipo": { "caso_prioritario": 2, "promesa_vencida": 1 },
  "kpis": {
    "cartera_mes": { "facturado_usd": "1000.00", "cobrado_usd": "400.00", "pendiente_usd": "600.00", "cobrado_pct": 40.0 },
    "distribucion_por_etapa": {              // claves: preventiva, vencida, seguimiento, prioritaria, critica, pausada
      "vencida": { "casos": 3, "saldo_usd": "150.00" }
    },
    "mora_por_antiguedad": { "por_vencer": 4, "1_7": 3, "8_15": 2, "16_30": 1, "mas_30": 0 },
    "pagos_por_conciliar": 5,
    "envios_7_dias": { "enviado": 20, "omitido": 3, "fallido": 1 }   // por estado, últimos 7 días
  },
  "actividad": [                             // últimos 15 envíos automáticos (sin simulados/cancelados)
    { "id": 1, "fecha": "2026-07-20", "estado": "enviado", "canal": "whatsapp", "motivo_omision": "",
      "enviado_en": "...", "creado_en": "...", "regla": "Seguimiento cordial",
      "representante": { "id": 7, "nombre": "Maria Perez" } }
  ]
}
```

### Tarjeta

```jsonc
{
  "clave": "caso_prioritario:7",      // estable; úsala en .../hecha/. Se codifica con encodeURIComponent
  "tipo": "caso_prioritario",         // ver tabla de tipos
  "prioridad": 85,                    // orden descendente
  "urgente": true,                    // cuenta para el badge del sidebar
  "titulo": "Maria Perez: caso crítico sin gestión reciente",
  "por_que": [ { "texto": "Mora de 19 días", "puntos": 19 } ],   // puntaje explicable (puntos 0 si no aplica)
  "representante": { "id": 7, "nombre": "Maria Perez", "cedula": "V1", "telefono": "0412..." },   // null en fuentes sin representante
  "ciclos": [12, 13],                 // ids de CicloCobranza relacionados
  "acciones": [
    { "accion": "abrir_chat", "etiqueta": "Abrir chat", "disponible": false },   // false = fase B (Conversaciones)
    { "accion": "llamada",    "etiqueta": "Registrar llamada", "disponible": true, "ciclo": 12 },
    { "accion": "pausar",     "etiqueta": "Pausar", "disponible": true, "ciclo": 12 }
  ],
  "desde": "2026-07-20T00:00:00-04:00",   // instante desde el que la condición está vigente
  "sede": 1,
  "detalle": { }                      // específico del tipo
}
```

| `tipo` | `clave` | Acciones (`accion`) | `detalle` |
|---|---|---|---|
| `caso_prioritario` | `caso_prioritario:<rep>` | `abrir_chat`(no disp.), `llamada`, `pausar` (con `ciclo`) | `puntaje`, `saldo_total_usd`, `dias_mora_max`, `estados` |
| `promesa_vencida` | `promesa_vencida:<convenio>` | `abrir_chat`(no disp.), `llamada` | `convenio`, `fecha_promesa`, `monto_usd`, `origen` |
| `pago_en_revision` | `pago_en_revision:<pago\|comprobante>:<id>` | `conciliar` (con `tipo`, `id`) | `tipo`, `id`, `monto_usd`, `alumno`, `dias_espera` |
| `envio_fallido` | `envio_fallido:<envio>` | `ver_envio` (con `envio`), `editar_representante` | `envio`, `canal`, `regla`, `intentos` |
| `sin_contacto` | `sin_contacto:<rep>` | `editar_representante` | — |
| *(fase B)* `conversacion_espera`, `conversacion_tomada` · *(fase C)* `comprobante_whatsapp` | ver `cobranza/hoy.py` | — | se registran con `hoy.registrar_fuente` |

Reglas: `caso_prioritario` = representante de la bandeja con etapa prioritaria/crítica o puntaje >= 30, **sin** llamada, nota, WhatsApp manual, convenio ni cobro manual en los últimos 3 días. `pago_en_revision` = 3+ días de espera. `promesa_vencida` = promesa incumplida en los últimos 14 días. `envio_fallido` = fallidos en los últimos 14 días.

## POST `hoy/tarjetas/<clave>/hecha/`

Body opcional `{ "nota": "texto" }`. Registra un `EventoCiclo` tipo `tarjeta_hecha` (usuario, clave, nota).
Respuesta `200 { "clave": "...", "hecha": true }`. `404` si la tarjeta no existe o ya no está vigente. Idempotente.
La tarjeta no reaparece hasta que su condición vuelva a dispararse (campo `desde`: p. ej. una tarjeta de bandeja reaparece al día siguiente).

## GET `contadores/?sede=`

```json
{ "no_leidos": 0, "tarjetas_urgentes": 2, "total_tarjetas": 6, "total": 2 }
```
`total` = número del badge del sidebar (`no_leidos + tarjetas_urgentes`). `no_leidos` es 0 hasta la Fase B. Liviano para polling (no calcula KPIs ni simulación).

## GET `motor/simulacion/?fecha=AAAA-MM-DD&sede=`

Evaluación en seco del motor: no crea ningún registro. `fecha` opcional (hoy por defecto); `400` si es inválida. Solo ve las deudas que existen hoy (mensualidades futuras aún no generadas no aparecen).

```jsonc
{
  "fecha": "2026-07-20", "total": 41,
  "por_estado": { "saldria": 38, "se_omitiria": 2, "solo_simulado": 0, "ya_creado": 1 },
  "por_canal":  { "whatsapp": 30, "ambos": 11 },
  "items": [{
    "sede": 1,
    "estado": "saldria",              // saldria | se_omitiria | solo_simulado (modo sombra / etapa apagada) | ya_creado (ya existe el EnvioCobranza de ese día)
    "motivos_omision": [],            // si se_omitiria: baja_voluntaria | pago_en_revision | limite_semanal | cobro_manual_hoy | conversacion_humana | comprobante_pendiente
    "representante": { "id": 7, "nombre": "Maria Perez", "cedula": "V1" },
    "regla": { "id": 3, "nombre": "Seguimiento cordial", "dia_relativo": 3, "etapa": "temprana", "plantilla": "seguimiento_1", "destinatario": "representante" },
    "canal": "whatsapp", "saldo_total_usd": "50.00", "ciclos": [12], "envio_existente": null
  }]
}
```
El horario no se evalúa (el motor reprograma al horario permitido).

## POST `promesas/`

Body: `{ "representante_id": 7, "ciclo_ids": [12], "fecha": "2026-07-25", "monto": "50.00" (opcional), "notas": "" }`.
Crea un `ConvenioPago` `tipo='promesa'`, `origen='cobrador'` de **una sola cuota** por el saldo de las deudas (si se manda `monto` debe igualar el saldo, ±0.01). La fecha no puede ser pasada. Pausa los ciclos (motivo `convenio`). `201` con el convenio serializado:

```jsonc
{ "id": 9, "estado": "vigente", "tipo": "promesa", "origen": "cobrador", "notas": "", "creado_en": "...",
  "representante": 7, "ciclos": [12],
  "cuotas": [ { "id": 20, "numero": 1, "fecha": "2026-07-25", "monto_usd": "50.00", "pagada": false, "pagada_en": null } ] }
```
Cumplida: usar el endpoint existente `convenios/cuotas/<id>/pagar/`. Incumplida: la tarea diaria `revisar_convenios` la marca `incumplido`, devuelve las deudas al ciclo y aparece la tarjeta `promesa_vencida`.

**Cambios en endpoints existentes:** `convenios/` (GET/POST) y las respuestas de convenio ahora incluyen `tipo` (`convenio|promesa`) y `origen` (`cobrador|whatsapp`). `GET convenios/?tipo=promesa|convenio` filtra.

## GET `representantes/<id>/historial-cobros/`

Historial unificado de mensajes de cobro del representante (más reciente primero, máx. 50):

```jsonc
{ "representante": 7, "count": 4, "results": [{
    "fecha": "...", "canal": "whatsapp", "estado": "enviado",
    "origen": "motor",                 // motor | manual_api | manual_wame | aviso_anterior
    "origen_etiqueta": "Automático (Cobranza Inteligente)",   // texto listo para mostrar
    "detalle": "Seguimiento cordial", "motivo_omision": ""
}]}
```
Etiquetas: `motor` "Automático (Cobranza Inteligente)", `manual_api` "Manual desde Morosos (API)", `manual_wame` "Manual desde Morosos (wa.me)", `aviso_anterior` "Aviso automático anterior".

---

## Cobro manual de Morosos (`/api/notificaciones/cobro-whatsapp/...`) con el toggle encendido

Con el toggle de la sede **apagado** nada cambia (mismas respuestas que siempre). Con el toggle **encendido** (alguna sede de los alumnos activos del representante):

- `POST previsualizar/` agrega `control` a la respuesta (ausente con el toggle apagado):
  ```jsonc
  "control": { "activo": true,
    "modo_a": { "permitido": true,  "requiere_confirmacion": true,  "bloqueos": [], "avisos": [ { "codigo": "baja_voluntaria", "mensaje": "..." } ] },
    "modo_b": { "permitido": false, "requiere_confirmacion": false, "bloqueos": [ { "codigo": "baja_voluntaria", "mensaje": "..." } ], "avisos": [] } }
  ```
  Códigos: `baja_voluntaria`, `pago_en_revision`, `comprobante_pendiente` (fase C), `limite_semanal`, `conversacion_humana` (fase B), `cobro_automatico_hoy`, `cobro_manual_hoy`. **Modo A (wa.me)**: todo llega como `avisos` (se advierte antes de abrir wa.me, no se bloquea). **Modo B (API)**: baja, pago en revisión y comprobante pendiente son `bloqueos`; el resto `avisos`.
- `POST registrar-envio-manual/` (Modo A): además del registro actual, deja `EventoCiclo` `cobro_manual` (origen `manual_wame`) en cada deuda abierta; cuenta para el tope semanal (3) y el "un mensaje por día" del motor.
- `POST enviar/` (Modo B): con bloqueos responde `400 { "error", "bloqueado": true, "motivo": "<codigo>", "bloqueos": [...] }` sin llamar a Meta; con avisos y sin `confirmar: true` responde `409 { "error", "requiere_confirmacion": true, "avisos": [...] }`; enviado, registra `EventoCiclo` `cobro_manual` (origen `manual_api`).
- El motor no envía a quien recibió un cobro manual el mismo día (`motivo_omision: "cobro_manual_hoy"`) y suma los cobros manuales al tope semanal.
- La señal `al_crear_mensualidad` y las tareas del flujo anterior siguen sin enviar nada en sedes con el toggle encendido (cubierto por `notificaciones/tests_cobro_control.py`).

## Pendiente para el frontend (no hecho en backend)

- Configuración → Notificaciones: aviso y solo lectura de `dias_recordatorio_*` (es solo UI; el backend ya ignora esos días con el toggle encendido).
- Las acciones con `"disponible": false` (`abrir_chat`) quedan deshabilitadas hasta la Fase B.
