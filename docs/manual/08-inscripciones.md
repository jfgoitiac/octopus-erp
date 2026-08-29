# 08 · Inscripciones

## Para qué sirve

Es donde se matricula a un estudiante para el período escolar. El sistema te
lleva de la mano por cuatro pasos: primero el representante, luego el alumno,
luego el grado y, al final, la confirmación. Al terminar, genera el comprobante
de inscripción y carga automáticamente la cuota de inscripción.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Secretaria**.

## Cómo llegar

Menú lateral → **Principal** → **"Inscripciones"**.

---

## 1. Qué muestra la pantalla

Arriba, el título **"Admisión Octopus"** con la descripción **"Módulo de control
de matriculación y nuevos ingresos"**.

Debajo, una barra de progreso con los cuatro pasos:

1. **"Representante"**
2. **"Alumno"**
3. **"Inscripción"**
4. **"Confirmar"**

[CAPTURA: pantalla "Admisión Octopus" con la barra de progreso de cuatro pasos en el primer paso]

---

## 2. Paso 1 — Representante

1. Escribe la cédula del representante en el campo de búsqueda
   (*"V-12345678"*).
2. El sistema busca solo. Mientras lo hace dirá **"Buscando representante…"**.
   - **Si ya existe**, se cargan sus datos.
   - **Si no existe**, completa el formulario: **"Nombre"**, **"Apellido"**,
     **"Parentesco"**, **"Teléfono"**, **"Correo electrónico"**,
     **"Dirección de habitación"**, **"Nacionalidad"** y **"Nivel de estudio"**.
3. Si el representante existía pero le faltan datos, verás el aviso **"Este
   representante tiene datos obligatorios pendientes por completar."** y se abre
   la ventana **"Completar datos del representante"**.
4. Haz clic en el botón de continuar.

Si guardaste cambios verás **"Datos del representante actualizados."**.

---

## 3. Paso 2 — Alumno

1. Si el representante ya tiene hijos en el colegio, aparecerán listados: elige
   uno o crea un alumno nuevo.
2. Completa los datos: **"Nombre"**, **"Apellido"**, **"Fecha de nacimiento"**,
   **"Género"** (Masculino / Femenino / No especifica), **"Lugar de
   nacimiento"**, **"País"**, **"Estado"**, **"Peso (kg)"**, **"Estatura (cm)"**,
   **"Institución de procedencia"**, **"Bautizado"** (Sí / No) y **"Alérgico
   a"**.
3. La **"Cédula Escolar (Opcional)"** puedes dejarla en blanco: el sistema la
   genera solo (*"Se autogenera si se deja en blanco"*).
4. Si quieres, haz clic en **"Subir foto"** para agregar la foto del estudiante.
   Para quitarla, usa **"Quitar foto"**.
5. Haz clic en continuar.

Si el alumno ya existía con datos incompletos, verás **"Este alumno tiene datos
obligatorios pendientes por completar."** y se abrirá **"Completar datos del
estudiante"**.

### Requisitos de la foto

- Formatos aceptados: JPG, PNG o WEBP.
- Tamaño máximo: 5 MB.

---

## 4. Paso 3 — Inscripción

1. Verás el **"Período Escolar"** activo (por ejemplo `2025-2026`). Si dice
   **"No configurado"**, detente: hay que configurarlo primero en
   [Configuración](36-configuracion.md).
2. Elige el grado y la sección. Cada opción muestra cuántos cupos quedan
   (`12 cupos`) o la palabra **"Lleno"** si ya no hay.
3. En **"Tipo de ingreso"** elige **"Nuevo"** o **"Regular"**.
4. Marca **"Documentos completos"** si la familia ya entregó todos los recaudos.
5. Haz clic en continuar.

[CAPTURA: paso "Detalles de inscripción" con el período escolar, la lista de grados con sus cupos y el selector de tipo de ingreso]

---

## 5. Paso 4 — Confirmar

1. Revisa el resumen de todo lo que cargaste.
2. Haz clic en **"Confirmar Registro"**.

