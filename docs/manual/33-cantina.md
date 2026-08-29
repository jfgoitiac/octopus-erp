# 33 · Cantina

## Para qué sirve

Es el punto de venta de la cantina del colegio. Los alumnos pagan con una tarjeta
prepago recargable, y desde aquí se cobra, se lleva el inventario, se administran
las tarjetas, se cierra la caja del turno y se revisan los reportes.

## Quién puede usarlo

**Cajero**, **Administrador** y **Director**. El cajero maneja la cantina de
punta a punta: todas las pantallas del módulo.

## Cómo llegar

Entra por `/login`. El rol **Cajero** llega directo a la cantina. Los demás
escriben la dirección `/cantina`.

---

## 1. Las secciones de la cantina

| Sección | Para qué es |
|---------|-------------|
| **"Inventario"** | Productos, precios, existencias y movimientos |
| **"POS"** | Cobrar una venta |
| **"Tarjetas"** | Asignar tarjetas y aprobar recargas |
| **"Cierre de caja"** | Cerrar el turno y declarar el efectivo |
| **"Reportes"** | Ventas del día, productos más vendidos |
| **"Morosos"** | Tarjetas con saldo negativo |

[CAPTURA: pantalla del POS de la cantina con la cuadrícula de productos, el carrito y el total]

---

## 2. Abrir la caja

**Antes de la primera venta del turno tienes que abrir tu caja.** Si no lo haces,
el POS no te deja cobrar.

1. Entra a **"POS"**. Aparece la ventana de apertura, que no se puede saltar.
2. Escribe el monto inicial de efectivo con el que arrancas.
3. Confirma.

Verás **"Caja abierta correctamente."**.

La apertura es **por cajero**: cada persona abre la suya.

---

## 3. Cobrar una venta (POS)

