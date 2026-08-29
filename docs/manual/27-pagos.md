# 27 · Módulo de Pagos (transferencias al personal)

## Para qué sirve

Genera los archivos que el colegio sube al banco para pagarle al personal: el
archivo TXT de transferencias y la planilla en PDF. Cubre tres pagos distintos:
el incentivo, la nómina de sueldo y el cestaticket.

> Este módulo paga **al personal del colegio**. Los pagos de las familias se
> registran en [Cobranza](20-cobranza.md).

## Quién puede usarlo

**Director**, **Sistemas** y **Administrador**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Pagos"**.

---

## 1. Qué muestra la pantalla

El título **"Módulo de Pagos"** con la descripción **"Generación de archivos TXT
y planillas PDF para transferencias bancarias"**.

Tres tarjetas, una por tipo de pago:

| Tarjeta | Para qué es |
|---------|-------------|
| **"Incentivo"** | Pago de incentivo por Bancaribe |
| **"Nómina"** | Pago de sueldo |
| **"Cestaticket"** | Bono alimentario |

Dentro de **"Nómina"** y **"Cestaticket"**, el personal se separa en tres
pestañas: **"Docente"**, **"Personal de Apoyo"** y **"Administrativo"**.

[CAPTURA: pantalla "Módulo de Pagos" con las tres tarjetas de Incentivo, Nómina y Cestaticket]

---

## 2. Paso a paso

### Configurar las tarifas del cestaticket

Hazlo **antes** de generar cualquier cestaticket.

1. Haz clic en **"Configurar"** (*"Configurar tarifas y tasa BCV de cesta
   ticket"*). Se abre **"Configuración de Cesta Ticket"**.
2. Para cada estamento, escribe el monto en **"USD $"**. El sistema muestra al
   lado el equivalente en **"Bs/mes"**.
3. Escribe la **"Tasa BCV del día (Bs/USD)"**. Es obligatoria.
   - El total se calcula así: *Total Cesta (Bs) = Monto USD × Tasa BCV*, y se
     aplica a todos los estamentos.
4. Guarda. Verás **"Configuración de cesta ticket guardada."**.

### Generar el pago de incentivo

1. Abre la tarjeta **"Incentivo — Pago Bancaribe"**.
2. Escribe el **"Concepto de pago"** (*"Ej: Nómina I Quincena Junio 2026"*).
3. Escribe la tasa Bs/USD del día (*"Ej: 91.50"*). Debe ser mayor a cero.
4. Revisa la lista de empleados y sus montos.
5. Genera.

Verás **"Incentivo: TXT + planilla generados (24 empleado/s)."**.

### Generar la nómina de sueldo

1. Abre la tarjeta **"Nómina — Pago de Sueldo"**.
2. Elige la pestaña del estamento: **"Docente"**, **"Personal de Apoyo"** o
   **"Administrativo"**.
3. Escribe el **"Concepto de pago"**.
4. Revisa los montos del personal listado.
5. Haz clic en **"Generar TXT — Docente"** (el botón lleva el nombre del
   estamento elegido).

Verás **"Nómina Docente: TXT + planilla generados (18 empleado/s)."**.

### Generar el cestaticket

1. Abre la tarjeta **"Cestaticket — Bono Alimentario"**.
2. Verifica que arriba aparezca la **"Tasa BCV:"** configurada.
3. Elige la pestaña del estamento.
4. Haz clic en **"Generar TXT — Docente"**.

Verás **"Cestaticket Docente: ZIP generado con 18 recibo(s) + planilla + TXT."**.

[CAPTURA: tarjeta "Cestaticket — Bono Alimentario" con la tasa BCV, las pestañas por estamento y la lista de personal]

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Concepto de pago | Sí | Texto, ej. `Nómina I Quincena Junio 2026` | Descripción que va en la transferencia |
| Tasa Bs/USD | Sí | Número mayor a cero, ej. `91.50` | Tasa con la que se convierte el monto |
| Monto USD por estamento | Sí, para cestaticket | Número con dos decimales | Cuánto recibe cada estamento |
| Tasa BCV del día (Bs/USD) | Sí, para cestaticket | Número mayor a cero | Tasa del día para el bono alimentario |
| Estamento | Sí | Docente / Personal de Apoyo / Administrativo | A qué grupo se le paga |

---

## 4. Qué pasa después

- Se descarga el **archivo TXT** con el formato que pide el banco, más la
  **planilla en PDF**.
- En el caso del cestaticket, se descarga un **archivo ZIP** con los recibos
  individuales, la planilla y el TXT.
- **El sistema no ejecuta ninguna transferencia.** Los archivos hay que subirlos
  al portal del banco: eso lo hace una persona, fuera de Octopus.
- Solo se incluye en el archivo el personal que tenga cuenta Bancaribe y un monto
  cargado.
- La configuración del cestaticket queda guardada para la próxima vez.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Escribe el concepto de pago." | Falta el concepto. | Escríbelo. |
| "La tasa Bs/USD debe ser mayor a 0." | La tasa está vacía o en cero. | Escribe la tasa del día. |
| "Configura la Tasa BCV usando el botón «Configurar» antes de procesar." | Falta la tasa del cestaticket. | Ábrelo y configúrala. |
| "No hay empleados Bancaribe con monto para Docente para incluir en el TXT." | Nadie de ese estamento tiene cuenta y monto. | Revisa las cuentas y montos en "Nómina". |
| "Algunos empleados no tienen monto USD configurado para su estamento. Usa el botón «Configurar» en esta página." | Falta cargar montos. | Ábrelo y complétalos. |
| "No hay personal docente registrado." | Ese estamento está vacío. | Registra al personal en "Nómina". |
| "No se pudo cargar los empleados." | Falló la consulta. | Recarga la página. |
| "No se pudo cargar la vista previa de Bancaribe." | No se pudo armar la vista. | Reintenta; si sigue, avisa a Sistemas. |
| "No se pudo guardar la configuración. Verifica tu conexión." | No se guardaron las tarifas. | Revisa la red y vuelve a guardar. |
| "Error al generar el ZIP." | El archivo del cestaticket falló. | Reintenta; si sigue, avisa a Sistemas. |
| "No se pudo cargar la configuración guardada. Se usarán valores por defecto." | No se leyó la configuración anterior. | Revísala antes de generar. |

---

## 6. Advertencias

⚠️ **Revisa la tasa antes de generar.** El archivo se arma con la tasa que
escribiste: si está mal, el banco pagará montos equivocados.

⚠️ **El archivo TXT contiene números de cuenta y sueldos de todo el personal.**
Manéjalo con la misma reserva que un documento bancario y bórralo del equipo
compartido al terminar.

⚠️ **Generar el archivo no paga a nadie.** El pago ocurre cuando alguien sube el
TXT al portal del banco.

⚠️ **Revisa la planilla antes de subir el TXT.** Una vez cargado en el banco, el
error se corrige con un reverso, no desde Octopus.
