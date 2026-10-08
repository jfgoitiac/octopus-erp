# Plan de ejecución — Cobranza Inteligente (v3)

**Objetivo:** convertir la cobranza actual en un motor de seguimiento que acompañe cada deuda desde la prevención hasta el pago, la conciliación o el escalamiento a una persona. Sin enviar nunca un cobro a una familia que ya pagó.

**Nombre del módulo:** **Cobranza Inteligente**. Es el nombre que ve el usuario en el menú, los ajustes, el dashboard y los textos de soporte.

**Módulo apagable:** Cobranza Inteligente se enciende y se apaga con un **toggle** en Configuración (ver §3). Apagado, el sistema se comporta como si el módulo no existiera: no evalúa, no envía y no muestra sus pantallas. Viene **apagado por defecto** en toda sede.

**Duración:** 10 semanas de construcción + piloto que cubre **un ciclo mensual completo**. El piloto arranca en modo sombra desde la semana 6, así no hay que esperar a la semana 10 para tener datos reales.

**Alcance del primer lanzamiento:** solo **mensualidades**. Inscripción, solvencias, materiales y cargos especiales entran cuando el flujo esté probado.

---

## 0. Qué cambia respecto a la versión anterior

> **Cambios de la v3:** el módulo pasa a llamarse **Cobranza Inteligente** (se elimina el sufijo "4C") y se agrega el **toggle de encendido/apagado** (fila 11 y §3). El antiguo "interruptor de apagado" de la v2 se reemplaza por este toggle.

| # | Cambio | Por qué |
|---|---|---|
| 1 | Se agrega un **diagnóstico del motor actual** en la semana 1 | El sistema actual ya tiene fallas que el plan anterior no mencionaba (ver §1) |
| 2 | **Se cobra por deuda y se escribe al representante** | Una familia con 3 hijos y 2 meses atrasados no debe recibir 6 mensajes el mismo día |
| 3 | **Modo sombra** antes de enviar mensajes reales | El motor nuevo se ejecuta al mismo tiempo que el actual y registra lo que *habría* enviado; así se valida sin riesgo |
| 4 | **Interruptor por sede** y corte inmediato | Detener los envíos en segundos si algo sale mal (ahora materializado en el toggle, fila 11) |
| 5 | El piloto cubre **un ciclo de facturación completo** | Una semana no alcanza para medir la mora a 15 y 30 días |
| 6 | Las **plantillas de WhatsApp de Meta** se tramitan desde la semana 1 | Su aprobación tarda y bloquea la Fase 2 si se deja para después |
| 7 | **Atribución definida** para "recuperado por Octopus" | Sin una regla explícita, la métrica comercial no se puede defender |
| 8 | **Límites de contacto** (frecuencia, horario, baja voluntaria) | Proteger la relación con las familias y cumplir las políticas de Meta |
| 9 | **Convenios** se entregan en versión mínima | Un convenio completo es casi otro módulo; se reduce el riesgo de agrandar el proyecto |
| 10 | Se agregan **riesgos, pruebas y despliegue** por fase | Cada fase se puede liberar y revertir de forma independiente |
| 11 | **Toggle de encendido/apagado** de Cobranza Inteligente, por sede, en Configuración | Es un sistema de seguimiento: cada colegio decide si lo usa, y se puede apagar en segundos sin perder datos (ver §3) |

---

## 1. Puntos de partida en el código actual

Revisión de `octopus-api` hecha antes de planificar:

| Hallazgo | Dónde | Impacto en el plan |
|---|---|---|
| **Los avisos se programan por dos vías.** La señal `al_crear_mensualidad` agenda avisos con `countdown` relativo a la *creación*, y la tarea diaria `revisar_y_programar_notificaciones_pendientes` los dispara según los días desde el *vencimiento* | `cobranza/signals.py`, `notificaciones/tasks.py` | Puede haber avisos duplicados, y un "día 0" que sale el día 1 del mes, antes de vencer. El motor nuevo **reemplaza ambas vías** por una sola evaluación diaria |
| Avisos agendados con `countdown` de hasta 15 días en Celery/Redis | `programar_notificaciones_mensualidad` | Si una tarea con ETA larga supera el `visibility_timeout`, se vuelve a entregar (duplicado), y si se limpia la cola se pierde. Se elimina el agendado a futuro |
| `NotificacionLog` no tiene relación con la deuda (solo cédula y nombre en texto) y no tiene clave de idempotencia | `notificaciones/models.py` | No se puede garantizar "un aviso por etapa". Hace falta un registro nuevo con clave única |
| Antes de enviar solo se revisa `Mensualidad.pagado` | `task_notificar_mora_programada` | Se cobra aunque haya un `Pago` en `en_revision` o un comprobante subido desde el portal. Hay que pausar en esos casos |
| `Mensualidad` no guarda la fecha de vencimiento: se calcula con `Alumno.dia_limite_pago` | `cobranza/mora.py`, `notificaciones/tasks.py` | Si cambia el día límite del alumno, cambia la etapa de deudas viejas. Se guarda la fecha de vencimiento en el ciclo al crearlo |
| `cobranza/mora.py` ya es la **fuente única** de la regla de mora | `cobranza/mora.py` | El ciclo **no inventa un tercer criterio**: reutiliza `mora.py` |
| La configuración de notificaciones es un único registro (`pk=1`) y existe `multisede.Sede` | `ConfiguracionNotificaciones` | Decidir en Fase 0 si las reglas son por instancia o por sede. **El toggle sí es por sede** (ver §3) |
| Ya existen el cobro por WhatsApp agrupado por representante, el antispam de 24 h (`hubo_envio_reciente`) y las plantillas `PlantillaWhatsApp` (Modo A wa.me / Modo B API) | `notificaciones/cobro_whatsapp.py` | Se reutilizan; no se construyen canales nuevos |
| Montos en USD con referencia en Bs según la tasa BCV, que se sincroniza durante el día | `cobranza/tasks.py` | El monto en Bs del mensaje se calcula **al enviar**, nunca al agendar |

> Estos hallazgos se anotan en `NOTAS_TECNICAS.md`. No se corrigen fuera del plan: el motor nuevo los resuelve al reemplazar el flujo actual.

---

## 2. Calendario

| Fase | Semanas | Entregable | Se puede liberar solo |
|---|---:|---|---|
| 0. Definición, diagnóstico y piloto | 1–2 | Reglas firmadas, métricas base, plantillas enviadas a Meta | — |
| 1. Núcleo de ciclos + toggle | 3–4 | Toggle de Cobranza Inteligente, ciclo, semáforo e historial por deuda (solo lectura) | Sí: vista en Morosos, detrás del toggle |
| 2. Automatización | 5–6 | Motor de reglas + envíos, **en modo sombra** desde la semana 6 | Sí, toggle apagado por defecto |
| 3. Gestión humana | 7–8 | Bandeja, pausas, pagos en revisión, convenio mínimo | Sí |
| 4. Dirección y piloto real | 9–10 | Dashboard, envíos reales escalonados | Sí |
| Piloto extendido | 11–14 | Primer ciclo mensual completo medido contra la línea base | — |

**Hito de calendario:** el envío real de avisos preventivos debe comenzar **unos días antes del vencimiento de un mes** (por ejemplo, el día −5 del ciclo de noviembre). Si la semana 9 no coincide con esa ventana, se espera al próximo ciclo en modo sombra en lugar de empezar a mitad de mes.

---

## 3. Toggle de Cobranza Inteligente (encendido / apagado)

Cobranza Inteligente es un sistema de seguimiento, no una obligación: cada colegio lo enciende o apaga cuando quiere desde **Configuración → Cobranza Inteligente**. Se construye en la **Fase 1** (semana 3), antes que cualquier envío, y todas las fases posteriores cuelgan de él.

### Qué es y dónde vive

- Un **switch** con estado visible (*Encendido* / *Apagado*), mobile-first y con `Modal` de confirmación (el de `src/components/ui/Modal.jsx`) al cambiar de estado.
- Se guarda **por sede** en `ConfiguracionCobranzaInteligente` (una fila por `multisede.Sede`; en instalaciones de una sola sede, una fila):

| Campo | Uso |
|---|---|
| `activo` | El toggle. **Por defecto `False`** en sedes nuevas y tras la migración |
| `modo_sombra` | Con el módulo encendido, evalúa y registra lo que habría enviado, pero **no envía** (piloto, semanas 6–9) |
| `etapas_envio_activas` | Qué etapas envían de verdad: preventiva, temprana, prioritaria/crítica (activación escalonada de la semana 10) |
| `activado_por`, `activado_en` | Quién y cuándo lo encendió |

