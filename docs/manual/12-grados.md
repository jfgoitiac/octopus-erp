# 12 · Grados (Matrículas por Grado)

## Para qué sirve

Muestra la lista de alumnos matriculados en cada grado y sección, y te deja
exportarla en Excel o PDF. Es la pantalla para sacar el listado oficial de una
sección.

> La creación de grados y el ajuste de cupos **no** se hacen aquí, sino en
> [Configuración](36-configuracion.md).

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Secretaria**.

## Cómo llegar

Menú lateral → **Principal** → **"Grados"**.

---

## 1. Qué muestra la pantalla

Arriba, el título **"Matrículas por Grado"** y debajo un resumen como
`8 grados activos · 214 alumnos en total`.

A la izquierda, el panel **"Seleccionar Grado"** con la lista de grados. Si no
hay ninguno, dirá **"Sin grados activos"**.

A la derecha, mientras no elijas nada, verás **"Selecciona un grado"** y
**"El listado de matrícula aparecerá aquí"**.

Al elegir un grado aparece la tabla con las columnas **"#"**, **"Cédula
Escolar"**, **"Nombres"** y **"Apellidos"**.

[CAPTURA: pantalla "Matrículas por Grado" con el panel de grados a la izquierda y el listado de alumnos a la derecha]

---

## 2. Paso a paso

### Ver la matrícula de una sección

1. En **"Seleccionar Grado"**, haz clic en el grado y sección que quieras.
2. La tabla de alumnos se carga a la derecha.

### Buscar un alumno dentro de la sección

1. Escribe en el campo *"Buscar alumno..."*.
2. La lista se filtra mientras escribes.

### Cambiar el orden del listado

1. Abre el selector de orden.
2. Elige **"Alfabético"** (por apellido) o **"Por Cédula"**.

### Exportar el listado

1. Haz clic en **"Excel"** o en **"PDF"**, según lo que necesites.
2. Verás **"Archivo EXCEL descargado."** o **"Archivo PDF descargado."**.

---

## 3. Campos del formulario

Esta pantalla no guarda información.

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Grado | Sí, para ver la lista | Elegido del panel | La sección cuya matrícula quieres ver |
| Buscar alumno | No | Texto libre | Filtra dentro de la sección |
| Ordenar alumnos | No | Alfabético / Por Cédula | Cómo se ordena el listado |

---

## 4. Qué pasa después

Se descarga el archivo. Nada cambia en el sistema: no se mueve ningún alumno de
sección ni se modifican cupos.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Sin grados activos" | No hay grados creados. | Créalos en "Configuración". |
| "Selecciona un grado" | Todavía no elegiste nada. | Haz clic en un grado del panel izquierdo. |
| La sección aparece vacía | Nadie está matriculado ahí todavía. | Verifica las inscripciones del período. |
| "El grado *X* no ha sido configurado en el sistema." | Ese grado no existe. | Créalo en "Configuración". |

---

## 6. Advertencias

Esta pantalla no realiza ninguna acción irreversible.

⚠️ Los listados exportados contienen cédulas y nombres de menores de edad.
Manéjalos con cuidado.
