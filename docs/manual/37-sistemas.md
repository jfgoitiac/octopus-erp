# 37 · Sistemas

## Para qué sirve

Es el panel de administración técnica: crear usuarios del personal, cambiarles el
rol, reiniciar contraseñas, cargar la base de estudiantes desde un archivo,
revisar los envíos de correo y WhatsApp, y hacer respaldos.

## Quién puede usarlo

**Director** y **Sistemas**.

## Cómo llegar

Menú lateral → **Sistema** → **"Sistemas"**.

---

## 1. Las pestañas del módulo

El título es **"Panel de Sistemas"**, con la descripción **"Gestión de
identidades, permisos y configuración del sistema."**.

| Pestaña | Para qué es |
|---------|-------------|
| **"Usuarios"** | Crear y administrar las cuentas del personal |
| **"Notificaciones"** | Configurar correo y WhatsApp |
| **"Log de envíos"** | Ver qué avisos salieron y cuáles fallaron |
| **"⚠ Limpieza de datos"** | Borrado masivo de datos de prueba |

[CAPTURA: pantalla "Panel de Sistemas" con las cuatro pestañas y la lista de usuarios]

---

## 2. Usuarios

### Crear un usuario del personal

1. Entra a **"Usuarios"**.
2. Haz clic en **"Nuevo operador"**.
3. Escribe el nombre de usuario, la **"Contraseña"** (*"Mínimo 8 caracteres"*) y
   elige el rol.
4. Guarda.

> Para dar de alta un **docente**, crea aquí su usuario con rol **Docente** y
> después completa su ficha en [Docentes](18-docentes.md).

### Cambiar el rol de un usuario

1. Busca a la persona en la lista.
2. Haz clic en **"Editar rol"**.
3. Elige el **"Nuevo Rol"** y confirma.

El sistema confirma el cambio con el nombre del usuario y su nuevo rol.

### Reiniciar una contraseña

1. Haz clic en **"Restablecer contraseña"**.
2. Escribe la **"Nueva Contraseña"** (mínimo 8 caracteres).
3. Confirma.

Verás **"Contraseña reseteada exitosamente"**.

### Desactivar o reactivar un usuario

El sistema confirma la operación con el nombre del usuario desactivado o
reactivado.

### Cargar la base de estudiantes desde un archivo

1. Ve a **"Cargar base de estudiantes"**.
2. Haz clic en **"Click para elegir el archivo"** y elige el `.xlsx`.
3. Súbelo.

Al terminar verás el resumen: **"Total"**, **"Con aviso"** y **"Con error"**.

### Buscar y refrescar

Usa el buscador (*"Cédula..."*), **"Refrescar lista de usuarios"** y **"Limpiar
filtros y refrescar"**.

---

## 3. Notificaciones

Configura los mismos datos que el módulo
[Notificaciones automáticas](30-configuracion-notificaciones.md):

- **Correo**: **"Servidor SMTP"**, **"Puerto"**, **"Usuario / correo"**,
  **"Contraseña / App Password"**, **"Remitente visible"** y **"Email del
  director"**.
- **WhatsApp**: el **"Proveedor"** (**"Twilio"** o **"Meta Business API"**), con
  **"Account SID"**, **"Auth Token"** y **"Número de origen"**, o **"Phone Number
  ID"** y **"Access Token"**; más el **"WhatsApp del director (alertas día
  15)"**.

Si un canal no está configurado, aparece como **"No configurado"**.

---

## 4. Log de envíos

Muestra el historial de avisos enviados, con su canal (**"Email"**,
**"WhatsApp"** o **"Ambos"**), su destinatario y si salió bien o falló. Sirve
para responder la pregunta "¿al representante le llegó el aviso?".

---

## 5. Limpieza de datos

Esta pestaña, marcada con **"⚠ Limpieza de datos"**, hace **borrado permanente**.
Es para limpiar datos de prueba antes de poner el sistema en producción, no para
el uso diario.

Para borrar todos los alumnos, el sistema exige escribir la frase exacta
`ELIMINAR TODOS LOS ALUMNOS` en el campo *"Escribe la frase de
confirmación..."*. La pantalla advierte que la acción es **permanente e
irreversible**.

Al terminar, el sistema informa cuántos registros se eliminaron.

Existe también la **"Consola de mantenimiento"** para tareas técnicas.