- Además existe un **corte global de soporte** (variable de entorno, `COBRANZA_INTELIGENTE_GLOBAL_OFF`) para que Octopus detenga el módulo en todas las sedes sin tocar la base de datos. El estado efectivo es `activo AND NOT corte_global`.
- **Permiso:** solo el rol con permiso de administración de cobranza (alineado con `cobranza/permissions.py`) puede cambiarlo. Los demás roles ven el estado, no el switch.

### Qué pasa al APAGAR

| Área | Comportamiento con el toggle apagado |
|---|---|
| Tarea diaria `evaluar_ciclos` | No procesa esa sede |
| Envíos | Ninguno. Los `EnvioCobranza` pendientes o en reintento se cancelan con motivo *"módulo apagado"* (queda en `EventoCiclo`) |
| Interfaz | Se oculta el ítem de menú, la bandeja, el dashboard y la columna de etapa/semáforo en Morosos. **Morosos vuelve exactamente a su vista actual** |
| Acceso directo por URL | Pantalla "Cobranza Inteligente está apagada" con el botón de encender solo para quien tenga permiso |
| Datos | **No se borra nada**: ciclos, eventos, convenios y notas se conservan |
| Portal de representantes | Sin cambios |
| Flujo de notificaciones anterior | Ver "Un solo flujo activo" más abajo |

### Qué pasa al ENCENDER

1. **Puesta al día silenciosa:** se crean los ciclos faltantes de las mensualidades impagas, se recalculan etapas y se cierran los ciclos de lo que se pagó mientras estuvo apagado. **No se envía nada.**
2. **Sin retroactivos:** cada regla se dispara solo si su día relativo coincide **exactamente con hoy**. Encender el módulo en el día +20 no envía los avisos de +3, +7 ni +15 que "quedaron atrasados".
3. Si `modo_sombra` está activo, todo lo anterior se registra sin enviar.
4. El modal de confirmación resume lo que va a pasar: sede, cantidad de ciclos abiertos y si enviará mensajes reales o solo simulará.

### Un solo flujo activo (nunca dos, nunca ninguno por accidente)

Mientras el flujo antiguo (señal `al_crear_mensualidad` + tarea `revisar-mensualidades-vencidas`) siga en el código, ambos flujos se condicionan al **mismo** toggle, de forma excluyente:

| Toggle | Flujo antiguo | Cobranza Inteligente |
|---|---|---|
| Apagado | **Activo** (como hoy) | Inactivo |
| Encendido | Inactivo | **Activo** (en sombra o con envíos reales) |

- Así se evitan los duplicados (dos flujos enviando) y también el silencio (ninguno enviando).
- **Tras retirar el flujo antiguo** (semanas 11–14), apagar el módulo significa **sin avisos automáticos**: la cobranza queda manual. El modal de apagado lo advierte de forma explícita y pide un **motivo** (texto libre, opcional).

### Auditoría

Cada cambio del toggle, de `modo_sombra` o de las etapas activas genera un registro inmutable: quién, cuándo, sede, valor anterior, valor nuevo y motivo. Es visible en la misma pantalla de configuración.

### Pruebas del toggle (automatizadas)

- Apagado: **0** envíos, **0** tareas de evaluación para la sede, **0** pantallas de Cobranza Inteligente accesibles.
- Encender no dispara reglas atrasadas.
- Nunca están activos el flujo antiguo y el nuevo a la vez para la misma sede.
- Apagar en medio de un reintento cancela el envío pendiente.
- Un rol sin permiso no puede cambiar el estado (ni por API).
- El corte global detiene los envíos aunque la sede esté encendida.
- Cada cambio queda auditado.

---

## Fase 0 — Definir el producto y conocer el punto de partida (semanas 1–2)

### Semana 1: reglas de negocio + diagnóstico

Con el colegio piloto, dejar por escrito:

