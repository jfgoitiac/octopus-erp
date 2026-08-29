# 11 · Representantes

## Para qué sirve

Es el banco de representantes: papás, mamás y tutores. Aquí registras sus datos,
ves qué hijos tienen en el colegio, ajustas su cuota de Proyecto de Inversión y
—lo más importante— les activas el acceso al Portal de Familias.

## Quién puede usarlo

**Director**, **Administrador**, **Secretaria**, **Cajero** y **Cobranza**.

## Cómo llegar

Menú lateral → **Principal** → **"Representantes"**.

---

## 1. Qué muestra la pantalla

Arriba, el buscador *"Buscar por nombre, cédula o correo…"* y un filtro
**"Mínimo de alumnos"** (*"Mín. alumnos"*) para encontrar familias con varios
hijos. A la derecha, el botón **"Exportar a Excel"**.

Debajo, la tabla de representantes. Al hacer clic en uno se abre su ficha
lateral, con sus datos, la lista de sus alumnos y el bloque **"Acceso al
Portal"**.

Si no tiene hijos cargados, la ficha dirá **"Sin alumnos registrados."**.

[CAPTURA: listado de representantes con la ficha lateral abierta mostrando el bloque "Acceso al Portal"]

---

## 2. Paso a paso

### Buscar un representante

1. Escribe el nombre, la cédula o el correo en el buscador.
2. Si quieres ver solo familias con varios hijos, escribe un número en
   **"Mínimo de alumnos"**.

### Registrar un representante

1. Abre el formulario de alta.
2. Completa **"Cédula"**, **"Nombre"**, **"Apellido"**, **"Teléfono"**,
   **"Correo"** y **"Dirección"**.
3. Guarda. Verás **"Representante registrado."**.

### Editar un representante

1. Abre su ficha y entra a editar.
2. Cambia lo que necesites. Aquí también puedes ajustar el **"Proyecto de
   Inversión del período activo (USD)"**.
3. Guarda. Verás **"Representante actualizado."**.

### Activar el acceso al portal

1. Abre la ficha del representante.
2. Busca el bloque **"Acceso al Portal"**.
3. Haz clic en **"Activar acceso al portal"**.

Verás **"Acceso al portal activado. Contraseña inicial: V-12345678"** — la
contraseña inicial es su propia cédula.

A partir de ahí el estado del portal se muestra como **"Activo"** o
**"Desactivado"**.

### Restablecer la clave de un representante

1. En el bloque **"Acceso al Portal"**, haz clic en **"Restablecer clave"**
   (*"Restablecer contraseña a la cédula"*).
2. Verás **"Contraseña restablecida a la cédula: V-12345678"**.

El representante deberá cambiarla la primera vez que entre.

### Desactivar o reactivar el acceso

- Para quitarle el acceso, usa **"Desactivar acceso al portal"**. Verás
  **"Acceso al portal desactivado."**.
- Para devolvérselo, usa **"Reactivar acceso"**.

### Exportar el listado

Haz clic en **"Exportar a Excel"**. Verás **"Archivo Excel descargado."**.

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula | Sí | `V-12345678` | Documento del representante. No puede repetirse: es la llave del sistema |
| Nombre | Sí | Texto | Nombre del representante |
| Apellido | Sí | Texto | Apellido del representante |
| Teléfono | Sí | Texto | Número de contacto |
| Correo | Sí | `correo@ejemplo.com` | Aquí llegan las facturas, avisos de mora y la clave del portal |
| Dirección | Sí | Texto | Domicilio de la familia |
| Proyecto de Inversión del período activo (USD) | No | Número con dos decimales | Cuota del período. Se cobra **una sola vez por representante**, no por hijo |

---

## 4. Qué pasa después

**Al activar el acceso al portal:**

- Se crea la cuenta del representante en el Portal de Familias.
- Su contraseña inicial es su cédula.
- Queda marcado para cambiar la clave la primera vez que entre.
- Si el colegio tiene las notificaciones activas, le llega un correo de
  bienvenida.

**Al desactivar el acceso:** el representante deja de poder entrar al portal de
inmediato. Sus datos y su historial de pagos no se tocan.

**Al ajustar el Proyecto de Inversión:** cambia el monto que ese representante
debe en el período activo. Si queda impago, **bloquea la inscripción de todos sus
hijos**.

**Al eliminar un representante:** queda desactivado, no borrado. Verás
**"Representante eliminado."**.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Ya existe un representante con esta cédula." | Esa cédula ya está registrada. | Búscalo en vez de crearlo otra vez. |
| "Ingrese un correo electrónico válido." | El correo está mal escrito. | Usa `correo@ejemplo.com`. |
| "Error al cargar la lista de representantes." | Falló la consulta al sistema. | Recarga la página. |
| "No se pudieron cargar los alumnos del representante." | No se pudo leer la lista de hijos. | Cierra y vuelve a abrir la ficha. |
| "No existe ningún representante con esa cédula." | La cédula no está en el sistema. | Verifica el número o registra al representante. |
| "Debe indicar la cédula del representante." | Falta la cédula. | Complétala. |
| "Sin alumnos registrados." | Ese representante no tiene hijos vinculados. | Vincúlalos al inscribirlos. |
| "El representante de este alumno no tiene acceso activo al portal." | La familia no tiene el portal habilitado. | Actívalo desde su ficha. |
| "No se encontró el representante en la base de datos." | Se eliminó o nunca existió. | Regístralo. |

---

## 6. Advertencias

⚠️ **La contraseña inicial del portal es la cédula del representante.** Insiste en
que la cambie la primera vez que entre.

⚠️ **Restablecer la clave la deja otra vez igual a la cédula.** La clave anterior
deja de servir al instante.

⚠️ **Desactivar el acceso corta la entrada al portal de inmediato.** La familia
dejará de ver su estado de cuenta y no podrá subir comprobantes.

⚠️ **Dejar el Proyecto de Inversión impago bloquea a toda la familia.** Ninguno de
sus hijos podrá inscribirse hasta que se pague.

⚠️ **Nunca crees un representante duplicado.** Si la cédula ya existe, usa la
ficha existente: de lo contrario los pagos de la familia quedan repartidos entre
dos registros y el estado de cuenta deja de cuadrar.