1. Identifica al alumno en **"Tarjeta / Alumno"**: escanea el QR de la tarjeta o
   escribe el código o serial y presiona Enter (*"Escanea el QR de la tarjeta o
   escribe el código/serial y presiona Enter"*, *"CANT-7K9M2XQPRT o
   L003-0007"*).
2. Verás su foto (o **"SIN FOTO"**) y su **"Saldo actual"**.
3. Agrega los productos:
   - Escanea el código de barras (*"Escanea el código de barras del producto y
     presiona Enter"*), o
   - búscalo por nombre (*"Buscar producto manualmente por nombre..."*), o
   - tócalo en la cuadrícula.
4. Los productos se acumulan en el **"Carrito"**, con el **"Total"** y su
   **"Equivalente"** en la otra moneda.
5. Elige el **"Método de pago"**:
   - **Tarjeta Prepago** — descuenta del saldo. Verás el **"Saldo tarjeta
     después"**.
   - **Efectivo Divisas (USD)**
   - **Efectivo Bolívares (VES)**
6. Cobra.

Verás **"Venta #482 cobrada correctamente."** y el ticket se genera solo.

Si un producto no tiene existencias, aparece **"Sin stock"** y el sistema avisa
**"Stock insuficiente de …"**.

---

## 4. Inventario

### Crear un producto

1. Entra a **"Inventario"**.
2. Completa:
   - **"Nombre"** (*"Ej. Jugo natural"*)
   - **"Categoría"** (*"Selecciona una categoría"*). Puedes crear una nueva con
     *"Nueva categoría..."*; verás **"Categoría creada."**.
   - **"Precio (USD)"**
   - **"Stock mínimo"**
   - **"Código de barras (opcional)"** (*"EAN-13"*)
3. Guarda. Verás **"Producto creado correctamente."**.

### Registrar un movimiento de existencias

1. Abre el producto y elige el **"Tipo de movimiento"**:
   - **Entrada** — compra a proveedor
   - **Salida** — venta
   - **Ajuste** — merma o conteo físico
2. Escribe la **"Cantidad"** (*"Ej. 3"*).
3. Escribe el **"Motivo (opcional)"** (*"Ej. Compra a proveedor, merma, conteo
   físico..."*).
4. Guarda. Verás **"Movimiento de inventario registrado."**.

Si no hay productos, dirá **"Sin productos registrados"** o **"No hay productos
activos cargados en inventario."**.

---

## 5. Tarjetas

### Asignar una tarjeta a un alumno

1. Entra a **"Tarjetas"**.
2. Busca la tarjeta por su código o serial.
3. Elige al alumno (*"V-12345678"* o *"ID de alumno"*).
4. Confirma. Verás **"Tarjeta asignada correctamente."**.

Si no hay ninguna cargada, dirá **"Sin tarjetas registradas"**.

### Aprobar o rechazar una recarga del portal

En **"Recargas pendientes de revisión"** — *"Solicitadas desde el portal del
representante."* — verás la **"Fecha"**, el **"Alumno"**, el **"Monto"**, la
**"Moneda"**, el **"Método de pago"**, el **"Banco receptor"**, el **"Banco de
procedencia"** y la **"Referencia"**.

1. Revisa el comprobante que subió la familia.
2. Aprueba: verás **"Recarga aprobada. Saldo acreditado."**.
3. O rechaza, escribiendo el **"Motivo"**: verás **"Recarga rechazada."**.

Si no hay ninguna, dirá **"No hay recargas pendientes por revisar."**.

### Recargar en efectivo desde la cantina

Se hace desde esta misma pantalla, indicando la **"Moneda"**, el **"Monto"**
(*"5.00"*), el **"Banco receptor"** (*"Seleccionar banco…"*), el **"Banco de
procedencia"** (*"Banco del representante"*), la referencia y el comprobante.

### Parámetros de crédito

Aquí se define cuánto puede quedar a deber una tarjeta (*"Ej. 50"*) y en qué días
(*"1,3,7"*). Al guardar verás **"Parámetros de crédito actualizados."**.

[CAPTURA: pantalla "Tarjetas" con el listado de tarjetas y el bloque de recargas pendientes de revisión]

---

## 6. Cierre de caja

Al terminar el turno:

1. Entra a **"Cierre de caja"**.
2. Revisa el resumen del día: **"Total USD"**, **"Total VES"**, **"Ventas"** y
   **"Ventas por día"**.
3. Escribe el **"Conteo físico"**: el efectivo que realmente tienes en la caja.
4. El sistema calcula la **"Diferencia"** contra lo que registró.
5. Escribe las **"Observaciones"** (*"Notas sobre el cierre, faltantes,
   sobrantes, etc."*).
6. Haz clic en **"Registrar cierre"**.

Verás **"Caja cerrada correctamente."** y la pantalla mostrará **"Caja
cerrada"** con su **"Fecha de cierre"**.

---

## 7. Reportes y morosos

**"Reportes"** muestra el **"Historial de ventas"**, los **"Productos más
vendidos"** y el **"Total USD"**. Puedes buscar *"Buscar por N° de venta o
alumno"* y exportar a Excel: verás **"Archivo Excel descargado."**.

**"Morosos"** lista las tarjetas con saldo negativo. Si no hay, dirá **"No hay
tarjetas con saldo negativo en este filtro"**.

---

## 8. Campos del formulario

### Apertura de caja

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Monto inicial | Sí | Número mayor o igual a cero | Efectivo con el que arrancas el turno |

### Producto

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre | Sí | Texto, ej. `Jugo natural` | Cómo aparece en el POS |
| Categoría | Sí | Elegida de la lista | Agrupa los productos |
| Precio (USD) | Sí | Número mayor o igual a cero | Precio de venta |
| Stock mínimo | Sí | Entero mayor o igual a cero | Cuándo avisar de reposición |
| Código de barras | No | EAN-13 | Para escanear en el POS |

### Movimiento de inventario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Tipo de movimiento | Sí | Entrada / Salida / Ajuste | Qué clase de movimiento es |
| Cantidad | Sí | Entero mayor a cero | Cuántas unidades |
| Motivo | No | Texto | Por qué se hace el movimiento |

### Venta

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Tarjeta / Alumno | Sí con tarjeta prepago | Código o serial, ej. `CANT-7K9M2XQPRT` | A quién se le cobra |
| Productos | Sí, al menos uno | Escaneados o elegidos | Qué se vende |
| Método de pago | Sí | Tarjeta Prepago / Efectivo Divisas (USD) / Efectivo Bolívares (VES) | Cómo paga |

### Recarga de tarjeta

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Moneda | Sí | USD / VES | En qué moneda entró el dinero |
| Monto | Sí | Número mayor a cero | Cuánto se recarga |
| Banco receptor | Sí | Elegido de la lista | Banco del colegio |
| Banco de procedencia | No | Texto | Banco del representante |
| Referencia | Sí | Texto | Número de la transacción |
| Comprobante | Sí | Imagen o PDF, máximo 10 MB | Respaldo del pago |

### Cierre de caja

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Conteo físico | Sí | Número | Efectivo real contado en la caja |
| Observaciones | No | Texto | Faltantes, sobrantes o notas del turno |

---

## 9. Qué pasa después

**Al cobrar una venta:**

- Si fue con tarjeta prepago, el saldo del alumno baja de inmediato.
- El stock de cada producto vendido se descuenta.
- Se genera el ticket.
- El consumo aparece en el Portal de Familias, en la sección **"Cantina"**.

**Al aprobar una recarga:** el saldo de la tarjeta sube al instante y el
representante lo ve en su portal.

**Al cerrar la caja:** queda registrado el cierre con lo que el sistema calculó,
lo que declaraste y la diferencia. No se puede cerrar dos veces el mismo turno.

**Al registrar un movimiento de inventario:** las existencias se actualizan de
inmediato y quedan con su motivo.

---

## 10. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Debes abrir tu caja (declarar el monto inicial) antes de registrar una venta." | No abriste caja este turno. | Abre la caja en el POS. |
| "Ya tienes una apertura de caja abierta — no puedes abrir dos veces." | Ya la abriste. | Sigue vendiendo; ciérrala al final del turno. |
| "No tienes ninguna apertura de caja abierta — no hay nada que cerrar." | Nunca abriste caja. | Ábrela antes de vender. |
| "Esta apertura de caja ya fue cerrada — no se puede cerrar dos veces." | Ya cerraste este turno. | Abre una caja nueva para el siguiente. |
| "Ingresa el monto inicial de caja (0 o mayor)." | Falta el monto. | Escríbelo, aunque sea 0. |
| "El monto inicial no puede ser negativo." | Escribiste un número negativo. | Usa 0 o más. |
| "Ingresa el conteo físico de caja." | Falta el conteo al cerrar. | Cuenta el efectivo y escríbelo. |
| "No se encontró ninguna tarjeta activa con ese código/serial" | La tarjeta no existe, o está bloqueada o extraviada. | Verifica el código o revisa su estado en "Tarjetas". |
| "No se encontró ningún producto con el código …" | Ese código de barras no está cargado. | Búscalo por nombre o cárgalo en Inventario. |
| "Stock insuficiente de …" | No hay existencias suficientes. | Ajusta la cantidad o registra la entrada. |
| "El carrito no puede estar vacío." | Intentaste cobrar sin productos. | Agrega al menos uno. |
| "La cantidad de cada línea debe ser mayor a cero." | Alguna línea quedó en cero. | Corrígela. |
| "El pago con tarjeta prepago requiere …" | Falta identificar la tarjeta. | Escanéala o escribe el código. |
| "Este alumno no tiene una tarjeta de cantina asignada todavía." | Nunca se le entregó tarjeta. | Asígnale una en "Tarjetas". |
| "Esta tarjeta todavía no fue entregada a ningún alumno — no hay nada que reponer." | La tarjeta está sin asignar. | Asígnala primero. |
| "El nombre del producto es obligatorio." | Falta el nombre. | Escríbelo. |
| "El precio debe ser un número mayor o igual a 0." | El precio no es válido. | Corrígelo. |
| "El stock inicial debe ser un entero mayor o igual a 0." | La existencia inicial no es válida. | Usa un número entero. |
| "El stock mínimo no puede ser negativo." | El mínimo es negativo. | Usa 0 o más. |
| "Selecciona una categoría." | Falta la categoría. | Elígela o crea una nueva. |
| "La cantidad debe ser un entero mayor a 0." | La cantidad del movimiento no es válida. | Corrígela. |
| "El límite de crédito por defecto no puede ser negativo." | El parámetro de crédito es negativo. | Usa 0 o más. |
| "Ingresa un número de días válido (0 o mayor)." | Los días de crédito no son válidos. | Corrígelos. |
| "Error al cargar los productos del POS." | Falló la consulta. | Recarga la página. |
| "No se pudo verificar tu apertura de caja." | No se pudo consultar el estado de la caja. | Recarga y vuelve a intentar. |
| "No se pudo generar el ticket PDF." | El ticket no se pudo armar. | La venta sí quedó registrada; reimprime desde "Reportes". |

---

## 11. Advertencias

⚠️ **Una venta cobrada descuenta el saldo y el stock de inmediato.** Corregir un
error obliga a un ajuste manual.

⚠️ **El cierre de caja no se puede repetir.** Cuenta bien el efectivo antes de
registrarlo: la diferencia queda asentada con tu nombre.

⚠️ **Aprobar una recarga acredita dinero real en la tarjeta.** Verifica el
comprobante y la referencia antes de aprobar.

⚠️ **Una referencia bancaria no se puede reutilizar.** El sistema rechaza la que
ya se usó en otra recarga, en un comprobante del portal o en un pago del colegio.

⚠️ **Eliminar un producto lo quita del POS.** Si solo se acabó, registra una
salida de inventario en vez de borrarlo.