- **Vencimiento y tolerancia:** de dónde sale la fecha (`dia_limite_pago` del alumno o del colegio) y si hay días de gracia antes de los recargos (`ReglaRecargoPago`).
- **Segmentos de mora:** preventiva, temprana, prioritaria y crítica, con sus rangos de días.
- **Unidad de contacto:** una sola comunicación consolidada por representante y por día, con todas sus deudas vigentes.
- **Límites de contacto:** horario permitido (por ejemplo, de lunes a sábado entre 8:00 y 19:00), un máximo de mensajes por semana por representante, sin envíos en feriados y con baja voluntaria por canal.
- **Pausas del ciclo:** reclamo, convenio, beca en trámite, `Pago` en `en_revision`, comprobante subido desde el portal, estudiante retirado.
- **Permisos:** quién ve, edita, pausa, reasigna y cierra (en línea con `cobranza/permissions.py`), y **quién puede encender y apagar Cobranza Inteligente**.
- **Comportamiento del toggle:** validar con el colegio lo definido en §3 (qué ocurre al apagar y al encender, y que no haya avisos retroactivos).
- **Pagos parciales:** se sigue el ciclo solo sobre el saldo (ya lo garantiza `Mensualidad.monto_pagado`).
- **Pagos no identificados:** quién los resuelve y en qué plazo.
- **Escalamiento al director:** qué datos recibe; los mensajes a terceros nunca exponen el detalle de la deuda.

**Diagnóstico técnico** (en paralelo):

- Confirmar los hallazgos de §1 con datos reales: contar los avisos duplicados del último mes en `NotificacionLog`.
- Decidir si las reglas se configuran por instancia o por `Sede` (el toggle ya está decidido: por sede).
- **Enviar a Meta las plantillas de WhatsApp** de cada etapa. Su aprobación es una dependencia externa de la Fase 2.

### Semana 2: línea base y prototipos

Medir en el colegio piloto, sobre los **últimos 3 meses**, con una fórmula fija para repetir después:

| Métrica | Fórmula |
|---|---|
| Cobrado al vencimiento | Monto pagado hasta la fecha de vencimiento ÷ monto facturado del mes |
| Mora a 7 / 15 / 30 días | Saldo impago a N días del vencimiento ÷ monto facturado |
| Pagos sin identificar | Cantidad y monto de pagos sin asignar al cierre del mes |
| Tiempo de resolución | Mediana de días entre la recepción y la identificación de un pago |
| Esfuerzo manual | Horas semanales del equipo de cobranza (encuesta + registro de 1 semana) |
| Avisos duplicados o erróneos | Desde `NotificacionLog` |

Prototipos (mobile-first, ver el *ESTÁNDAR DE DISEÑO RESPONSIVE*):

1. Dashboard del director.
2. Bandeja "Atención requerida hoy".
3. Expediente de cobranza del representante.
4. Pantalla de configuración de Cobranza Inteligente con el toggle, el modal de confirmación y la auditoría.

**Criterio de salida:** reglas firmadas por el colegio, plantillas en revisión en Meta, línea base guardada y prototipos aprobados.

---

## Fase 1 — Núcleo: toggle y un ciclo por cada deuda (semanas 3–4)

### Semana 3: toggle y modelo

**Primero el toggle** (ver §3): modelo `ConfiguracionCobranzaInteligente`, API de lectura/escritura con permisos, pantalla de Configuración con `Modal` de confirmación, auditoría y la pantalla "Cobranza Inteligente está apagada". Todo lo demás de esta fase y de las siguientes se entrega **detrás de este toggle**.

Luego, nueva app o submódulo `cobranza/ciclos/`, **sin modificar los modelos financieros existentes**.

**`CicloCobranza`** (uno por mensualidad, relación 1:1):

- Deuda de origen (FK a `Mensualidad`; preparado para extenderse a otros conceptos).
- `fecha_vencimiento` **guardada al crear el ciclo**.
- Estado, semáforo, días de mora (calculados).
- Saldo pendiente: **se lee de la `Mensualidad`**, no se copia (se evita una segunda fuente de verdad).
- Última acción, próxima acción y su fecha.
- Responsable asignado, motivo de pausa o excepción.

**`EventoCiclo`** (historial de solo inserción, nunca se edita ni se borra):
deuda creada, cambio de etapa, mensaje enviado/fallido/omitido (con su motivo), pago aplicado, pago en revisión, conciliación, pausa, reanudación, reasignación, cierre y **módulo apagado/encendido**.

**Estados:**

```text
PREVENTIVA → VENCIDA → SEGUIMIENTO → PRIORITARIA → CRÍTICA
     │           │           │              │            │
     └───────────┴─── PAUSADA (motivo) ─────┴────────────┘
                              │
                     CERRADA (pagada · conciliada · anulada · retirado · condonada)
```

