# 10 · Alumnos

## Para qué sirve

Es el listado de todos los estudiantes del colegio: su ficha, su grado, su
estatus financiero y sus cuotas. Desde aquí registras un alumno en el banco
estudiantil, corriges sus datos, le ajustas la mensualidad, lo retiras o lo
reactivas.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador**, **Cobranza**, **Cajero** y
**Secretaria**. En el menú lateral aparece para Director, Sistemas,
Administrador y Cobranza.

## Cómo llegar

Menú lateral → **Principal** → **"Alumnos"**.

---

## 1. Qué muestra la pantalla

Arriba, a la derecha:

- **"Registrar Alumno"** — para dar de alta un estudiante nuevo.
- **"Excel"** — descarga el listado completo.
- **"Configuración"** — abre el panel de montos globales.
- El botón de sincronizar la tasa BCV.

Debajo, el buscador *"Buscar Estudiante..."* y la tabla de alumnos.

Cada fila tiene una barra de acciones:

| Botón | Qué hace |
|-------|----------|
| **"Ver Ficha"** | Abre la ficha lateral del estudiante |
| **"Editar Información"** | Abre el formulario completo de datos |
| **"Asignar Grado"** | Le pone grado y sección |
| **"Quitar Grado"** | Le retira el grado asignado |
| **"Ajustar Deuda"** | Cambia los montos de sus mensualidades |
| **"Ajustar Inscripción"** | Cambia el monto de su cuota de inscripción |
| **"Ir a Cobranza"** | Salta al módulo de caja con ese alumno |
| **"Retirar Alumno"** | Da de baja al estudiante |
| **"Reactivar Alumno"** | Vuelve a activar a un retirado |

[CAPTURA: listado de alumnos con el buscador arriba y la barra de acciones de una fila]

---

## 2. Paso a paso

### Registrar un alumno nuevo

1. Haz clic en **"Registrar Alumno"**. Se abre la ventana **"Registrar en Banco
   Estudiantil"**.
2. Completa el bloque **"Datos del Estudiante"**: nombres, apellidos, fecha de
   nacimiento, género y el resto de la información. La **"Cédula Escolar
   (Opcional)"** se genera sola si la dejas vacía.
3. Completa el bloque **"Datos del Representante"**: cédula, nombre, apellido,
   parentesco, teléfono, correo y dirección.
   - Si la cédula ya existe, verás **"Representante encontrado. Datos
     precargados."** o **"Se reasignará al representante existente: …"**.
4. Guarda.

Verás **"Alumno registrado en el banco exitosamente."**.

> Registrar un alumno en el banco **no lo inscribe**. La inscripción del período
> se hace en [Inscripciones](08-inscripciones.md).

### Ver la ficha de un estudiante

1. Haz clic en **"Ver Ficha"**.
2. Se abre un panel lateral con **"Nombre"**, **"Contacto"**, **"Detalles
   Académicos"** y **"Representante Legal"**.
3. Ciérralo con **"Cerrar ficha"**.

### Editar los datos de un alumno

1. Haz clic en **"Editar Información"**. Se abre la ventana **"Editar
   Información"**.
2. Modifica lo que necesites. Aquí también se controla la parte financiera del
   alumno:
   - **"Estatus Financiero"** — Solvente, En Mora o Becado Total.
   - **"Porcentaje Beca (%)"**.
   - **"Solvencia del período activo (USD)"** y **"Concepto de la solvencia"**
     (por ejemplo, *"Ej: Mes de junio"*).
   - **"Proyecto de Inversión del representante (USD)"**.
3. Guarda. Verás **"Información actualizada correctamente."**.

### Asignar o quitar el grado

1. Haz clic en **"Asignar Grado"**. Se abre **"Asignar Grado / Año"**.
2. Elige el grado y la sección y confirma. Verás **"Grado *X* asignado
   correctamente."**.

Para quitarlo, usa **"Quitar Grado"** y confirma. Verás **"Grado removido
correctamente."**.

### Ajustar la mensualidad de un alumno

