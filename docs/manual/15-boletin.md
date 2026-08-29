# 15 · Boletines de Calificaciones

## Para qué sirve

Arma el boletín de un alumno para un lapso: lo muestra en pantalla para
revisarlo y lo descarga en PDF listo para imprimir y entregar a la familia.

## Quién puede usarlo

Solo el **Director**.

## Cómo llegar

Menú lateral → **Académico** → **"Boletines"**.

---

## 1. Qué muestra la pantalla

El título **"Boletines de Calificaciones"** con la descripción **"Genera y
descarga el boletín académico de cada alumno"**.

Debajo, un buscador de alumno (*"Nombre o cédula escolar..."*), un selector
**"Seleccionar lapso..."** y el botón **"Vista previa"**.

Mientras no elijas nada, verás **"Busca un alumno y selecciona un lapso para
generar el boletín."**.

[CAPTURA: pantalla "Boletines de Calificaciones" con el buscador de alumno, el selector de lapso y el botón "Vista previa"]

---

## 2. Paso a paso

### Generar un boletín

1. Escribe el nombre o la cédula escolar del alumno en el buscador.
2. Selecciona al alumno de la lista que aparece.
3. Elige el lapso en **"Seleccionar lapso..."**.
4. Haz clic en **"Vista previa"**. Mientras carga dirá **"Cargando..."**.
5. El boletín se dibuja en pantalla, con el encabezado **"BOLETÍN DE
   CALIFICACIONES"**, la lista de materias con sus notas, el **"Promedio
   General"**, y los espacios de firma **"Director(a)"** y **"Firma del
   Representante"**.
6. Cada materia aparece marcada como **"Aprobado"** o **"Reprobado"**.
7. Haz clic en **"Descargar PDF"** para obtener el archivo.

[CAPTURA: vista previa del boletín con las materias, el promedio general y los espacios de firma]

---

## 3. Campos del formulario

Esta pantalla no guarda información: solo lee las notas ya cargadas.

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Buscar alumno | Sí | Nombre o cédula escolar | A quién le vas a generar el boletín |
| Lapso | Sí | Elegido de la lista | De qué lapso son las calificaciones |

---

## 4. Qué pasa después

- Se descarga un PDF con el boletín del alumno.
- **No se modifica ninguna nota.** Esta pantalla solo lee lo que cargaron los
  docentes en [Notas](14-notas.md).
- No se envía ningún correo automático al generar el boletín.

### Cómo se calcula

- Cada materia muestra su **nota definitiva**, que es el promedio de las
  evaluaciones cargadas.
- Se considera **"Aprobado"** con 10 puntos o más, y **"Reprobado"** por debajo
  de 10.
- El **"Promedio General"** solo toma en cuenta las materias con nota numérica.
  Las materias calificadas con letras (A/B/C) aparecen en el boletín pero no
  entran en el promedio.
- Las materias marcadas como que no cuentan para el promedio quedan fuera del
  cálculo aunque tengan notas.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Selecciona un alumno." | No elegiste alumno. | Búscalo y haz clic en su nombre. |
| "Selecciona un lapso." | No elegiste lapso. | Elígelo de la lista. |
| "Error al buscar alumnos." | Falló la búsqueda. | Revisa tu conexión y reintenta. |
| "No se pudieron cargar los lapsos." | No se pudo leer la lista de lapsos. | Recarga la página. |
| "No se pudo cargar el boletín." | El boletín no se pudo armar. | Verifica que el alumno tenga notas en ese lapso. |
| "Se requieren los parámetros alumno_id y lapso_id." | Faltó uno de los dos filtros. | Vuelve a seleccionarlos. |
| El boletín sale con materias vacías | Los docentes no han cargado esas notas. | Revisa en "Notas" o pide a los docentes que carguen. |
| El promedio general sale en blanco | Todas las materias del alumno son literales (A/B/C). | Es correcto: esas materias no promedian. |

---

## 6. Advertencias

⚠️ **Un boletín generado con notas incompletas se entrega con notas
incompletas.** Antes de imprimir, revisa que todas las materias tengan sus
calificaciones cargadas.

⚠️ **El PDF es una foto del momento.** Si un docente corrige una nota después, el
boletín ya impreso queda desactualizado: hay que volver a generarlo.

⚠️ El boletín contiene datos académicos de un menor. Entrégalo solo al
representante registrado.