- `PAUSADA` siempre guarda el estado anterior, para volver a él al reanudar. (No confundir con el módulo apagado: la pausa es de **un ciclo**; el toggle es de **toda la sede**.)
- `CERRADA` siempre lleva un motivo.

### Semana 4: cálculo diario, APIs y vista

- **Tarea diaria idempotente** (`evaluar_ciclos`): recalcula la etapa de cada ciclo abierto con `cobranza/mora.py`, **solo para sedes con el toggle encendido**. Correrla dos veces el mismo día produce el mismo resultado.
- **Cierre inmediato** con una señal sobre `Mensualidad`/`Pago`: un pago completo cierra el ciclo sin esperar a la tarea diaria.
- **Migración de datos / puesta al día:** al **encender** el toggle por primera vez se crean los ciclos de las mensualidades impagas existentes y se reconstruye el historial mínimo (ver §3). Con el toggle apagado la migración no crea ciclos ni toca nada.
- APIs: cartera por ciclo (filtros por etapa, sede, grado y responsable; paginada) y expediente del representante. Todas responden "módulo apagado" si el toggle de la sede está apagado.
- Frontend: columna o filtro de etapa y semáforo en Morosos; expediente en solo lectura; ambos visibles solo con el toggle encendido. Reutilizar `TablaScroll` y `Modal`.

**Criterio de salida (con pruebas automatizadas, fijando `hoy`):**

- Una mensualidad pagada por completo cierra su ciclo en el mismo momento.
- Una pagada en parte conserva el ciclo abierto con el saldo correcto.
- Una vencida cambia de etapa según sus días de mora.
- La cartera del ciclo coincide **al 100 %** con la lista actual de Morosos.
- Con el toggle apagado, Morosos es idéntico a hoy y no existe ninguna pantalla nueva accesible.

---

## Fase 2 — Automatizar la comunicación (semanas 5–6)

### Semana 5: motor de reglas

Reemplazar el cronograma fijo de `ConfiguracionNotificaciones` (`dias_recordatorio_1/2`, `dias_alerta_director`) por **`ReglaCobranza`**, configurable por instancia o por sede:

| Día | Acción | Canal sugerido |
|---:|---|---|
| −5 | Recordatorio preventivo | WhatsApp / email |
| −1 | Aviso de vencimiento cercano | WhatsApp |
| 0 | Aviso de vencimiento | Email + WhatsApp |
| +3 | Seguimiento cordial | WhatsApp |
| +7 | Segundo seguimiento | WhatsApp + email |
| +15 | Cobranza prioritaria → tarea en la bandeja | Interno + WhatsApp |
| +30 | Caso crítico → aviso al director | Interno |

Cada regla define: etapa, día relativo, canal, plantilla, saldo mínimo, destinatario (representante, responsable o director) y si está activa.

**Evaluación diaria (una sola vía, solo si el toggle está encendido):**

1. Por cada ciclo abierto, calcular qué regla le toca hoy (coincidencia exacta del día relativo; sin retroactivos).
2. **Agrupar por representante**: un mensaje con todas sus deudas que tengan regla activa ese día. Si dos deudas están en etapas distintas, manda la más avanzada.
3. Generar un `EnvioCobranza` con **clave única** `(representante, regla, fecha)`. Si ya existe, no se envía otra vez.

### Semana 6: envío, controles y modo sombra

- Reutilizar `notificaciones/services.py`, `PlantillaWhatsApp` y los proveedores Twilio/Meta ya configurados.
- **Variables del mensaje:** alumno o alumnos, concepto, período, saldo en USD, **referencia en Bs con la tasa BCV vigente al enviar**, enlace al portal y datos bancarios.
- **Comprobaciones justo antes de enviar** (no al agendar):
  - **El toggle de la sede sigue encendido y el corte global no está activo** (si se apagó mientras el envío esperaba, se cancela).
  - El ciclo sigue abierto y el saldo es mayor que el mínimo.
  - No hay `Pago` en `en_revision` ni un comprobante pendiente del portal.
  - Se está dentro del horario permitido y del límite semanal.
  - El representante no se dio de baja de ese canal.
  - La etapa de la regla está habilitada en `etapas_envio_activas`.
  - Cada omisión queda en `EventoCiclo` con su motivo.