Si todo está bien, aparece la pantalla **"¡Inscripción Exitosa!"** con el nombre
del estudiante y el grado, y el botón **"Descargar Comprobante"**.

3. Haz clic en **"Descargar Comprobante"** para obtener el PDF. Mientras lo
   prepara dirá **"Generando comprobante…"**.

[CAPTURA: pantalla "¡Inscripción Exitosa!" con el botón "Descargar Comprobante"]

---

## 6. Campos del formulario

### Representante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula | Sí | `V-12345678` | Documento del representante. Es la llave: no puede repetirse |
| Nombre | Sí | Texto | Nombre del representante |
| Apellido | Sí | Texto | Apellido del representante |
| Parentesco | Sí | Padre / Madre / Tutor / Otro | Relación con el estudiante |
| Teléfono | Sí | Texto | Número de contacto |
| Correo electrónico | Sí | `correo@ejemplo.com` | Aquí llegan las facturas y avisos de cobranza |
| Dirección de habitación | Sí | Texto | Domicilio de la familia |
| Nacionalidad | No | Texto | Nacionalidad del representante |
| Nivel de estudio | No | Texto | Grado de instrucción |

### Alumno

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre | Sí | Texto | Nombre del estudiante |
| Apellido | Sí | Texto | Apellido del estudiante |
| Fecha de nacimiento | Sí | `dd/MM/yyyy` | Fecha de nacimiento |
| Género | Sí | Masculino / Femenino / No especifica | Género del estudiante |
| Cédula Escolar | No | Texto | Si la dejas vacía, el sistema la genera |
| Lugar de nacimiento, País, Estado | No | Texto | Dónde nació |
| Peso (kg), Estatura (cm) | No | Número | Datos de salud escolar |
| Institución de procedencia | No | Texto | Colegio anterior |
| Bautizado | No | Sí / No | Dato solicitado por el colegio |
| Alérgico a | No | Texto | Alergias conocidas |
| Foto | No | JPG, PNG o WEBP, máximo 5 MB | Foto del estudiante |

### Inscripción

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Período Escolar | Automático | `2025-2026` | Lo toma de Configuración; no se escribe a mano |
| Grado y sección | Sí | Elegido de la lista | Dónde queda matriculado. Solo se puede elegir si hay cupo |
| Tipo de ingreso | Sí | Nuevo / Regular | "Nuevo" es primer ingreso al colegio |
| Documentos completos | No | Sí / No | Si ya entregó todos los recaudos |

---

## 7. Qué pasa después

Al confirmar la inscripción, el sistema hace todo esto de una sola vez:

1. **Guarda o actualiza al representante.** Si estaba dado de baja, lo reactiva.
2. **Guarda o actualiza al alumno**, y le asigna el día límite de pago que esté
   configurado en el colegio.
3. **Crea la inscripción** con el grado, la sección y el tipo de ingreso.
4. **Descuenta un cupo** del grado elegido.
5. **Carga automáticamente la cuota de inscripción** del período, con el monto
   por defecto configurado en el sistema.
6. **Carga la cuota de Proyecto de Inversión** del representante, si aún no la
   tenía para ese período. Ojo: esta cuota es **por representante**, no por
   alumno: si tiene tres hijos, se cobra una sola vez.
7. **Genera el comprobante de inscripción en PDF**, que puedes descargar de
   inmediato o volver a bajar después desde
   [Consulta de Inscripción](09-consulta-inscripcion.md).

Si el colegio tiene activadas las notificaciones, sale un correo con el
comprobante de inscripción al representante.

### Antes de inscribir, el sistema revisa la deuda

La inscripción **se bloquea** si el alumno o su representante tienen algo
pendiente. El sistema revisa, en este orden:

| Revisión | Qué bloquea |
|----------|-------------|
| Inscripción repetida | Que ya esté inscrito en ese mismo período |
| Cuota de inscripción impaga | Una inscripción anterior sin pagar |
| Proyecto de Inversión impago | Bloquea a **todos** los hijos de ese representante |
| Solvencia impaga | Solo si el monto asignado es mayor a cero |
| Mensualidades vencidas | Meses anteriores sin pagar, o el mes actual si ya pasó el día límite |
| Cupo | Que quede al menos un cupo libre en la sección |

Los alumnos **becados** quedan exentos de la revisión de mensualidades.

---

## 8. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Completa los campos obligatorios antes de continuar." | Falta llenar algo del paso actual. | Revisa los campos marcados. |
| "Ya existe un representante con esta cédula." | Esa cédula ya está registrada. | Búscala en el paso 1 en vez de crearla de nuevo. |
| "Ingrese un correo electrónico válido." | El correo está mal escrito. | Usa el formato `correo@ejemplo.com`. |
| "*Nombre Apellido* ya está inscrito/a para el período 2025-2026." | Ya tiene inscripción en ese período. | Consulta el comprobante en "Consulta de Inscripción". |
| "*Nombre Apellido* tiene una cuota de inscripción pendiente del período … Debe realizar los pagos pendientes antes de continuar." | Debe una inscripción anterior. | Cobra esa cuota en "Cobranza" y vuelve a intentar. |
| "El representante … tiene el Proyecto de Inversión pendiente del período … Debe realizar el pago antes de inscribir a cualquiera de sus representados." | La cuota del representante está impaga. | Cóbrala. Bloquea a todos sus hijos. |
| "*Nombre Apellido* tiene una solvencia pendiente del período … " | Tiene solvencia asignada y sin pagar. | Cóbrala en "Cobranza". |
| "*Nombre Apellido* tiene mensualidades pendientes desde Marzo 2026 …" | Debe meses anteriores. | Cóbralos o acuerda con la familia. |
| "El grado *X* no ha sido configurado en el sistema." | Ese grado no existe en "Grados". | Créalo en el módulo "Grados". |
| "No hay cupos disponibles para *X*. Capacidad máxima de 25 alcanzada." | La sección está llena. | Elige otra sección o amplía el cupo en "Grados". |
| "No hay período escolar activo configurado." | Falta definir el período. | Configúralo en "Configuración". |
| "No se pudo completar la inscripción por un conflicto de datos. Por favor, verifique e intente de nuevo." | Dos personas guardaron a la vez. | Vuelve a intentar. |
| "La foto supera el límite de 5 MB." | La imagen pesa demasiado. | Usa una foto más liviana. |
| "Formato no permitido. Solo JPG, PNG o WEBP." | El archivo no es una imagen aceptada. | Convierte la foto a JPG o PNG. |
| "La inscripción se registró, pero la foto no pudo subirse. Puedes agregarla luego desde la ficha del alumno." | La inscripción sí quedó; solo falló la foto. | Sube la foto después desde "Alumnos". |
| "No se encontró el ID de la inscripción." | Se perdió la referencia al generar el comprobante. | Descárgalo desde "Consulta de Inscripción". |
| "Comprobante no encontrado. Intenta descargarlo desde el historial." | El PDF no está disponible en ese momento. | Ve a "Consulta de Inscripción". |
| "No se pudo generar el comprobante. Intenta nuevamente." | Falló la creación del PDF. | Reintenta; si sigue, avisa a Sistemas. |

---

## 9. Advertencias

⚠️ **La inscripción ocupa un cupo de inmediato.** Si te equivocas de sección, el
cupo queda tomado hasta que se corrija.

⚠️ **Confirmar la inscripción genera cobros reales.** Se crea la cuota de
inscripción del período y, si corresponde, la cuota de Proyecto de Inversión del
representante. No es un borrador.

⚠️ **La cédula del representante es la llave del sistema.** Si la escribes mal,
crearás un representante duplicado y los pagos de la familia quedarán repartidos
entre dos fichas. Verifica siempre antes de continuar.

⚠️ **No se puede inscribir a un alumno con deuda vencida.** No intentes rodear el
bloqueo: primero se cobra o se registra el acuerdo.
