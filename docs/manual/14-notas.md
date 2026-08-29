# 14 · Notas

## Para qué sirve

Es donde se cargan y corrigen las calificaciones de cada alumno, materia por
materia y lapso por lapso. También es la pantalla donde se crean, editan y
cierran los lapsos del período escolar.

## Quién puede usarlo

**Director**, **Sistemas** y **Secretaria**. Los docentes cargan sus notas desde
el [Portal Docente](32-portal-docente.md).

## Cómo llegar

Menú lateral → **Académico** → **"Notas"**.

---

## 1. Qué muestra la pantalla

El título **"Registro de Notas"** con la descripción **"Ingresa y actualiza las
calificaciones por materia y lapso"**.

Arriba hay tres selectores: grado, materia y lapso (*"Seleccionar lapso..."*),
más dos botones:

- **"Crear nuevo lapso"**
- **"Editar lapso seleccionado"**

Mientras no elijas los tres, la pantalla dice **"Selecciona grado, materia y
lapso para ver las notas."**.

Al elegirlos aparece la tabla de alumnos con cuatro columnas de evaluación y la
nota definitiva.

[CAPTURA: pantalla "Registro de Notas" con los selectores de grado, materia y lapso, y el botón "Guardar notas"]

---

## 2. Paso a paso

### Cargar notas

1. Elige el grado y la sección.
2. Elige la materia.
3. Elige el lapso en **"Seleccionar lapso..."**.
4. La tabla se llena con los alumnos de esa sección.
5. Escribe las notas en las columnas de evaluación. Cada nota va de **0 a 20**.
   Las celdas vacías muestran un guion (`—`).
6. Guarda.

Verás **"Notas guardadas correctamente."**.

> La **nota definitiva la calcula el sistema**: es el promedio de las
> evaluaciones que hayas cargado. No se escribe a mano. Se aprueba con 10 o más.

### Crear un lapso

1. Haz clic en **"Crear nuevo lapso"**.
2. Elige el nombre: **"1er Lapso"**, **"2do Lapso"** o **"3er Lapso"**.
3. Escribe el período escolar (*"ej. 2024-2025"*).
4. Indica la fecha de inicio y la fecha de fin.
5. Guarda. Verás **"Lapso creado correctamente."**.

### Editar un lapso

1. Elige el lapso en el selector.
2. Haz clic en **"Editar lapso seleccionado"**.
3. Cambia lo que necesites y guarda. Verás **"Lapso actualizado correctamente."**.

### Cerrar un lapso ⚠️

Cerrar un lapso lo desactiva: nadie podrá cargar ni corregir notas de ese lapso.
Al hacerlo verás **"Lapso *1er Lapso* cerrado correctamente."**.

El lapso **no se borra**: las notas ya cargadas se conservan intactas y siguen
apareciendo en los boletines.

---

## 3. Campos del formulario

### Notas

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Grado | Sí | Elegido de la lista | Sección cuyos alumnos vas a calificar |
| Materia | Sí | Elegida de la lista | Materia que se califica |
| Lapso | Sí | Elegido de la lista | Lapso al que corresponden las notas |
| Evaluación 1 a 4 | No | Número de 0 a 20, con hasta dos decimales | Calificaciones parciales |
| Definitiva | Automático | Número de 0 a 20 | Promedio de las evaluaciones cargadas. No editable |
| Observaciones | No | Texto | Comentario sobre el alumno en esa materia |

### Lapso

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre | Sí | 1er Lapso / 2do Lapso / 3er Lapso | Cuál de los tres lapsos es |
| Período escolar | Sí | `2024-2025` | A qué año escolar pertenece |
| Fecha de inicio | Sí | `dd/MM/yyyy` | Cuándo empieza el lapso |
| Fecha de fin | Sí | `dd/MM/yyyy` | Cuándo termina |

> No puede haber dos lapsos con el mismo nombre en el mismo período escolar.

---

## 4. Qué pasa después

- Las notas quedan guardadas y el sistema recalcula la definitiva de cada alumno.
- Las notas se ven de inmediato en el [Boletín](15-boletin.md), en
  [Rendimiento](05-rendimiento.md) y en el Portal de Familias, en la sección de
  rendimiento del representante.
- **Cada cambio de nota queda registrado** con el usuario, la fecha y el valor
  anterior.
- Cerrar un lapso bloquea de inmediato la carga de notas de ese lapso, tanto aquí
  como en el Portal Docente.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Selecciona materia y lapso." | Falta elegir uno de los filtros. | Elige los tres selectores. |
| "La nota debe estar entre 0 y 20." | Escribiste un valor fuera de escala. | Corrige la nota. |
| "El lapso está cerrado — no se pueden registrar ni editar notas." | Ese lapso ya se cerró. | Pide al Director que lo reabra. |
| "No se pudieron cargar las notas." | Falló la consulta. | Recarga la página. |
| "No se pudieron cargar las materias." | Falló la consulta de materias. | Recarga la página. |
| "Completa nombre y período escolar." | Faltan datos del lapso. | Complétalos. |
| "Selecciona un lapso para editar." | No elegiste lapso. | Elígelo antes de editar. |
| "Solo el director o sistemas pueden crear lapsos." | Tu rol no puede. | Pídelo a Director o Sistemas. |
| "Se requieren los parámetros materia_id y lapso_id." | Faltó un filtro. | Vuelve a elegir materia y lapso. |
| "No tienes permisos para registrar notas en esta materia." | La materia no es tuya. | Solo el docente asignado o control de estudios puede cargarla. |
| "Nota no encontrada." | La nota ya no existe. | Recarga la pantalla. |
| "Lapso no encontrado." | Ese lapso fue eliminado. | Recarga la lista de lapsos. |

---

## 6. Advertencias

⚠️ **Cerrar un lapso bloquea la carga de notas de todo el colegio para ese
lapso.** Ningún docente podrá corregir después. Hazlo solo cuando todas las
materias estén cargadas y revisadas.

⚠️ **La nota definitiva no se escribe a mano.** Si el promedio no da lo que
esperas, revisa las evaluaciones parciales: el sistema promedia solo las que
tengan valor.

⚠️ **Cada cambio de nota queda con tu nombre en el historial.** Corregir una nota
después de entregado el boletín deja rastro.
