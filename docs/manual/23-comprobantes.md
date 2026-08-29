# 23 · Consulta de Comprobantes

## Para qué sirve

Busca cualquier pago ya registrado y vuelve a imprimir su recibo. Es la pantalla
para cuando una familia pide una copia del comprobante, o cuando necesitas
verificar si una referencia bancaria ya fue cargada.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador**, **Cobranza** y **Cajero**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Comprobantes"**.

---

## 1. Qué muestra la pantalla

El título **"Consulta de Comprobantes"** con la descripción **"Busca y descarga
comprobantes de pago"**.

Arriba, el panel de filtros. Cuando tienes filtros aplicados aparece un contador
y el botón **"Limpiar filtros"**.

Debajo, la tabla de resultados con las columnas **"Nº Recibo"**, **"Fecha"**,
**"Alumno"**, **"Grado"**, **"Concepto"**, **"Método de Pago"**, **"Total"** y
**"Estatus"**.

Si no hay resultados, verás **"No se encontraron comprobantes"** e **"Intenta con
otros criterios de búsqueda"**.

[CAPTURA: pantalla "Consulta de Comprobantes" con el panel de filtros abierto y la tabla de resultados]

---

## 2. Paso a paso

### Buscar un comprobante

1. Llena los filtros que necesites:
   - **"Nº Recibo"** (*"Ej: 202605270001"*)
   - **"Nombre del Alumno"** (*"Nombre o apellido..."*)
   - **"Cédula Escolar"** (*"V-00000000"*)
   - **"Fecha Desde"** y **"Fecha Hasta"**
   - **"Método de Pago"**, **"Concepto"** y **"Estatus"**
2. Haz clic en **"Buscar"**. Mientras trabaja dirá **"Buscando..."**.
3. Revisa los resultados.

Para empezar de nuevo, usa **"Limpiar filtros"**.

### Reimprimir un recibo

En la fila del pago tienes dos opciones:

- **"Imprimir recibo completo A4"** — la versión formal, en hoja tamaño carta.
- **"Imprimir comprobante compacto"** — la versión corta, tipo ticket.

### Ver el desglose de un pago

La columna **"Concepto"** muestra qué se cubrió con ese pago. Si el pago fue
mixto, se despliega el detalle de cada concepto.

---

## 3. Campos del formulario

Esta pantalla no guarda información: solo filtra.

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nº Recibo | No | Número de factura, ej. `202605270001` | Identificador del pago |
| Nombre del Alumno | No | Texto | Nombre o apellido del estudiante |
| Cédula Escolar | No | `V-00000000` | Documento del alumno |
| Fecha Desde | No | `dd/MM/yyyy` | Inicio del rango |
| Fecha Hasta | No | `dd/MM/yyyy` | Fin del rango. No puede ser anterior a la de inicio |
| Método de Pago | No | Transferencia / Pago Móvil / Punto de Venta / Zelle / Efectivo Divisas / Efectivo Bolívares | Cómo se pagó |
| Concepto | No | Mensualidad / Inscripción / Solvencia / Materiales / Proyecto de Inversión / Multa / Mixto / Otro | Qué se pagó |
| Estatus | No | Completado / Anulado / En Revisión | Situación del pago |

### Qué significa cada estatus

| Estatus | Qué significa |
|---------|---------------|
| **Completado** | El pago es válido y está aplicado |
| **Anulado** | El pago fue anulado; no cuenta y las cuotas volvieron a quedar pendientes |
| **En Revisión** | Está pendiente de verificación |

---

## 4. Qué pasa después

Se imprime o descarga el recibo. Nada cambia en el sistema: esta pantalla no
cobra, no anula y no modifica el pago.

Para anular o corregir un pago, ve a
[Reportes → Corrección de Pagos](04-reportes.md).

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "No se encontraron comprobantes" | Ningún pago coincide con los filtros. | Quita filtros o amplía el rango de fechas. |
| "La fecha de inicio no puede ser mayor a la fecha final." | Invertiste el rango. | Corrige las fechas. |
| "Este comprobante está anulado." | El pago fue anulado. | No lo entregues como comprobante válido. |
| "Error al cargar comprobantes. Intenta de nuevo." | Falló la consulta. | Recarga la página. |
| "Comprobante no encontrado." | Ese pago ya no existe. | Verifica el número de recibo. |
| "No se pudo generar el recibo PDF." | El archivo no se pudo armar. | Reintenta; si sigue, avisa a Sistemas. |
| "Pago no encontrado." | El número de recibo no corresponde a ningún pago. | Revisa el número. |

---

## 6. Advertencias

Esta pantalla no realiza ninguna acción irreversible.

⚠️ **Nunca entregues como válido un recibo con estatus "Anulado".** El sistema lo
advierte al abrirlo.

⚠️ El recibo contiene datos de la familia y montos. Entrégalo solo al
representante o a quien él autorice.