- **Reintentos:** con espera creciente ante errores del proveedor; después del tercer fallo se registra como `fallido` y aparece en la bandeja. Nunca se reintenta fuera del horario permitido ni con el toggle apagado.
- **Retirar el flujo anterior:** condicionar la señal `al_crear_mensualidad` y la tarea `revisar-mensualidades-vencidas` al toggle, de forma excluyente (ver §3), sin borrar el código hasta cerrar el piloto.
- **Modo sombra (desde la semana 6):** con el toggle encendido y `modo_sombra` activo, el motor se ejecuta a diario en el colegio piloto, guarda lo que *habría* enviado y **no envía nada**. Todos los días se compara con los pagos reales.

**Criterio de salida:**

- Pruebas automatizadas: no se envía a deudas saldadas, ni a pagos en revisión, ni dos veces en el mismo día, ni fuera de horario, **ni con el toggle apagado**.
- Dos semanas de modo sombra **sin ningún falso positivo** (ningún mensaje simulado a una familia que estaba al día).

---

## Fase 3 — Atención humana y excepciones (semanas 7–8)

La bandeja, las pausas y el convenio solo existen con el toggle encendido. Al apagarlo se ocultan, pero **los convenios y las pausas vigentes se conservan** y se retoman al volver a encender.

### Semana 7: bandeja "Atención requerida hoy"

Prioridad con una **puntuación explicable**, que se muestra en cada fila:

- Días de mora (peso mayor desde +30).
- Cantidad de mensualidades pendientes.
- Saldo total del representante.
- Pago parcial, pago sin identificar o pago en revisión que lleva más de N días.
- Envío fallido o falta de respuesta después de +7.
- Cuota de convenio próxima a vencer o incumplida.

Acciones de cada caso (todas generan un `EventoCiclo`):

- Registrar llamada, WhatsApp manual (Modo A wa.me ya existente) o nota.
- Asignar o reasignar responsable.
- Pausar o reanudar con un motivo obligatorio.
- Marcar un reclamo (pausa automática).
- Ir directo a registrar el cobro o a conciliar.

### Semana 8: pagos en revisión y convenio mínimo

- **Cola de pagos no identificados y en revisión**, conectada con `cobranza/conciliacion.py` y los comprobantes del portal (`pagos_comunes/comprobantes.py`).
- **Convenio de pago (versión mínima):** cuotas con fecha y monto que pausan el ciclo de las deudas incluidas. Si una cuota se incumple, la deuda vuelve al ciclo en su etapa. *Quedan fuera:* refinanciamiento, intereses y firma digital.
- **Cierre o descarte auditable:** motivo obligatorio y permiso específico para condonar.

**Criterio de salida:** durante una semana, el equipo del piloto trabaja **solo desde la bandeja**, sin listas en Excel ni conversaciones fuera del sistema. Se valida con el equipo, no solo en desarrollo.

---

## Fase 4 — Dashboard y piloto real (semanas 9–10, piloto extendido 11–14)

### Semana 9: dashboard del director

- Cartera del mes, cobrado y pendiente.
- Efectividad: cobrado ÷ facturado, al vencimiento y a 30 días.
- Distribución por etapa (preventiva → crítica), con su tendencia.
- Casos abiertos en la bandeja y su antigüedad.
- Pagos por conciliar.
- **Recuperado tras una gestión de Cobranza Inteligente** (ver la regla de atribución abajo).
- Comparación contra el mismo período de la línea base.
- Estado del módulo (encendido/apagado, modo sombra) y fecha del último cambio.

**Regla de atribución:** un pago se atribuye a Cobranza Inteligente si llega **dentro de los 7 días siguientes** a un mensaje o una gestión registrada sobre esa deuda. Se informa junto al total, nunca como una cifra suelta, y se explica en el propio dashboard. Los períodos con el módulo apagado se marcan en las series para no distorsionar la comparación.

### Semana 10: envíos reales escalonados

El escalonamiento se controla con el toggle y `etapas_envio_activas` (§3):

1. **Encender solo la etapa preventiva** (−5, −1, 0), al inicio de un ciclo mensual, desactivando `modo_sombra`.
2. Revisión diaria: envíos, omisiones, fallos, respuestas y pagos conciliados.
3. Tras **5 días hábiles sin incidentes**, habilitar la etapa temprana (+3, +7).
4. La etapa prioritaria y la crítica (+15, +30) solo después de una semana estable de la temprana.
5. Responsable de guardia y procedimiento escrito: **si algo sale mal, se apaga el toggle** (efecto inmediato, sin despliegue) y se revisa con calma.

