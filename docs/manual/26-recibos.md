# 26 · Recibos de Pago (personal)

## Para qué sirve

Arma el recibo de pago de un trabajador del colegio: sus asignaciones, sus
retenciones, el neto a depositar y el beneficio del programa alimentario. Al
terminar, lo imprime o lo guarda en PDF.

> Este módulo es para el **personal del colegio**, no para las familias. Los
> recibos de pagos de las familias están en
> [Consulta de Comprobantes](23-comprobantes.md).

## Quién puede usarlo

**Director**, **Sistemas** y **Administrador**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Recibos"**.

---

## 1. Qué muestra la pantalla

A la izquierda, el formulario **"Recibos de Pago"** con la indicación **"Rellene
los datos y genere el recibo"**, dividido en bloques:

- **"Logos"** — **"Logo Colegio"** y **"Logo AVEC"**.
- **"Período"** — mes, año y tipo de recibo.
- **"Datos del Empleado"**.
- Asignaciones, con su **"Total Asignaciones"**.
- Retenciones, con su **"Total Retenciones"**.
- **"Neto a Depositar"**.
- **"Programa Alimentario"**, con su **"Total Beneficio a Recibir"**.

A la derecha, la vista previa del recibo. Abajo, el botón **"Imprimir / Guardar
PDF"**.

[CAPTURA: pantalla de "Recibos de Pago" con el formulario a la izquierda y la vista previa del recibo a la derecha]

---

## 2. Paso a paso

### Generar un recibo

1. En **"Logos"**, sube el **"Logo Colegio"** y el **"Logo AVEC"** si el recibo
   los lleva.
2. En **"Período"**, elige el **"Mes"** y el **"Año"**, y escribe el **"Tipo de
   recibo"**.
3. Completa **"Datos del Empleado"**:
   - **"Apellidos y Nombres"** (*"PÉREZ JUAN"*)
   - **"C.I Nº"** (*"V-12.345.678"*)
   - **"Nº H/Sem"** (*"36"*)
   - **"Cargo"** (*"Docente"*)
   - **"Fecha de Ingreso"** (*"18/09/2017"*)
   - **"Título"** (*"LND"*), **"Nivel"** (*"PPH"*) y **"Categoría Docente"**
     (*"EMG"*)
4. Carga las **asignaciones** (sueldo, primas, bonos). El sistema calcula el
   **"Total Asignaciones"**.
5. Carga las **retenciones** (seguro, aportes, descuentos). El sistema calcula el
   **"Total Retenciones"**.
6. Revisa el **"Neto a Depositar"**: es el total de asignaciones menos el total
   de retenciones.
7. Completa el **"Programa Alimentario"**:
   - **"Monto beneficio por hora"**
   - **"Costo diario del beneficio (auto)"** — lo calcula el sistema
   - **"Total Beneficio de Alimentación"**
   - **"Nº H/MENS inasistencia"** y **"Descuento inasistencia"**
   - El sistema calcula el **"Total Beneficio a Recibir"**
8. Haz clic en **"Imprimir / Guardar PDF"**.

### Agregar, renombrar o quitar una línea

- Para renombrar una línea de asignación o retención, haz clic sobre su nombre,
  escribe el nuevo y confirma con **"Confirmar"**. Para desistir, usa
  **"Cancelar"**.
- Para quitarla, usa el botón de eliminar de esa línea. El sistema pregunta
  **"¿Eliminar «Prima de antigüedad»?"** antes de borrarla.

---

## 3. Campos del formulario

### Período

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Mes | Sí | Elegido de la lista | Mes del recibo |
| Año | Sí | Número de cuatro dígitos | Año del recibo |
| Tipo de recibo | Sí | Texto | Por ejemplo, quincena o mes completo |

### Datos del empleado

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Apellidos y Nombres | Sí | Texto en mayúsculas, ej. `PÉREZ JUAN` | Nombre del trabajador |
| C.I Nº | Sí | `V-12.345.678` | Cédula |
| Nº H/Sem | Sí | Número, ej. `36` | Horas semanales |
| Cargo | Sí | Texto, ej. `Docente` | Cargo que ocupa |
| Fecha de Ingreso | Sí | `dd/MM/yyyy` | Cuándo entró al colegio |
| Título, Nivel, Categoría Docente | No | Códigos del escalafón, ej. `LND`, `PPH`, `EMG` | Clasificación del personal |

### Montos

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Asignaciones | Sí | Número con dos decimales | Todo lo que se le paga |
| Retenciones | No | Número con dos decimales | Todo lo que se le descuenta |
| Neto a Depositar | Automático | Número | Asignaciones menos retenciones |
| Monto beneficio por hora | No | Número | Base del programa alimentario |
| Nº H/MENS inasistencia | No | Número | Horas no trabajadas en el mes |
| Total Beneficio a Recibir | Automático | Número | Beneficio menos el descuento por inasistencia |

---

## 4. Qué pasa después

- Se abre el diálogo de impresión del navegador, desde donde puedes imprimir o
  guardar el recibo como PDF.
- **El recibo no se guarda en el sistema.** Es un documento que se arma en el
  momento: si cierras la pantalla, los datos se pierden.
- No se registra ningún pago ni movimiento contable, y no se envía ningún correo.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "El recibo de nómina solicitado no existe." | Se pidió un recibo que no está en el sistema. | Genera el recibo desde esta pantalla. |
| "No se pudo generar el recibo PDF." | El archivo no se pudo armar. | Reintenta; si sigue, avisa a Sistemas. |
| Los logos no aparecen en el recibo | No los cargaste, o el archivo no es una imagen válida. | Súbelos de nuevo en el bloque "Logos". |
| El "Neto a Depositar" da un número raro | Alguna línea quedó vacía o con texto. | Revisa asignaciones y retenciones una por una. |
| Al imprimir sale cortado | El navegador está usando otro tamaño de hoja. | En el diálogo de impresión elige tamaño carta y márgenes normales. |

---

## 6. Advertencias

⚠️ **El recibo no queda guardado.** Si cierras la pantalla sin imprimir, tendrás
que volver a llenar todo. Genera el PDF antes de salir.

⚠️ **Los montos se escriben a mano.** El sistema no los toma de la nómina: revisa
dos veces antes de imprimir y entregar.

⚠️ El recibo contiene el sueldo de una persona. Entrégalo solo al trabajador.
