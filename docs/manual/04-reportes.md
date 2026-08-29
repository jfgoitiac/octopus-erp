# 04 · Reportes

## Para qué sirve

Es el centro de informes del colegio. Desde aquí sacas el cierre de caja del día,
cruzas los pagos con el banco, clasificas los depósitos que llegaron sin
identificar, corriges o anulas un pago mal cargado y revisas cómo va la
recaudación mes a mes.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Cobranza**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Reportes"**.

---

## 1. Cómo está organizada la pantalla

Los informes están repartidos en dos grupos de pestañas:

**Operación diaria**

- **"Cierre de Caja"**
- **"Conciliación"**
- **"Clasificación de Pagos"**
- **"Corrección de Pagos"**

**Análisis**

- **"Histórico Mensual"**
- **"Business Intelligence"**
- **"Puntualidad"**

[CAPTURA: pantalla de Reportes con las dos filas de pestañas y la pestaña "Cierre de Caja" activa]

---

## 2. Cierre de Caja

Muestra todo lo cobrado en un rango de fechas.

### Paso a paso

1. Entra a la pestaña **"Cierre de Caja"**.
2. Elige la fecha de inicio en **"Desde"**.
3. Elige la fecha final en **"Hasta"**.
4. La pantalla muestra **"Divisas (USD)"**, **"Bolívares (VES)"**,
   **"Total de Pagos"** y la **"Distribución por Método"** (efectivo,
   transferencia, pago móvil, punto de venta, Zelle).
5. Para llevarte el informe, usa los botones de descarga: PDF, Excel o CSV.

### Qué pasa después

- Con PDF verás **"Reporte PDF generado correctamente."** y se descarga el
  archivo.
- Con Excel verás **"Archivo Excel descargado."**.
- Con CSV verás **"Archivo CSV descargado."**.

Estos informes solo leen datos; no cierran nada ni bloquean la caja.

---

## 3. Conciliación

Sirve para marcar, una por una, las transacciones que ya viste reflejadas en el
estado de cuenta del banco, y agruparlas en un "lote conciliado".

### Paso a paso

1. Entra a la pestaña **"Conciliación"**.
2. Filtra por fechas con **"Desde"** y **"Hasta"**.
3. Si buscas algo puntual, escribe en el buscador: *"Buscar por referencia,
   alumno, representante o cédula…"*.
4. Puedes acotar con **"Todos los métodos"** y **"Todos los estatus"**.
5. Marca la casilla de cada transacción que ya aparece en el banco.
6. Haz clic en el botón de finalizar el lote.

Si necesitas copiar un número de referencia, haz clic en el icono
**"Copiar referencia"**; verás **"Referencia copiada."**.

### Qué pasa después

Se guarda un lote con las transacciones marcadas y verás **"Lote de conciliación
guardado correctamente."**. El lote queda listado abajo, en **"Historial de Lotes
Conciliados"**. Si nunca has cerrado uno, dirá **"Aún no se ha finalizado ningún
lote de conciliación."**.

---

## 4. Clasificación de Pagos

Cuando entra un depósito por un monto que cubre varias cosas (por ejemplo, dos
mensualidades y la inscripción), aquí se reparte ese dinero entre los conceptos
que corresponde.

### Paso a paso

1. Entra a la pestaña **"Clasificación de Pagos"**.
2. Filtra por **"Desde"**, **"Hasta"**, **"Banco (filtra tabla y exportación)"**,
   **"Concepto (filtra tabla y exportación)"** o **"Todos los estados"**.
3. También puedes buscar por *"Cédula o nombre del representante, o del alumno
   (opcional)…"*.
4. La columna **"Clasif. / Pend."** te dice cuánto de ese pago ya está repartido
   y cuánto falta.
5. Haz clic en el pago para abrir la ventana de clasificación.
6. Agrega una línea por concepto: elige el concepto, escribe el
   **"Monto USD"** y, si quieres, una **"Nota (opcional)"**.
7. Guarda. Verás **"Línea de clasificación agregada."**.

Para clasificar varios pagos de una vez, marca la casilla **"Seleccionar todos
los pagos pendientes de esta página"** y usa la clasificación por lote; ahí la
nota se escribe una sola vez (*"Nota (opcional, se aplica a todas las líneas)"*)
y se aplica a todo.

Cada línea puede editarse con **"Editar línea"** o quitarse con
**"Eliminar línea"**.

