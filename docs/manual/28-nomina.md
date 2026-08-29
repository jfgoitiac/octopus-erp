# 28 · Nómina

## Para qué sirve

Es el registro del personal del colegio: sus datos, su cargo, su sueldo y su
cuenta bancaria. Desde aquí también se genera la nómina del mes y se descargan
los recibos de pago de cada trabajador.

## Quién puede usarlo

**Director**, **Sistemas** y **Administrador**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Nómina"**.

---

## 1. Qué muestra la pantalla

El título **"Gestión de Nómina"** con la descripción **"Registro y administración
del personal"**.

Arriba, los botones **"Generar nómina"** y **"Excel"**, más el buscador *"Buscar
nombre, cédula, cargo…"* y **"Recargar listado de empleados"**.

El personal se divide en tres pestañas: **"Docente"**, **"Personal de Apoyo"** y
**"Administrativo"**.

La tabla tiene las columnas **"Empleado"**, **"Cargo"**, **"Categoría / Años"**
(o **"Detalles"** para el personal no docente), **"Banco"**, **"N° Cuenta"** y
**"Acción"**.

[CAPTURA: pantalla "Gestión de Nómina" con las tres pestañas de personal y la tabla de empleados]

---

## 2. Paso a paso

### Registrar un empleado

1. Elige la pestaña del tipo de personal.
2. Haz clic en **"Registrar Docente"** (el botón lleva el nombre de la pestaña
   activa).
