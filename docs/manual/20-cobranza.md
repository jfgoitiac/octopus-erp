# 20 · Cobranza (caja)

## Para qué sirve

Es la caja del colegio. Aquí se registra cada pago que hace una familia:
mensualidades, inscripción, solvencia, materiales, multas o el Proyecto de
Inversión. Al terminar, el sistema imprime el recibo y marca las deudas como
pagadas.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador**, **Cobranza** y **Cajero**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Cobranza"**.

---

## 1. Cómo funciona

La pantalla tiene dos pasos, señalados arriba:

1. **"Buscar y seleccionar deuda"**
2. **"Registrar pago"**

[CAPTURA: pantalla de Cobranza en el paso 1, con el buscador de cédula y la lista de deudas del representante]

---

## 2. Paso 1 — Buscar y seleccionar la deuda

1. Escribe la cédula en **"Cédula del representante"** (*"Ej: 12345678"*) y
   presiona Enter.
2. Si existe, aparecen sus alumnos con sus deudas pendientes. Si no, verás
   **"Representante no encontrado."**.
3. Marca las cuotas que la familia va a pagar. Puedes mezclar conceptos de varios
   hijos en un mismo pago.
4. Verás el **"Total seleccionado"**, el **"Total USD"** y el **"Total Bs."**,
   calculado con la tasa BCV del momento.
5. Si necesitas refrescar la tasa, usa **"Actualizar tasa BCV"**.
6. Haz clic en **"Ir a registrar pago"**.

Para volver atrás, usa **"Volver a buscar alumno"**.

### Etiquetas que verás sobre las cuotas

| Etiqueta | Qué significa |
|----------|---------------|
| **"ADELANTO"** | Mensualidad futura que se paga por anticipado |
| **"PARCIAL"** | Pago que no cubre el total de la cuota |
| **"ABONADO"** | La cuota ya tiene un abono previo |

### Adelantos y pagos parciales

- **"Mensualidades futuras"** te deja adelantar meses que aún no vencen.
- **"Pago parcial"** te deja abonar una parte con **"Monto a abonar (USD):"**.

En ambos casos el método de pago debe ser **Efectivo USD** o **Zelle**. La
pantalla lo advierte: *"Los adelantos solo se pagan en USD"* y *"Cambia el método
de pago a Efectivo USD o Zelle"*. Cuando el método es correcto verás
*"Método válido: Efectivo USD o Zelle ✓"*.

---

## 3. Paso 2 — Registrar el pago

1. Elige el **"Método de pago"**:
   - **"Transferencia Bancaria"**
   - **"Pago Móvil"**
   - **"Punto de Venta"**
   - **"Zelle"**
   - **"Efectivo USD"**
   - **"Efectivo Bs."**
2. Elige el **"Banco receptor"** (*"Seleccionar banco…"*): el banco del colegio
   donde entró el dinero.
3. Escribe el **"Número de referencia"**.
   - Con **Punto de Venta** hacen falta la referencia y el **"Número de lote"**,
     ambos de **4 dígitos** (*"Ej: 0042"*). La pantalla lo recuerda:
     *"Ingresa los 4 dígitos de referencia"*.
4. Revisa el resumen: conceptos cubiertos, **"Total USD"** y **"Total Bs."**.
5. Haz clic en **"Registrar Pago"**.

Verás **"¡Pago registrado correctamente!"** y se abre el recibo para imprimir.

[CAPTURA: paso "Registrar pago" con el método de pago, el banco receptor, la referencia y el resumen del total]

---

## 4. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula del representante | Sí | Números, con o sin la letra (`12345678`) | Con quién se hace la operación |
| Alumnos y cuotas | Sí, al menos una | Casillas de selección | Qué se está pagando |
| Monto a abonar (USD) | Sí, en pago parcial | Número mayor a cero | Cuánto abona de esa cuota |
| Método de pago | Sí | Uno de los seis métodos | Cómo pagó la familia |
| Banco receptor | Sí, en todos los métodos | Elegido de la lista | Banco del colegio que recibió el dinero |
| Número de referencia | Sí | Texto; 4 dígitos en Punto de Venta | Número que da el banco |
| Número de lote | Sí en Punto de Venta | Exactamente 4 dígitos | Lote del punto de venta |