### Semanas 11–14: piloto extendido

- Cerrar un ciclo mensual completo y comparar contra la línea base con las mismas fórmulas.
- Retirar el flujo antiguo de notificaciones para la sede piloto (borrar el código). A partir de aquí, apagar el módulo = cobranza manual (§3).
- Documentar la configuración reutilizable y la guía de puesta en marcha para nuevos colegios, incluyendo cuándo conviene encender o apagar el módulo.

**Criterio de salida:** ciclo completo **sin mensajes erróneos a familias al día**, sin duplicados, y con mejora medible en el recaudo **o** en las horas de trabajo manual.

---

## Indicadores de éxito

| Indicador | Meta del piloto (a confirmar con la línea base) |
|---|---|
| Mensajes de cobro después de un pago confirmado | **0** (bloqueante) |
| Mensajes duplicados | **0** (bloqueante) |
| Mensajes enviados con el toggle apagado | **0** (bloqueante) |
| Cobrado al vencimiento | +10 pp sobre la línea base |
| Mora a 15 y 30 días | −20 % relativo |
| Pagos conciliados sin intervención manual | Medir; meta para la siguiente iteración |
| Mediana de días para resolver un pago sin identificar | −50 % |
| Horas semanales del equipo de cobranza | −30 % |
| Bajas voluntarias de WhatsApp | < 2 % de los representantes contactados |

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Mensaje de cobro a una familia que ya pagó | Comprobación justo antes de enviar, pausa por pago en revisión, modo sombra y toggle de apagado |
| Duplicados por reintentos o reentregas de Celery | Clave única por `(representante, regla, fecha)`; sin tareas agendadas a futuro |
| Dos flujos enviando a la vez (antiguo y nuevo) o ninguno | Ambos condicionados al mismo toggle, de forma excluyente (§3) y con prueba automatizada |
| Encender el módulo dispara una avalancha de avisos atrasados | Puesta al día silenciosa y reglas por coincidencia exacta del día; sin retroactivos |
| Alguien apaga el módulo por error y se deja de cobrar sin notar | Solo rol autorizado, modal de confirmación con advertencia, auditoría y estado visible en el dashboard |
| Un envío en cola sale después de apagar | Verificación del toggle justo antes de enviar y cancelación de pendientes al apagar |
| Meta rechaza o demora las plantillas | Tramitarlas en la semana 1; usar email + Modo A (wa.me) mientras tanto |
| Saturar a las familias | Un mensaje consolidado por día, límite semanal y horario permitido |
| Monto en Bs desactualizado | Calcularlo al enviar con la tasa vigente; mostrar siempre el USD como referencia principal |
| La regla del ciclo diverge de la de Morosos | El ciclo reutiliza `cobranza/mora.py`; prueba de coincidencia del 100 % |
| El proyecto crece hasta volverse un CRM | Solo mensualidades, convenio mínimo; todo lo demás va a `NOTAS_TECNICAS.md` como mejora futura |
| El piloto no coincide con el ciclo de facturación | Hito de calendario de §2; si no coincide, se sigue en modo sombra |

---

## Prácticas transversales

- **Pruebas:** cada regla se prueba fijando `hoy` (`mora.py` ya acepta `hoy=`). Hay casos para pagos parciales, pagos en revisión, retiros, becas, representantes con varios hijos y **el módulo encendido/apagado**.
- **Despliegue:** cada fase detrás del toggle por sede (apagado por defecto); migraciones reversibles; nada se borra del flujo antiguo hasta cerrar el piloto.
- **Frontend:** todas las pantallas nuevas cumplen el *ESTÁNDAR DE DISEÑO RESPONSIVE* y usan `Modal` y `TablaScroll`; las fechas se muestran con date-fns en español. El switch del toggle y sus botones de confirmar deben ser visibles y clicables en 360×640, 768×1024, 1366×768 y 1920×1080.
- **Commits:** pequeños y en español, uno por paso lógico.
- **Deuda técnica:** se anota en `NOTAS_TECNICAS.md` y no se corrige fuera del alcance.

## Fuera del alcance de esta versión

Inscripción, solvencias, materiales y cargos especiales · refinanciamiento con intereses · pagos en línea nuevos · puntuación predictiva de riesgo de mora · respuestas automáticas por WhatsApp (chatbot) · corte automático del módulo por tasa de fallos (hoy el apagado es manual).
