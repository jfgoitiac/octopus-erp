# 18 · Docentes

## Para qué sirve

Registra a los docentes del colegio, sus datos profesionales y qué materias
dicta cada uno. Un docente registrado aquí es el que después entra al Portal
Docente a cargar notas y asistencia.

## Quién puede usarlo

**Director** y **Sistemas**.

## Cómo llegar

Menú lateral → **Académico** → **"Docentes"**.

---

## 1. Qué muestra la pantalla

El título **"Docentes"** con la descripción **"Gestiona los docentes del colegio
y sus materias asignadas."**.

Arriba, el buscador *"Buscar por nombre o especialidad"*. Debajo, la lista de
docentes con sus materias asignadas.

[CAPTURA: listado de docentes con sus especialidades y materias asignadas]

---

## 2. Paso a paso

### Registrar un docente

> Antes de esto, la cuenta de usuario del docente debe existir. La crea Sistemas
> desde el módulo [Sistemas](37-sistemas.md), con el rol **Docente**.

1. Abre el formulario de docente nuevo.
2. En **"Usuario (rol docente)"** elige la cuenta correspondiente
   (*"Selecciona un usuario..."*).
3. Completa **"Título académico"**, **"Especialidad"**, **"Fecha de ingreso"**,
   **"Teléfono"** y **"Email institucional"**.
4. Si el colegio tiene varias sedes, elige la **"Sede"** o déjala en **"Sin
   asignar"**.
5. Escribe lo que haga falta en **"Observaciones"**.
6. Deja marcado **"Docente activo"**.
7. Guarda. Verás **"Docente agregado correctamente."**.

### Editar un docente

1. Ábrelo desde el listado.
2. Cambia lo que necesites y guarda. Verás **"Docente actualizado
   correctamente."**.

### Asignar materias

1. Abre la opción de asignar materias del docente.
2. Marca las materias que va a dictar.
3. Guarda. Verás **"Materias asignadas correctamente."**.

Si el colegio todavía no tiene materias creadas, verás **"No hay materias
registradas."**.

### Desactivar un docente ⚠️

1. Quita la marca de **"Docente activo"**, o usa la opción de desactivar.
2. Guarda. Verás **"Docente desactivado."**.

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Usuario (rol docente) | Sí | Elegido de la lista | La cuenta con la que el docente entra al sistema. Cada usuario puede vincularse a un solo docente |
| Título académico | No | Texto | Por ejemplo, `Licenciada en Educación` |
| Especialidad | No | Texto | Área que domina |
| Fecha de ingreso | No | `dd/MM/yyyy` | Cuándo empezó a trabajar en el colegio |
| Teléfono | No | Texto | Contacto |
| Email institucional | No | `correo@ejemplo.com` | Correo del colegio |
| Sede | No | Elegida de la lista, o "Sin asignar" | A qué plantel pertenece |
| Observaciones | No | Texto | Notas internas |
| Docente activo | Sí | Sí / No | Si está en funciones |

---

## 4. Qué pasa después

- El docente puede entrar por `/login` con su usuario y contraseña, y el sistema
  lo lleva directo al **Portal Docente**.
- Ve únicamente las materias que le asignaste, y dentro de ellas a sus alumnos.
- Puede cargar notas, pasar asistencia, registrar incidentes de sus secciones y
  conversar con los representantes de esos alumnos.
- Sus materias también aparecen en su horario.
- Cada cambio de la ficha del docente queda en el historial.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Selecciona el usuario del docente." | No elegiste la cuenta. | Elígela de la lista. Si no aparece, créala en "Sistemas" con rol Docente. |
| "No se pudieron cargar los docentes." | Falló la consulta. | Recarga la página. |
| "No se pudieron cargar las materias." | Falló la lista de materias. | Recarga y vuelve a intentar. |
| "No hay materias registradas." | El colegio no tiene materias creadas. | Créalas en "Materias". |
| "No tienes permisos para crear docentes." | Tu rol no puede. | Pídelo a Director o Sistemas. |
| "No tienes permisos para editar docentes." | Igual, al editar. | Pídelo a Director o Sistemas. |
| "No tienes permisos para desactivar docentes." | Igual, al desactivar. | Pídelo a Director o Sistemas. |
| "No tienes permisos para asignar materias." | Tu rol no puede asignar. | Pídelo a Director o Sistemas. |
| "materias debe ser una lista de ids." | Error al enviar la asignación. | Vuelve a marcar las materias y guarda. |
| "Docente no encontrado." | Ese docente ya no existe. | Recarga el listado. |
| "Este acceso es exclusivo para docentes." | Una cuenta sin rol docente intentó entrar al portal. | Revisa el rol en "Sistemas". |

---

## 6. Advertencias

⚠️ **Desactivar un docente le quita el acceso al Portal Docente.** Deja de ver sus
materias, sus alumnos y sus mensajes. Las notas que ya cargó se conservan.

⚠️ **Quitarle una materia le quita el acceso a esa sección al instante**, incluso
si el lapso está a medio cargar.

⚠️ **Un mismo usuario no puede estar vinculado a dos docentes.** Si te
equivocaste, corrige la ficha en vez de crear otra.