3. Completa los datos:
   - **"Nombre"**, **"Apellido"** y **"Cédula"** (*"Formato: V-12345678 o
     E-12345678"*).
   - **"Cargo"**, **"Tipo de personal"** y **"Fecha de ingreso"**.
   - **"Teléfono"** y **"Correo"**.
   - **"Sueldo Base Mensual (Bs)"**.
   - **"Banco"**, **"Tipo de cuenta"** (*"Ahorro"* o *"Corriente"*) y **"Número
     de cuenta"** (*"01140000000000000000"*).
   - Para docentes: **"Título Académico"**, **"Categoría Docente"**, **"Nivel que
     dicta"**, **"Años de Servicio"** y **"N° H/Sem"**.
   - **"N° Hijos"**, si aplica la prima correspondiente.
4. Haz clic en **"Registrar"**.

Verás **"Empleado registrado exitosamente."**.

### Editar un empleado

1. Ábrelo desde la tabla.
2. Cambia lo que necesites y guarda. Verás **"Empleado actualizado
   exitosamente."**.

### Desactivar un empleado ⚠️

1. Usa la acción **"Desactivar empleado"** en su fila.
2. Confirma.

Verás **"Juan Pérez desactivado exitosamente."**.

### Generar la nómina del mes ⚠️

1. Haz clic en **"Generar nómina"**. Se abre **"Generar nómina del mes"**.
2. Elige el **mes** y el **"Año"**.
3. Escribe la **"Tasa usada (Bs/USD)"**.
4. Escribe el **"Cesta ticket (Bs)"**.
5. Confirma. La ventana advierte: *"Los valores se guardarán en cada registro."*.

Verás **"Nómina generada para 42 empleados."**.

### Ver y descargar recibos

1. Abre la opción de recibos del empleado. Verás **"Historial de recibos"**.
2. Haz clic en **"Descargar recibo"** del período que necesites.

Si no hay ninguno, dirá **"No hay recibos emitidos."**.

### Exportar el listado

Haz clic en **"Excel"**. Mientras trabaja dirá **"Exportando..."** y al terminar
verás **"Archivo Excel descargado."**.

---

## 3. Campos del formulario

### Datos del empleado

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre | Sí | Texto | Nombre del trabajador |
| Apellido | Sí | Texto | Apellido del trabajador |
| Cédula | Sí | `V-12345678` o `E-12345678` | Documento de identidad |
| Cargo | Sí | Texto o elegido de la lista | Cargo que ocupa |
| Tipo de personal | Sí | Docente / Personal de Apoyo / Administrativo / Directivo / Obrero | En qué grupo entra |
| Fecha de ingreso | Sí | `dd/MM/yyyy` | Cuándo empezó a trabajar |
| Teléfono, Correo | No | Texto | Datos de contacto |
| Sueldo Base Mensual (Bs) | Sí | Número con dos decimales | Sueldo mensual en bolívares |
| Banco | Sí | Elegido de la lista | Banco donde cobra |
| Tipo de cuenta | Sí | Ahorro / Corriente | Tipo de cuenta bancaria |
| Número de cuenta | Sí | 20 dígitos, ej. `01140000000000000000` | Cuenta donde se deposita |
| Título Académico | No | Texto | Solo para docentes |
| Categoría Docente, Nivel que dicta, Años de Servicio | No | Texto o número | Clasificación del escalafón docente |
| N° H/Sem | No | Número | Horas semanales |
| N° Hijos | No | Número | Para las primas por carga familiar |

### Generar nómina

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Mes | Sí | Elegido de la lista | Mes que se paga |
| Año | Sí | Número desde 2000 | Año que se paga |
| Tasa usada (Bs/USD) | Sí | Número mayor a cero | Tasa con la que se calcula |
| Cesta ticket (Bs) | Sí | Número con dos decimales | Monto del bono alimentario |

---

## 4. Qué pasa después

**Al generar la nómina:**

- Se crea un registro de pago por cada empleado activo del período.
- La tasa y el monto de cestaticket que escribiste **quedan guardados en cada
  registro**: es la foto de ese mes.
- Se pueden descargar los recibos individuales de cada trabajador.
- El recibo incluye el encabezado oficial (**"REPÚBLICA BOLIVARIANA DE
  VENEZUELA"**, **"MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN"**), las
  **"ASIGNACIONES MENSUALES"**, las **"RETENCIONES"**, el **"PROGRAMA
  ALIMENTARIO"** y, si corresponde, la **"PRIMA POR DISCAPACIDAD PARA EL PERSONAL
  E HIJOS"**.

**Al desactivar un empleado:** deja de aparecer en el listado activo y no entra
en las nóminas siguientes. Su historial de recibos se conserva.

Los datos bancarios que cargues aquí son los que usa el
[Módulo de Pagos](27-pagos.md) para armar los archivos del banco.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Revisa los campos marcados." | Falta algún dato obligatorio o tiene mal formato. | Corrige los campos en rojo. |
| "Ya existen registros para uno o más empleados de este período." | Ya generaste la nómina de ese mes. | No la generes dos veces. |
| "Mes, año, tasa de cambio y cesta ticket son obligatorios y numéricos." | Falta un dato o no es un número. | Complétalos con números. |
| "Los valores del período y montos no son válidos." | El mes o el año están fuera de rango. | Revísalos. |
| "El período fue generado simultáneamente. Vuelve a consultar el historial." | Otra persona lo generó al mismo tiempo. | Recarga el historial. |
| "No se pudo cargar el historial." | Falló la consulta de recibos. | Recarga la página. |
| "No se pudo descargar el recibo." | El archivo no se pudo armar. | Reintenta; si sigue, avisa a Sistemas. |
| "El recibo de nómina solicitado no existe." | Ese recibo no está en el sistema. | Genera la nómina de ese período. |
| "No se pudo cargar la configuración por defecto." | No se leyeron los parámetros de cálculo. | Avisa a Sistemas antes de generar. |
| "No hay recibos emitidos." | Ese empleado aún no tiene recibos. | Genera la nómina del mes. |

---

## 6. Advertencias

⚠️ **Generar la nómina de un mes no se puede repetir.** Si ya existe, el sistema
lo rechaza. Revisa la tasa y el monto de cestaticket **antes** de confirmar.

⚠️ **La tasa se congela en cada recibo.** Cambiarla después no corrige los recibos
ya generados.

⚠️ **Desactivar un empleado lo saca de las nóminas siguientes.** Hazlo solo cuando
efectivamente deje de trabajar en el colegio.

⚠️ **Un número de cuenta mal cargado hace que el pago vaya a otra persona.**
Verifícalo dígito por dígito: son 20.

⚠️ Este módulo contiene sueldos y datos bancarios de todo el personal. No dejes la
pantalla abierta ni exportes el Excel a equipos compartidos.
