# 06 · Auditoría

## Para qué sirve

Es la bitácora del sistema. Guarda quién hizo qué, cuándo y desde qué
computadora: pagos, anulaciones, cambios de rol, accesos, eliminaciones. Sirve
para aclarar diferencias y para revisar la actividad del personal.

## Quién puede usarlo

Solo el **Director**.

## Cómo llegar

Menú lateral → **Sistema** → **"Auditoría"**.

---

## 1. Qué muestra la pantalla

El título es **"Auditoría"** y la descripción **"Control de ingresos y actividad
del sistema."**.

Arriba hay cuatro tarjetas con el resumen del rango de fechas elegido:

| Tarjeta | Qué muestra |
|---------|-------------|
| **"Ingreso USD"** | Total cobrado en dólares |
| **"Efectivo USD"** | Cuánto de eso entró en efectivo |
| **"Total VES"** | Total cobrado en bolívares |
| **"Pagos"** | Cantidad de operaciones registradas |

Debajo está la tabla **"Historial de Operaciones"**, con una fila por cada acción
realizada en el sistema.

[CAPTURA: pantalla de "Auditoría" con las cuatro tarjetas de resumen y la tabla "Historial de Operaciones"]

---

## 2. Paso a paso

### Filtrar por fechas

1. Elige la fecha inicial en **"Desde"**.
2. Elige la fecha final en **"Hasta"**.
3. Las tarjetas y la tabla se actualizan solas.

### Buscar una operación

1. Escribe en el campo **"Buscar..."**. Puedes buscar por usuario o por el texto
   de la acción.
2. La tabla se filtra mientras escribes.

### Filtrar por módulo

1. Abre el selector que dice **"Todos los módulos"**.
2. Elige uno: **"Cobranza"**, **"Secretaría"**, **"Seguridad"** o
   **"Finanzas"**.

### Moverte entre páginas

Usa los botones **"Página anterior"** y **"Página siguiente"** al final de la
tabla.

---

## 3. Campos del formulario

Esta pantalla no guarda datos. Solo tiene filtros:

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Desde | No | `dd/MM/yyyy` | Fecha inicial del rango |
| Hasta | No | `dd/MM/yyyy` | Fecha final del rango; no puede ser anterior a "Desde" |
| Buscar | No | Texto libre | Filtra por usuario o por la acción |
| Módulo | No | Elegido de la lista | Limita a Cobranza, Secretaría, Seguridad o Finanzas |

### Qué guarda cada registro

| Dato | Qué significa |
|------|---------------|
| Usuario | Quién hizo la acción |
| Acción | Qué hizo, en texto |
| Módulo | En qué parte del sistema |
| Fecha y hora | Cuándo |
| Dirección IP | Desde qué computadora o red |
| Detalles | Información adicional de la operación. Si no la hay, dice **"Sin detalles"** |

---

## 4. Qué pasa después

Nada. La auditoría solo lee. No se puede editar ni borrar un registro desde la
pantalla: ese es justamente el punto de tenerla.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "La fecha final no puede ser anterior a la fecha de inicio." | Invertiste el rango. | Corrige las fechas. |
| "Sin detalles" | Esa operación no guardó información extra. | Es normal en acciones simples como iniciar sesión. |
| La tabla sale vacía | No hubo actividad en ese rango o con ese filtro. | Amplía las fechas o pon "Todos los módulos". |

---

## 6. Advertencias

⚠️ **La auditoría contiene información sensible** (montos, cédulas, direcciones
IP). Por eso solo la ve el Director. No compartas capturas de esta pantalla.

⚠️ **Los registros no se pueden borrar ni corregir.** Si detectas una operación
indebida, la acción correcta es corregir el dato de origen (por ejemplo, anular
el pago), no intentar limpiar la bitácora.