1. Haz clic en **"Ajustar Deuda"**. Se abre **"Ajustar Mensualidades"**.
2. Puedes cambiar mes por mes, o usar **"Cambiar todas las cuotas:"** para poner
   el mismo monto en todas (*"Ej: 30"*).
3. Guarda. Verás **"¡Mensualidades actualizadas correctamente!"**.

### Ajustar la cuota de inscripción

1. Haz clic en **"Ajustar Inscripción"**. Se abre **"Ajustar Inscripción"**.
2. Escribe el monto nuevo y guarda. Verás **"¡Monto de inscripción actualizado
   correctamente!"**.

### Retirar un alumno ⚠️

1. Haz clic en **"Retirar Alumno"**. Se abre **"Procesar Retiro"**.
2. Escribe el motivo (*"Motivo del retiro..."*).
3. Confirma.

Verás **"Alumno retirado y cupo liberado."**.

### Reactivar un alumno retirado

1. Haz clic en **"Reactivar Alumno"**.
2. Confirma.

Verás **"Alumno reactivado exitosamente."**. El sistema vuelve a tomar un cupo
del grado, así que la reactivación falla si la sección está llena.

### Cambiar los montos globales del colegio ⚠️

1. Haz clic en **"Configuración"**. Se abre el panel **"Montos Globales"**.
2. Ajusta los tres valores:
   - **"Mensualidad ($)"**
   - **"Inscripción ($)"**
   - **"Proyecto de Inversión ($, por representante)"**
3. Guarda. Verás **"Configuración actualizada globalmente."**.
4. Cierra el panel con **"Cerrar configuración"**.

[CAPTURA: panel "Montos Globales" con los tres campos de monto]

### Exportar el listado

1. Haz clic en **"Excel"**.
2. Verás **"Archivo Excel descargado."**.

### Actualizar la tasa BCV

Haz clic en el botón **"Sincronizar tasa BCV"**. Verás **"Sincronización con BCV
completada."**.

---

## 3. Campos del formulario

### Datos del estudiante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombres | Sí | Texto | Nombre del estudiante |
| Apellidos | Sí | Texto | Apellido del estudiante |
| Cédula Escolar (Opcional) | No | Texto | Si la dejas vacía, el sistema la genera |
| Fecha de Nacimiento | Sí | `dd/MM/yyyy` | Fecha de nacimiento |
| Género | Sí | Masculino / Femenino / No especifica | Género registrado |
| Lugar de Nacimiento, País de Nacimiento, Estado de Nacimiento | No | Texto | Dónde nació |
| Peso (kg), Estatura (cm) | No | Número | Datos de salud escolar |
| Institución de Procedencia | No | Texto | Colegio anterior |
| Bautizado | No | Sí / No | Dato solicitado por el colegio |
| Alérgico a | No | Texto | Alergias conocidas |
| Grado / Año | No | Elegido de la lista | Grado y sección actual |

### Datos financieros del alumno

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Estatus Financiero | Sí | Solvente / En Mora / Becado Total | "Becado Total" exime al alumno del control de mora |
| Porcentaje Beca (%) | No | Número de 0 a 100 | Descuento aplicado |
| Solvencia del período activo (USD) | No | Número con dos decimales | Cargo de solvencia del período. Si es 0, no se exige |
| Concepto de la solvencia | No | Texto | A qué corresponde, por ejemplo `Mes de junio` |
| Proyecto de Inversión del representante (USD) | No | Número con dos decimales | Cuota del representante para ese período |

### Datos del representante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula | Sí | `V-12345678` | Documento del representante |
| Nombres, Apellidos | Sí | Texto | Nombre completo |
| Parentesco con el Representante | Sí | Padre / Madre / Tutor / Otro | Relación con el estudiante |
| Teléfono | Sí | Texto | Contacto |
| Correo Electrónico | Sí | `correo@ejemplo.com` | Donde llegan avisos y facturas |
| Dirección de Habitación | Sí | Texto | Domicilio |
| Nacionalidad, Nivel de Estudio | No | Texto | Datos complementarios |

