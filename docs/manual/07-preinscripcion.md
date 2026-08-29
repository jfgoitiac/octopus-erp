# 07 · Pre-Inscripción

## Para qué sirve

Genera la planilla oficial de inscripción en Word, ya rellenada con los datos que
el sistema tiene del estudiante y de su representante. Sirve para entregarle el
formulario a la familia sin tener que escribirlo a mano. El alumno **no necesita
estar inscrito todavía**.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Secretaria**.

## Cómo llegar

Menú lateral → **Principal** → **"Pre-Inscripción"**.

---

## 1. Qué muestra la pantalla

Arriba, el título **"Pre-Inscripción"** con la explicación *"Genera la planilla
oficial de inscripción rellenada con los datos del estudiante — no necesita estar
inscrito todavía."*.

A la derecha, el botón **"Generar para todos"**.

En el centro, un buscador: *"Buscar estudiante por nombre, apellido o
cédula..."*. Debajo aparece la tabla con las columnas **"Estudiante"**,
**"Cédula escolar"**, **"Grado/Sección"**, **"Estado"** y **"Acción"**.

El estado puede ser:

| Estado | Qué significa |
|--------|---------------|
| **"Inscrito"** (verde) | Ya tiene inscripción para el período |
| **"Sin inscribir"** (amarillo) | Está en el sistema pero aún no inscrito |
| **"Retirado"** (rojo) | Fue dado de baja |

[CAPTURA: pantalla de "Pre-Inscripción" con el buscador, la tabla de estudiantes y el botón "Generar para todos"]

---

## 2. Paso a paso

### Generar la planilla de un estudiante

1. Escribe el nombre, apellido o cédula en el buscador. La lista se filtra sola
   después de un momento.
2. Localiza al estudiante en la tabla.
3. Haz clic en la acción de generar de esa fila. Se abre la ventana
   **"Generar Pre-Inscripción"**.
4. Marca los campos que quieres que salgan rellenados en la planilla. Están
   agrupados en tres bloques: **"Datos del estudiante"**, **"Datos del
   representante"** y **"Datos administrativos"**.
   - Los enlaces **"Seleccionar todos"** y **"Deseleccionar todos"** te ahorran
     tiempo.
5. Haz clic en **"Generar"**. Mientras trabaja dirá **"Generando..."**.

Verás **"Planilla de pre-inscripción generada correctamente."** y se descargará
el archivo de Word.

### Generar las planillas de todos

1. Haz clic en **"Generar para todos"**, arriba a la derecha. Se abre la ventana
   **"Generar Pre-Inscripción (todos)"**.
2. En **"Formato de salida"** elige una de las dos opciones:
   - **"Individuales"** — un archivo `.zip` con un documento de Word por alumno.
   - **"Documento único"** — un solo documento de Word con todas las planillas.
3. Marca los campos que quieres incluir.
4. Haz clic en **"Generar"**.

[CAPTURA: ventana "Generar Pre-Inscripción (todos)" con las dos opciones de formato de salida y la lista de campos]

---

## 3. Campos del formulario

Todos los campos de esta ventana son opcionales: marcarlos solo decide qué se
imprime en la planilla.

### Datos del estudiante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Apellidos, Nombres | No | Texto | Nombre completo del estudiante |
| Fecha de nacimiento | No | `dd/MM/yyyy` | Fecha de nacimiento |
| Lugar de nacimiento, País, Estado | No | Texto | Dónde nació |
| Cédula | No | Texto | Cédula del estudiante, si tiene |
| Sexo | No | Masculino / Femenino | Género registrado |
| Peso, Estatura | No | Número | Peso en kg, estatura en cm |
| Dirección | No | Texto | Domicilio |
| Edad | No | Número | Calculada por el sistema |
| Institución de procedencia | No | Texto | De qué colegio viene |
| Bautizado | No | Sí / No | Dato solicitado por el colegio |
| Cursará | No | Texto | Grado que va a cursar |
| Alérgico | No | Texto | A qué es alérgico |

### Datos del representante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Apellidos, Nombres | No | Texto | Nombre del representante |
| Cédula | No | `V-12345678` | Cédula del representante |
| Parentesco | No | Padre / Madre / Tutor / Otro | Relación con el estudiante |
| Dirección, Nacionalidad, Teléfono | No | Texto | Datos de contacto |
| Nivel de estudio | No | Texto | Nivel académico del representante |

### Datos administrativos

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| N° Solvencia | No | Texto | Número de la constancia de solvencia |
| N° de transferencia | No | Texto | Referencia bancaria del pago |
| Monto transferencia, Monto efectivo | No | Número | Montos pagados |
| Banco de procedencia, Banco destino | No | Texto | Bancos del pago |
| Fecha de pago, Fecha de inscripción | No | `dd/MM/yyyy` | Fechas del trámite |

---

## 4. Qué pasa después

- Se descarga un archivo de Word (`.docx`) o un `.zip`, según lo que elegiste.
- **No se crea ninguna inscripción.** Esta pantalla solo produce el documento: el
  alumno sigue exactamente igual que antes.
- No se envía ningún correo.
- La selección de campos que hiciste queda recordada en ese navegador para la
  próxima vez.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "No se pudo buscar estudiantes." | Falló la consulta al sistema. | Revisa tu conexión y vuelve a intentar. |
| "No se pudo generar la planilla de pre-inscripción." | El documento no se pudo armar. | Reintenta. Si persiste, avisa a Sistemas. |
| La tabla no muestra nada | No escribiste nada en el buscador, o nadie coincide. | Escribe al menos parte del nombre o la cédula. |
| La planilla sale con campos vacíos | El sistema no tiene ese dato del alumno. | Complétalo primero en "Alumnos" o "Representantes". |

---

## 6. Advertencias

Esta pantalla no realiza ninguna acción irreversible: solo genera documentos.

⚠️ La planilla contiene datos personales del estudiante y de su familia. Entrega
el archivo solo a quien corresponde.