### Qué pasa después

Cada línea se descuenta del saldo pendiente del pago. Cuando el pago queda
totalmente repartido, ya no aparece como pendiente. Si intentas clasificar uno
ya completo, verás **"Este pago ya está completamente clasificado."**.

---

## 5. Corrección de Pagos

Tres operaciones distintas sobre pagos ya registrados.

### 5.1 Corregir un pago

Úsalo cuando el pago es correcto pero un dato se cargó mal (banco, referencia,
lote, fecha).

1. Entra a la pestaña **"Corrección de Pagos"**.
2. Busca el pago por fecha, método, estatus o por cédula/nombre.
3. Abre la opción de corregir.
4. Cambia los datos que hagan falta.
5. En el campo de motivo escribe por qué se corrige. Es obligatorio y necesita
   **al menos 10 caracteres**: *"Explica por qué se corrige este pago (mínimo 10
   caracteres)…"*.
6. Guarda. Verás **"Pago corregido correctamente."**.

El motivo queda guardado en las observaciones del pago, precedido de la palabra
`[CORRECCIÓN]`.

### 5.2 Anular un pago ⚠️

Úsalo cuando el pago nunca debió contarse: reverso del banco, pago duplicado o
error de caja.

1. Abre la opción de anular sobre el pago.
2. Escribe el motivo (mínimo 10 caracteres). El sistema sugiere ejemplos:
   *"Ej: reverso bancario confirmado, pago duplicado, error de caja…"*.
3. Confirma.

Verás **"Pago anulado correctamente."**.

### 5.3 Cargar un pago retroactivo

Úsalo cuando un pago realmente ocurrió pero nunca se registró.

1. Abre la opción de carga retroactiva.
2. Busca al alumno o representante escribiendo la cédula (*"Ej: V-12345678"*).
3. Selecciona el alumno de la lista.
4. Escribe el monto en dólares.
5. Elige el banco receptor en **"Seleccionar banco…"**.
6. Escribe la referencia. Si el pago fue por Punto de Venta, la referencia y el
   número de lote deben tener exactamente **4 dígitos** (*"Ej: 0042"*).
7. Indica la fecha real del pago. No puede ser una fecha futura.
8. Escribe el motivo (mínimo 10 caracteres).
9. Guarda. Verás **"Pago retroactivo registrado correctamente."**.

El pago queda con la observación `[CARGA RETROACTIVA]` y el motivo.

---

## 6. Histórico Mensual, Business Intelligence y Puntualidad

Son pestañas de solo lectura.

**"Histórico Mensual"** compara la recaudación mes a mes.

**"Business Intelligence"** muestra:

- **"Proyección de Ingresos — Mes Actual"**, con **"Ingreso potencial"**,
  **"Cobrado hasta hoy"**, **"Por cobrar"** y el **"Progreso de recaudación"**.
- **"Tasa de Morosidad por Grado"**.
- **"Top 5 deudores del mes"**.
- **"Comparativa de Períodos Escolares"**, con un selector **"Año:"**.

Si no hay alumnos cargados dirá **"Sin alumnos activos registrados por grado."**.

**"Puntualidad"** muestra qué tan a tiempo pagan las familias.

[CAPTURA: pestaña "Business Intelligence" con la proyección de ingresos y la tasa de morosidad por grado]

---

## 7. Campos del formulario

### Corrección, anulación y carga retroactiva

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Motivo | Sí | Texto, mínimo 10 caracteres | Por qué se corrige, anula o carga el pago. Queda en el historial. |
| Monto USD | Sí (retroactivo) | Número con dos decimales, mayor a cero | Monto en dólares del pago |
| Banco receptor | Sí (retroactivo) | Elegido de la lista | Banco del colegio donde entró el dinero |
| Referencia | Sí | Texto; 4 dígitos si es Punto de Venta | Número que da el banco |
| Número de lote | Sí en Punto de Venta | Exactamente 4 dígitos | Lote del punto de venta |
| Fecha de pago | Sí (retroactivo) | `dd/MM/yyyy`, no futura y dentro del período escolar activo | Cuándo se hizo realmente el pago |

---

## 8. Qué pasa después

**Al anular un pago:**

- El pago queda con estado **"Anulado"**. No se borra: sigue visible en el
  historial, con quién lo anuló y cuándo.
- Todas las mensualidades y cuotas de inscripción que ese pago había marcado como
  pagadas vuelven a quedar **pendientes**.