### Montos globales

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Mensualidad ($) | Sí | Número con dos decimales | Monto por defecto de las mensualidades nuevas |
| Inscripción ($) | Sí | Número con dos decimales | Monto por defecto de la cuota de inscripción |
| Proyecto de Inversión ($, por representante) | Sí | Número con dos decimales | Cuota por defecto del Proyecto de Inversión |

### Retiro

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Motivo del retiro | Sí | Texto | Por qué se da de baja al estudiante |

---

## 4. Qué pasa después

**Al registrar un alumno:** queda guardado en el banco estudiantil, con su
representante vinculado. Todavía no está inscrito ni tiene cuotas del período.

**Al retirar un alumno:**

- Su estado cambia a retirado y deja de aparecer en los listados activos.
- **Se libera el cupo** de su sección, que queda disponible para otro estudiante.
- El motivo queda guardado.
- Sus pagos y su historial se conservan.

**Al reactivar un alumno:** se vuelve a tomar un cupo del grado. Si la sección
está llena, la reactivación no se puede completar.

**Al ajustar mensualidades o inscripción:** cambian los montos que el alumno
debe. Si el monto sube por encima de lo ya pagado, la cuota vuelve a contar como
pendiente y el alumno puede entrar en mora.

**Al cambiar los montos globales:** los nuevos valores se aplican a lo que se
genere de ahí en adelante. No reescriben las cuotas ya creadas de cada alumno.

Todos estos cambios quedan registrados en **Auditoría**.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Nombre/Apellido del alumno y Nombre/Cédula del representante son obligatorios." | Faltan datos mínimos. | Complétalos. |
| "Error al verificar representante." | Falló la consulta de la cédula. | Revisa tu conexión y reintenta. |
| "Ya existe un representante con esta cédula." | Esa cédula ya está en el sistema. | Usa el representante existente, no crees otro. |
| "Ingrese un correo electrónico válido." | Correo mal escrito. | Usa `correo@ejemplo.com`. |
| "Ingrese un monto válido mayor a 0." | El monto está vacío o es cero o negativo. | Escribe un monto mayor que cero. |
| "No hay mensualidades cargadas para actualizar." | Ese alumno todavía no tiene mensualidades generadas. | Genéralas desde "Cobranza". |
| "No hay cuota de inscripción cargada para actualizar." | Ese alumno no tiene cuota de inscripción. | Se crea al inscribirlo. |
| "El alumno ya está retirado." | Ya lo diste de baja. | Nada que hacer. |
| "El alumno ya está activo." | Ya está activo. | Nada que hacer. |
| "El alumno no tiene un grado asignado." | Falta asignarle grado. | Usa "Asignar Grado". |
| "No tiene permiso para modificar el monto de solvencia." | Tu rol no puede cambiar ese campo. | Pídelo al Director. |
| "Error técnico: no se localizó el ID del estudiante." | Se perdió la referencia en pantalla. | Recarga la página y vuelve a intentar. |
| "No se enviaron mensualidades para actualizar." | Guardaste sin cambiar nada. | Modifica al menos un monto. |
| "No tiene acceso a este alumno." | El alumno pertenece a otra sede. | Cambia de sede en el selector. |

---

## 6. Advertencias

⚠️ **Retirar un alumno libera su cupo de inmediato.** Si otra familia lo toma, ya
no podrás reactivarlo en esa sección hasta ampliar el cupo.

⚠️ **Subir el monto de una mensualidad ya cobrada la vuelve a dejar pendiente.**
El alumno puede pasar a mora y recibir los avisos automáticos de cobranza.

⚠️ **Los "Montos Globales" afectan a todo el colegio.** No los cambies para
resolver el caso de un alumno: para eso están "Ajustar Deuda" y "Ajustar
Inscripción" en su fila.

⚠️ **Marcar a un alumno como "Becado Total" lo saca del control de mora.** Deja
de aparecer en Morosos y deja de recibir avisos de cobranza.
