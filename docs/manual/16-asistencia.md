# 16 · Asistencia

## Para qué sirve

Es el pase de lista diario. Marcas quién vino, quién faltó, quién llegó tarde y
quién tiene falta justificada, y puedes dejar una observación por alumno.

## Quién puede usarlo

**Director**, **Sistemas** y **Secretaria**. Los docentes pasan asistencia desde
el [Portal Docente](32-portal-docente.md).

## Cómo llegar

Menú lateral → **Académico** → **"Asistencia"**.

---

## 1. Qué muestra la pantalla

El título **"Control de Asistencia"** con la descripción **"Registro diario de
presencia por grado"**.

Arriba están el selector de grado, el calendario de fecha y los botones **"Día
anterior"** y **"Día siguiente"** para moverte de un día a otro sin abrir el
calendario.

Mientras no elijas nada, verás **"Selecciona grado y fecha para cargar la
lista."**.

Al elegir grado y fecha aparece la lista de alumnos. Cada fila tiene cuatro
botones de estado y, cuando corresponde, un campo de observación.

[CAPTURA: pantalla "Control de Asistencia" con el selector de grado, el calendario de fecha y los botones "Día anterior" y "Día siguiente"]

---

## 2. Paso a paso

### Pasar asistencia

1. Elige el grado y la sección.
2. Elige la fecha. Por defecto es el día de hoy.
3. Para cada alumno, haz clic en uno de los cuatro botones:
   - **"Presente"**
   - **"Ausente"**
   - **"Justificado"**
   - **"Retardado"**
4. Si marcaste **"Ausente"** o **"Justificado"**, aparece un campo para escribir
   el motivo (*"Observación (opcional)..."*).
5. Haz clic en **"Guardar asistencia"**. Mientras guarda dirá **"Guardando..."**.

Verás **"Asistencia guardada correctamente."**.

### Corregir la asistencia de un día anterior

1. Usa **"Día anterior"** o el calendario para ir a esa fecha.
2. La lista carga lo que se guardó ese día.
3. Cambia lo que haga falta y vuelve a guardar.

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Grado | Sí | Elegido de la lista | Sección a la que pasas lista |
| Fecha | Sí | `dd/MM/yyyy` | Día del pase de lista |
| Estado | Sí, por alumno | Presente / Ausente / Justificado / Retardado | Situación del alumno ese día |
| Observación | No | Texto, hasta 200 caracteres | Motivo de la falta o nota del día. Solo aparece con "Ausente" o "Justificado" |

### Qué significa cada estado

| Estado | Cuándo usarlo |
|--------|---------------|
| **Presente** | El alumno asistió normalmente |
| **Ausente** | No vino y no hay justificación |
| **Justificado** | No vino, pero la falta está justificada (reposo, permiso) |
| **Retardado** | Vino, pero llegó tarde |

---

## 4. Qué pasa después

- La asistencia queda guardada para ese alumno y esa fecha. **Hay un solo
  registro por alumno y por día**: si vuelves a guardar, se reemplaza el
  anterior.
- Queda constancia de quién registró la asistencia.
- Cada cambio se guarda en el historial, con el usuario y el valor anterior.
- La asistencia se refleja en el indicador de asistencia que ve el representante
  en el Portal de Familias.
- No se envía ningún correo automático al guardar.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Selecciona grado y fecha." | Falta uno de los dos filtros. | Elige ambos. |
| "No hay alumnos registrados en este grado." | Esa sección no tiene alumnos matriculados. | Verifica las inscripciones. |
| "No se pudo cargar la asistencia." | Falló la consulta. | Recarga la página. |
| "Se requieren los parámetros grado_seccion y fecha." | Faltó un dato al consultar. | Vuelve a seleccionar grado y fecha. |
| "Formato de fecha inválido. Use YYYY-MM-DD." | La fecha llegó mal formada. | Usa el calendario en vez de escribirla. |
| "No tienes permisos para registrar asistencia en esta sección." | Esa sección no te corresponde. | Solo el docente asignado o control de estudios puede pasarla. |
| "No tienes permisos para consultar la asistencia de esta sección." | Igual, al consultar. | Pide acceso a Dirección. |

---

## 6. Advertencias

⚠️ **Guardar reemplaza lo que había ese día.** Solo existe un registro por alumno
y por fecha: si guardas de nuevo, lo anterior se pierde de la vista (aunque queda
en el historial).

⚠️ **Revisa siempre la fecha antes de guardar.** Es fácil pasar lista de hoy
estando parado en el día de ayer.

⚠️ La asistencia es un dato oficial del expediente del alumno. Corregirla después
queda registrado con tu nombre.