---

## 6. Respaldos

Desde este módulo se genera el respaldo de la base de datos. Solo lo puede hacer
quien tenga permiso; si no, verás **"No tienes permisos para generar un
respaldo."**.

---

## 7. Campos del formulario

### Usuario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Usuario | Sí | Texto sin espacios, ej. `jperez` | Con qué nombre entra al sistema |
| Contraseña | Sí | Mínimo 8 caracteres | Clave inicial |
| Rol | Sí | Director / Sistemas / Administrador / Cobranza / Cajero / Secretaria / Directivo de Red / Docente | Qué podrá hacer |

### Restablecer contraseña

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nueva Contraseña | Sí | Mínimo 8 caracteres | La clave que tendrá la persona |

### Carga de estudiantes

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Archivo | Sí | `.xlsx` con el formato esperado | La lista de estudiantes a cargar |

### Limpieza de datos

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Frase de confirmación | Sí | Exactamente `ELIMINAR TODOS LOS ALUMNOS` | Confirma que entiendes que el borrado es permanente |

---

## 8. Qué pasa después

- Un usuario nuevo puede entrar de inmediato por `/login`, y el sistema lo lleva
  a la pantalla de su rol.
- Cambiar el rol cambia al instante lo que esa persona ve en el menú.
- Reiniciar la contraseña invalida la anterior de inmediato.
- Desactivar un usuario le corta el acceso, pero conserva su historial: los pagos
  que registró siguen a su nombre.
- La carga de estudiantes crea los alumnos en el banco estudiantil. **No los
  inscribe**: la inscripción se hace en [Inscripciones](08-inscripciones.md).
- Todas estas operaciones quedan registradas en [Auditoría](06-auditoria.md).

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "La nueva contraseña es requerida" | El campo está vacío. | Escríbela. |
| "Ingresa una nueva contraseña." | Lo mismo, en pantalla. | Escríbela. |
| "La contraseña debe tener al menos 8 caracteres." | La clave es muy corta. | Usa 8 o más. |
| "No puedes desactivar tu propia cuenta administrativa" | Intentaste desactivarte a ti mismo. | Pide a otro Director que lo haga. |
| "El usuario ya se encuentra desactivado." | Ya estaba apagado. | Nada que hacer. |
| "El usuario ya se encuentra activo." | Ya estaba activo. | Nada que hacer. |
| "El usuario no tiene perfil configurado." | Falta el perfil interno de esa cuenta. | Avisa a soporte técnico. |
| "Rol inválido. Roles válidos: …" | Ese rol no existe. | Elige uno de la lista. |
| "Se requiere el campo «rol»." | Faltó indicar el rol. | Elígelo. |
| "El campo «accion» debe ser «reactivar» o «cambiar_rol»." | La operación no se envió bien. | Recarga y vuelve a intentar. |
| "Debe adjuntar un archivo .xlsx" | El archivo no es una hoja de cálculo. | Usa un `.xlsx`. |
| "No se pudo leer el archivo. Verifique que sea un .xlsx válido con el formato esperado." | El archivo está dañado o tiene otra estructura. | Usa la plantilla del colegio. |
| "No se encontraron estudiantes reconocibles en el archivo." | Las columnas no coinciden. | Revisa los encabezados del archivo. |
| "No tienes permisos para generar un respaldo." | Tu rol no puede. | Pídelo a Sistemas. |
| "Sin permiso. Se requiere rol director o sistemas." | Tu rol no puede entrar aquí. | Pídelo a Dirección. |
| "Error al buscar registros." | Falló la consulta. | Recarga la página. |

---

## 10. Advertencias

⚠️ **La "Limpieza de datos" borra información de forma permanente e
irreversible.** No hay papelera ni deshacer. Úsala solo para vaciar datos de
prueba, con un respaldo hecho de antemano.

⚠️ **Reiniciar la contraseña de un usuario invalida la anterior de inmediato.**
Avísale antes.

⚠️ **Cambiar el rol de alguien cambia lo que puede ver y hacer al instante**,
incluidos montos, sueldos y datos de familias. Piensa bien antes de asignar
Director o Sistemas.

⚠️ **Desactivar un usuario le corta el acceso al instante.** Si está en medio de
un cobro, perderá lo que no haya guardado.

⚠️ **Haz un respaldo antes de cualquier operación masiva.**
