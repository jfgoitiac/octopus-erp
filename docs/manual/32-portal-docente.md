# 32 · Portal Docente

## Para qué sirve

Es la pantalla del maestro. Ahí ve sus materias, carga las notas, pasa
asistencia, arma el plan de evaluación, publica material de estudio, registra
incidentes y conversa con los representantes de sus alumnos.

## Quién puede usarlo

Solo los usuarios con rol **Docente**. La cuenta la crea Sistemas y la ficha del
docente se carga en [Docentes](18-docentes.md).

## Cómo llegar

Entra por `/login` con tu usuario y contraseña. El sistema te lleva directo al
Portal Docente. Si intentas abrir una pantalla administrativa, verás **"Los
docentes deben ingresar desde el Portal Docente."**.

---

## 1. Las secciones del portal

| Sección | Para qué es |
|---------|-------------|
| **"Inicio"** | Resumen del día: próximas clases, pendientes y avisos |
| **"Materias"** | Tus materias, y dentro de cada una: notas, asistencia, plan y material |
| **"Mensajes"** | Conversaciones con los representantes |
| **"Incidentes"** | Registro disciplinario de tus alumnos |
| **"Perfil"** | Tus datos y tu foto |
| **"Cambiar contraseña"** | Actualizar tu clave |
| **"Salir"** | Cerrar sesión |

[CAPTURA: pantalla de "Inicio" del Portal Docente con las próximas clases, el resumen de pendientes y las acciones rápidas]

---

## 2. Inicio

Muestra:

- **"Próxima clase"** y **"Próximas clases"** de tu horario.
- **"Resumen de pendientes"**. Si estás al día, dirá **"Vas al día con tus planes
  de evaluación."**.
- **"Acciones rápidas"** para saltar a lo que más usas.
- **"Progreso de notas"**. Si aún no cargaste nada, dirá **"Sin promedios
  registrados aún."**.
- **"Actividad de la semana"** — *"Mensajes enviados e incidentes registrados por
  día."*.
- **"Evaluaciones próximas"**. Si no hay, **"No hay evaluaciones próximas
  registradas."**.
- Alertas de alumnos en riesgo. Si no hay, **"Ningún alumno en riesgo por
  ahora."** — *"Cuando un promedio baje del umbral, te avisamos aquí."*.
- Un calendario. Los días sin nada dicen **"Sin eventos este día."**.

### Agregar un evento al calendario

1. Abre el calendario y elige el día.
2. Completa **"Título"**, **"Tipo"**, **"Fecha"**, **"Hora (opcional)"** y
   **"Descripción (opcional)"**.
3. Guarda. Verás **"Evento agregado al calendario."**.

Para quitarlo, usa la opción de eliminar: verás **"Evento eliminado."**.

---

## 3. Materias

En **"Mis Materias"** verás cada materia con su grado y sección, bajo el
subtítulo **"Notas, asistencia y material de estudio"**. Si no tienes ninguna,
dirá **"Todavía no tienes materias asignadas."**.

Al abrir una materia hay cuatro pestañas.

### 3.1 "Notas"

1. Elige el lapso en **"Seleccionar lapso..."**. Si no eliges, dirá **"Selecciona
   un lapso para ver las notas."**.
2. Escribe las notas de cada alumno.
3. Guarda. Verás **"Notas guardadas correctamente."**.

Si la sección está vacía, dirá **"No hay alumnos registrados en esta sección."**.

### 3.2 "Asistencia"

1. Elige la fecha.
2. Marca a cada alumno como Presente, Ausente, Justificado o Retardado.
3. Guarda. Verás **"Asistencia guardada correctamente."**.

### 3.3 "Plan de Evaluación"

Define cómo se calcula la nota de la materia en ese lapso.

1. Elige el lapso. Si no, dirá **"Selecciona un lapso para ver el plan de
   evaluación."**.