- Las cuotas de solvencia vinculadas vuelven a cero.
- El alumno puede volver a aparecer en mora y volver a recibir los avisos
  automáticos de cobranza.

**Al corregir un pago:** el pago sigue contando igual; solo cambian los datos que
editaste y queda constancia del cambio.

**Al cargar un pago retroactivo:** se crea un pago nuevo con la fecha real y se
aplica a las deudas del alumno como cualquier otro pago.

Todas estas operaciones quedan registradas en **Auditoría**.

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Explica el motivo de la anulación (mínimo 10 caracteres)." | El motivo está vacío o es muy corto. | Escribe una explicación real. |
| "Explica el motivo de la corrección (mínimo 10 caracteres)." | Igual, al corregir. | Escribe una explicación real. |
| "La fecha de inicio no puede ser mayor a la fecha fin." | Invertiste las fechas del filtro. | Corrige el rango. |
| "fecha_inicio no puede ser posterior a fecha_fin." | Lo mismo, informado por el sistema. | Corrige el rango. |
| "La fecha de pago no puede ser futura." | Pusiste una fecha que aún no llega. | Usa la fecha real del pago. |
| "La fecha del pago retroactivo … está fuera del período escolar activo vigente" | La fecha no cae dentro del período escolar configurado. | Revisa la fecha, o el período activo en Configuración. |
| "No hay un período escolar activo configurado…" | Falta configurar el período. | Configúralo en "Configuración". |
| "Referencia y lote de Punto de Venta deben tener 4 dígitos." | Escribiste más o menos de 4 dígitos. | Usa exactamente 4, por ejemplo `0042`. |
| "El número de lote debe tener 4 dígitos." | Igual, al corregir. | Usa 4 dígitos. |
| "Selecciona el banco receptor." | Falta el banco. | Elígelo de la lista. |
| "Busca y selecciona el alumno/representante." | No elegiste a quién corresponde el pago. | Búscalo por cédula y selecciónalo. |
| "Representante no encontrado." | Esa cédula no está registrada. | Verifica la cédula o crea al representante. |
| "Ingresa un monto USD válido." | El monto está vacío o no es un número. | Escribe el monto en dólares. |
| "Este pago ya fue anulado anteriormente." | Ya lo anulaste. | No hay nada más que hacer. |
| "No se puede corregir un pago anulado." | El pago está anulado. | Carga un pago retroactivo si hace falta reponerlo. |
| "No se puede anular este pago: su fecha cae dentro de un cierre de caja ya validado por el director." | La caja de ese día ya fue cerrada y aprobada. | Habla con el Director; hace falta un ajuste manual. |
| "No se puede anular automáticamente un pago vinculado a un Proyecto de Inversión…" | Ese pago es un abono parcial y no se puede revertir solo. | Contacta a Sistemas para el ajuste manual. |
| "No hay transacciones en el período seleccionado." | No hubo movimientos en ese rango. | Amplía las fechas. |
| "No hay movimientos que coincidan con los filtros seleccionados." | Los filtros son demasiado estrechos. | Quita filtros. |
| "Marca al menos una transacción antes de finalizar el lote." | No seleccionaste nada. | Marca al menos una casilla. |
| "Debe marcar al menos una transacción antes de finalizar." | Lo mismo, informado por el sistema. | Marca al menos una casilla. |
| "No se pudo cargar la lista de bancos." | Fallo de conexión con el sistema. | Recarga la página; si sigue, avisa a Sistemas. |
| "No se pudo generar el recibo PDF." | El archivo no se pudo armar. | Reintenta; si sigue, avisa a Sistemas. |

---

## 10. Advertencias

⚠️ **Anular un pago no se puede deshacer desde la pantalla.** El pago queda
marcado como anulado para siempre. Si te equivocaste, tendrás que volver a
cargarlo como pago retroactivo.

⚠️ **Anular un pago vuelve a poner en deuda al alumno.** Las mensualidades que
ese pago había saldado quedan otra vez pendientes, el alumno puede entrar en mora
y volverá a recibir los correos automáticos de cobranza.

⚠️ **No se puede anular un pago dentro de un cierre de caja validado.** Si ya
pasó por la revisión del Director, hace falta un ajuste manual.

⚠️ **El motivo que escribas queda guardado de forma permanente** en las
observaciones del pago y en Auditoría, con tu nombre.
