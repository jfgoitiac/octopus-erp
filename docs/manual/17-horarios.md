# 17 · Horarios de Clases

## Para qué sirve

Arma la grilla horaria de cada grado: qué materia se dicta cada día, a qué hora y
en qué aula. Puedes construirla clase por clase o dejar que el sistema la genere
automáticamente a partir de las horas académicas de cada materia.

## Quién puede usarlo

**Director** y **Sistemas**.

## Cómo llegar

Menú lateral → **Académico** → **"Horarios"**.

---

## 1. Qué muestra la pantalla

El título **"Horarios de Clases"** con la descripción **"Visualiza y edita la
grilla horaria por grado"**.

Arriba están el selector de grado y el botón **"Generar automático"**.

Mientras no elijas grado, verás **"Selecciona un grado para ver el horario."**.
Si el grado no tiene clases todavía, verás **"Este grado aún no tiene clases."**
y **"Haz clic en cualquier celda para agregar la primera clase."**.

A un lado hay un panel de materias del grado, para tenerlas a la vista mientras
armas la grilla.

[CAPTURA: pantalla "Horarios de Clases" con el selector de grado, el botón "Generar automático" y la grilla de la semana]

---

## 2. Paso a paso

### Agregar una clase

1. Elige el grado.
2. Haz clic en la celda del día y la hora donde quieres poner la clase.
3. En la ventana que se abre, completa:
   - **"Materia"** — elígela de la lista.
   - **"Día"** — Lunes, Martes, Miércoles, Jueves o Viernes.
   - **"Hora inicio"** y **"Hora fin"**.
   - **"Aula"** (opcional): *"Ej: Aula 3, Lab. Ciencias..."*.
4. Guarda. Verás **"Clase agregada al horario."**.

### Editar o eliminar una clase

1. Haz clic sobre la clase en la grilla.
2. Cambia lo que necesites y guarda: verás **"Clase actualizada."**.
3. Para quitarla, usa la opción de eliminar: verás **"Clase eliminada."**.

### Generar el horario automáticamente

1. Elige el grado.
2. Haz clic en **"Generar automático"**.
3. Configura la ventana:
   - **"Horas por día"** — cuántos bloques de clase tiene el día.
   - **"Duración clase (min)"** — 45, 60 o 90 minutos.
   - **"Hora de inicio"** y **"Hora de fin"** de la jornada.
   - **"Recreos / Recesos"** — agrega cada receso con su hora y duración en
     minutos. Para quitar uno, usa **"Eliminar recreo"**.
   - Marca los días de clase. Debe haber al menos uno.
4. Haz clic en **"Generar horario automático"**.

Al terminar verás **"18 clases generadas correctamente."**. Si el sistema tuvo
que hacer concesiones, dirá **"18 clases generadas con advertencias."** y
mostrará **"El horario se generó con las siguientes advertencias:"** con la
lista. Ciérralo con **"Entendido — ver horario generado"**.

[CAPTURA: ventana del generador automático con las horas por día, la duración de clase y los recreos configurados]

---

## 3. Campos del formulario

### Clase individual

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Materia | Sí | Elegida de la lista | Qué se dicta en ese bloque |
| Día | Sí | Lunes a Viernes | Día de la semana |
| Hora inicio | Sí | `07:00` a `16:00`, en bloques de una hora | Cuándo empieza la clase |
| Hora fin | Sí | `08:00` a `17:00` | Cuándo termina. Debe ser posterior a la de inicio |
| Aula | No | Texto | Dónde se dicta, por ejemplo `Aula 3` |

### Generador automático

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Horas por día | Sí | Número | Cuántos bloques de clase tiene cada día |
| Duración clase (min) | Sí | 45, 60 o 90 | Cuánto dura cada bloque |
| Hora de inicio | Sí | `HH:mm` | Inicio de la jornada |
| Hora de fin | Sí | `HH:mm` | Fin de la jornada |
| Recreos / Recesos | No | Hora y minutos | Pausas dentro de la jornada |
| Días de clase | Sí, al menos uno | Lunes a Viernes | Qué días se dicta clase |

---

## 4. Qué pasa después

- La clase queda fija en la grilla del grado.
- El docente asignado a esa materia la ve en su horario dentro del Portal
  Docente.
- El generador automático reparte las materias según sus **horas académicas**
  (las que cargaste en [Materias](13-materias.md)): si una materia tiene 4 horas
  semanales, intentará colocarle cuatro bloques.
- Si el generador no logra colocar todo, igual crea el horario y te avisa con
  advertencias qué quedó pendiente.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Completa todos los campos obligatorios." | Falta materia, día u horas. | Complétalos. |
| "La hora de fin debe ser posterior a la de inicio." | Las horas están invertidas. | Corrígelas. |
| "Ya existe una clase en ese horario. Elige otro día u hora." | Ese bloque ya está ocupado. | Elige otra celda o edita la clase existente. |
| "Sin materias registradas para este grado" | El grado no tiene materias. | Créalas en "Materias" antes de armar el horario. |
| "Selecciona al menos un día de clases." | No marcaste ningún día en el generador. | Marca al menos uno. |
| "Selecciona un grado primero" | Intentaste generar sin elegir grado. | Elige el grado. |
| "No se pudo cargar el horario." | Falló la consulta. | Recarga la página. |
| "No se pudo generar el horario." | El generador falló. | Revisa que el grado tenga materias con horas académicas. |
| "No tienes permisos para crear horarios." | Tu rol no puede. | Pídelo a Director o Sistemas. |
| "No tienes permisos para eliminar horarios." | Igual, al eliminar. | Pídelo a Director o Sistemas. |
| "Horario no encontrado." | Esa clase ya no existe. | Recarga la grilla. |

---

## 6. Advertencias

⚠️ **Eliminar una clase no se puede deshacer.** Tendrás que volver a crearla a
mano.

⚠️ **El generador automático escribe sobre el grado completo.** Si ya tenías un
horario armado a mano, revisa el resultado antes de darlo por bueno.

⚠️ **El horario depende de las horas académicas de cada materia.** Si una materia
tiene mal ese número, el generador la repartirá mal.