### Conceptos que se pueden cobrar

**"Mensualidad"** · **"Inscripción"** · **"Solvencia"** · **"Materiales"** ·
**"Proyecto de Inversión"** · **"Multa"** · **"Otro"**

---

## 5. Qué pasa después

Al registrar el pago, el sistema:

1. **Crea el pago** con su número de factura, la tasa BCV aplicada y el monto en
   dólares y en bolívares.
2. **Marca como pagadas** las mensualidades y cuotas seleccionadas. Los pagos
   parciales suman al abono acumulado.
3. **Imprime el recibo** con los conceptos cobrados y los logos del colegio.
4. **Deja de contar al alumno como moroso** si con eso quedó al día. Los avisos
   automáticos de cobranza de esas cuotas dejan de dispararse.
5. **Emite la constancia de solvencia** del representante, de forma automática,
   cuando el pago completa el Proyecto de Inversión y la familia no tiene ninguna
   otra deuda.
6. **Registra la operación en Auditoría**, con tu nombre.

Si el colegio tiene las notificaciones activas, sale un correo de pago confirmado
al representante.

---

## 6. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Representante no encontrado." | Esa cédula no existe en el sistema. | Verifica el número o regístralo en "Representantes". |
| "Selecciona al menos un alumno." | No marcaste ninguna deuda. | Marca las cuotas a cobrar. |
| "Selecciona el banco receptor para todos los métodos de pago." | Falta el banco. | Elígelo de la lista. |
| "Punto de Venta requiere referencia y número de lote de 4 dígitos." | Faltan datos o no tienen 4 dígitos. | Usa exactamente 4, por ejemplo `0042`. |
| "Los adelantos y pagos parciales requieren Efectivo USD o Zelle como método de pago." | El método no admite adelanto ni abono. | Cambia a Efectivo USD o Zelle. |
| "Monto insuficiente. Se requieren al menos Bs. 1.250,00." | Lo que se paga en bolívares no cubre la deuda. | Ajusta el monto o el método. |
| "No se ha registrado ninguna tasa de cambio." | El sistema no tiene tasa BCV. | Sincronízala con el botón de la barra superior. |
| "No se pudo determinar la tasa de cambio aplicada." | La tasa no se pudo calcular. | Actualiza la tasa y reintenta. |
| "Tasa no disponible temporalmente. Intente en unos minutos." | El servicio de la tasa no responde. | Espera y vuelve a intentar. |
| "Error al cargar bancos. Recarga la página." | No se pudo leer la lista de bancos. | Recarga la pantalla. |
| "Debe ingresar el número de referencia o confirmación de la transacción." | Falta la referencia. | Escríbela. |
| "Banco receptor no encontrado." | El banco elegido ya no existe. | Elige otro; avisa a Sistemas. |
| "No se procesó ningún pago. Verifique los montos." | Los montos quedaron en cero. | Revisa lo que seleccionaste. |
| "El monto debe ser mayor a cero." | El abono es cero o negativo. | Escribe un monto válido. |
| "No tiene acceso a uno o más de los alumnos de esta operación." | Alguno pertenece a otra sede. | Cambia de sede en el selector. |
| "Error al buscar. Verifica tu conexión." | Falló la búsqueda. | Revisa la red y reintenta. |

---

## 7. Advertencias

⚠️ **Un pago registrado no se borra.** Si te equivocaste, hay que anularlo desde
[Reportes → Corrección de Pagos](04-reportes.md), dejando el motivo por escrito.

⚠️ **El pago se guarda con la tasa BCV del momento.** Si la tasa está
desactualizada, el monto en bolívares quedará mal. Actualízala antes de cobrar.

⚠️ **Revisa la cédula antes de cobrar.** Un pago cargado al representante
equivocado obliga a anularlo y volver a registrarlo.

⚠️ **La referencia no se puede repetir.** El sistema rechaza una referencia ya
usada en otro pago, en un comprobante del portal o en una recarga de cantina.

⚠️ **Un pago dentro de un cierre de caja ya validado por el Director no se puede
anular.** Verifica bien antes de cerrar la caja del día.