2. Crea un bloque con su **"Nombre del bloque"** (*"Ej: Contenido,
   Actitudinal..."*).
3. Elige el **"Modo"**: **"Suma de puntos"** o **"Promedio"**.
4. Agrega los **"Ítems"** con su nombre (*"Nombre del ítem (ej: Exposición)"*) y
   sus puntos máximos (*"Pts máx."*).
5. El sistema muestra el **"Total de puntos"** del bloque.
6. Guarda.

Para quitar algo, usa **"Eliminar bloque"** o **"Eliminar ítem"**.

[CAPTURA: pestaña "Plan de Evaluación" con un bloque, sus ítems y el total de puntos]

### 3.4 "Material"

1. Publica un material con su título (*"Ej. Guía de laboratorio N°3"*) y el
   enlace o archivo (*"https://..."*).
2. Guarda. Verás **"Material publicado correctamente."**.

Si no hay nada publicado, dirá **"Todavía no hay material publicado."**. Para
quitarlo, usa **"Eliminar material"**: verás **"Material eliminado."**.

---

## 4. Mensajes

**"Conversaciones con representantes"**.

1. Para escribirle a una familia, usa **"Nueva conversación"** y elige al alumno.
2. Escribe y envía.

Las conversaciones sin leer aparecen marcadas como **"Sin leer"**. Si no tienes
ninguna, dirá **"Todavía no tienes conversaciones."**.

> **La conversación siempre la inicia el docente.** El representante solo puede
> responder.

---

## 5. Incidentes

**"Registro disciplinario de tus alumnos"**.

1. Elige el **"Alumno"** — solo aparecen los de tus secciones.
2. Escribe la **"Descripción"**.
3. Elige la **"Severidad"**: Leve, Moderado o Grave.
4. Adjunta una foto si hace falta.
5. Guarda. Verás **"Incidente registrado correctamente."**.

Si no hay ninguno, dirá **"No hay incidentes registrados."**.

---

## 6. Perfil y contraseña

En **"Perfil"** — *"Gestiona tu información personal"* — puedes ver y actualizar
tu **"Información personal"**: **"Nombre"**, **"Apellido"**, **"Correo
electrónico"** y **"Usuario"**, y cambiar tu foto. Verás **"Foto de perfil
actualizada."**.

En **"Cambiar contraseña"** — *"Actualiza tus credenciales de acceso"* —
escribes tu clave actual y la nueva, dos veces.

---

## 7. Campos del formulario

### Evento del calendario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Título | Sí | Texto | Nombre del evento |
| Tipo | Sí | Recordatorio / Evaluación / Reunión / Entrega / Otro | Qué clase de evento es |
| Fecha | Sí | `dd/MM/yyyy` | Cuándo ocurre |
| Hora | No | `HH:mm` | A qué hora |
| Descripción | No | Texto | Detalle adicional |

### Plan de evaluación

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre del bloque | Sí | Texto | Agrupa varias evaluaciones |
| Modo | Sí | Suma de puntos / Promedio | Cómo se combinan los ítems del bloque |
| Nombre del ítem | Sí | Texto | Cada evaluación concreta |
| Pts máx. | Sí | Número | Puntaje máximo del ítem |

### Material de estudio

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Título | Sí | Texto | Nombre del material |
| Enlace o archivo | Sí | Dirección web o archivo | Lo que verán los alumnos |

---

## 8. Qué pasa después

- Las notas que cargas se ven de inmediato en el boletín, en Rendimiento y en el
  portal de la familia.
- La asistencia alimenta el indicador que ve el representante.
- Los incidentes quedan en el expediente del alumno, con tu nombre.
- Los mensajes le llegan al representante como notificación.
- **Solo puedes trabajar sobre tus materias y tus secciones.** El sistema lo
  verifica en cada operación.

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Todavía no tienes materias asignadas." | Nadie te asignó materias. | Pídelo a Dirección o Sistemas. |
| "No hay un lapso activo." | El colegio no tiene lapso abierto. | Espera a que control de estudios lo cree. |
| "El lapso está cerrado — no se pueden registrar ni editar notas." | Ese lapso ya se cerró. | Habla con el Director. |
| "El lapso está cerrado — no se puede crear ni editar el plan de evaluación." | Igual, con el plan. | Habla con el Director. |
| "No se pudo guardar ninguna nota (3 errores)." | Varias notas quedaron fuera de escala o hubo un fallo. | Revisa que cada nota esté entre 0 y 20. |
| "No tienes permisos para registrar notas en esta materia." | Esa materia no es tuya. | Verifica tus asignaciones. |
| "No tienes una materia asignada en la sección de este alumno." | Ese alumno no es tuyo. | Solo puedes actuar sobre tus secciones. |
| "No tienes permisos para registrar asistencia en esta sección." | Esa sección no es tuya. | Verifica tus materias. |
| "Solo docentes pueden iniciar una conversación." | La familia intentó escribir primero. | Escríbele tú primero. |
| "Ya existe un plan de evaluación para esta materia y lapso. Use PATCH para editarlo." | Ya lo creaste. | Edítalo en vez de crear otro. |
| "No existe un plan de evaluación para esta materia y lapso. Use POST para crearlo." | Todavía no lo has creado. | Créalo desde la pestaña "Plan de Evaluación". |
| "El ítem no pertenece al plan de evaluación de esta materia/lapso." | Se intentó calificar un ítem ajeno. | Recarga el plan y vuelve a intentar. |
| "No se pudo cargar tu horario." | Falló la consulta. | Recarga la página. |
| "No se pudieron cargar los mensajes." | Falló la consulta. | Recarga la página. |
| "No se pudo cargar el material de estudio." | Falló la consulta. | Recarga la página. |
| "La imagen no puede superar 5MB." | La foto pesa demasiado. | Usa una más liviana. |
| "La contraseña debe tener al menos 8 caracteres." | La clave nueva es corta. | Usa 8 o más. |
| "Las contraseñas nuevas no coinciden." | Las dos claves nuevas son distintas. | Escríbelas de nuevo. |

---

## 10. Advertencias

⚠️ **Guardar la asistencia reemplaza lo que había ese día.** Revisa la fecha antes
de guardar.

⚠️ **Cada nota que cambias queda registrada con tu nombre**, la fecha y el valor
anterior.

⚠️ **Un incidente registrado queda en el expediente del alumno.** Describe hechos,
no opiniones.

⚠️ **Si el lapso se cierra, ya no podrás corregir notas.** Termina de cargarlas
antes del cierre.

⚠️ **Eliminar un material o un bloque del plan de evaluación no se puede
deshacer.**
