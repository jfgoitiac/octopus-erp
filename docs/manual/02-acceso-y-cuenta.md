# 02 · Acceso y cuenta

## Para qué sirve

Entrar al sistema, salir, cambiar tu contraseña y recuperarla si la olvidaste.
También explica cómo se crean las cuentas y quién puede reiniciar la contraseña
de otra persona.

## Quién puede usarlo

Todos los usuarios. La creación de cuentas del personal la hace el **Director** o
**Sistemas**. La activación del acceso de un representante la hace el
**Director** o **Sistemas** desde el módulo de Representantes.

## Cómo llegar

- Personal y docentes: dirección `/login`.
- Representantes: dirección `/portal/login`.

---

## 1. Entrar al sistema (personal y docentes)

1. Abre la dirección del sistema. Verás el título **"Octopus ERP"** y debajo
   **"Gestión Escolar"**.
2. Escribe tu usuario en el campo **"Usuario"** (ejemplo: `jperez`).
3. Escribe tu clave en el campo **"Contraseña"**. Puedes hacer clic en el ojo
   para ver lo que escribiste.
4. Haz clic en **"Entrar al Sistema"**.

Mientras el sistema verifica, el botón dice **"Entrando..."**.

[CAPTURA: formulario de acceso con los campos "Usuario" y "Contraseña" y el botón "Entrar al Sistema"]

### Qué pasa después

El sistema te lleva directo a tu pantalla de inicio según tu rol:

| Rol | Pantalla de inicio |
|-----|--------------------|
| Director, Administrador, Cobranza | Dashboard |
| Sistemas | Dashboard de Cobranza |
| Secretaria | Inscripciones |
| Cajero | Cantina |
| Directivo de Red | Dashboard Sedes |
| Docente | Portal Docente |

---

## 2. Entrar al portal (representantes)

1. Abre la dirección `/portal/login`. Verás **"Portal de Familias"** y debajo
   **"Accede a la información de tu representado"**.
2. En **"Cédula o correo electrónico"** escribe tu cédula con la letra y sin
   puntos (ejemplo: `V-12345678`) o tu correo.
3. Escribe tu clave en **"Contraseña"**.
4. Haz clic en **"Ingresar"**.

[CAPTURA: pantalla "Portal de Familias" con los campos de cédula y contraseña y el enlace "¿Olvidaste tu contraseña?"]

### Primera vez que entras

Si el colegio te acaba de activar el acceso, recibirás un correo de bienvenida
con una contraseña inicial. La primera vez que entres, el sistema te obligará a
cambiarla: no podrás usar ninguna otra pantalla del portal hasta que la cambies.

---

## 3. Cambiar tu contraseña

### Representante

1. En el menú del portal entra a **"Cambiar contraseña"**.
2. Escribe tu contraseña actual.
3. Escribe la nueva contraseña (mínimo 8 caracteres).
4. Repítela para confirmar.
5. Haz clic en el botón de guardar.

Verás el aviso **"¡Contraseña actualizada exitosamente!"**.

### Docente

En el Portal Docente entra a **"Cambiar contraseña"** y sigue los mismos pasos.

### Resto del personal

El personal administrativo no cambia su contraseña desde una pantalla propia:
pide a **Sistemas** o al **Director** que te la reinicie desde el módulo
**"Sistemas"**.

---

## 4. Recuperar la contraseña (solo representantes)

1. En la pantalla del portal haz clic en **"¿Olvidaste tu contraseña?"**.
2. Escribe tu cédula o tu correo en el campo indicado.
3. Envía la solicitud.
4. Revisa tu correo: recibirás un enlace de un solo uso.
5. Abre el enlace, escribe la contraseña nueva (mínimo 8 caracteres) y repítela.
6. Verás **"Contraseña actualizada correctamente"** y podrás iniciar sesión.

> El sistema **siempre** responde lo mismo, exista o no la cuenta. Es a
> propósito: así nadie puede averiguar qué cédulas tienen portal activo. Si no te
> llega el correo, lo más probable es que el colegio no tenga tu dirección
> cargada o tu acceso no esté activo: llama a la administración.

---

## 5. Reiniciar la contraseña de otra persona

### Personal (lo hace Director o Sistemas)

1. Menú lateral → **"Sistemas"**.
2. Busca al usuario en la lista.
3. Usa la opción de reiniciar contraseña y escribe la nueva.
4. Verás **"Contraseña reseteada exitosamente"**.

### Representante (lo hace Director o Sistemas)

1. Menú lateral → **"Representantes"**.
2. Busca al representante.
3. Usa la opción de activar o reiniciar el acceso al portal.
4. El sistema genera una contraseña, la envía por correo y marca la cuenta para
   que el representante deba cambiarla la primera vez que entre.

---

## 6. Cerrar sesión

1. Haz clic en el círculo con tus iniciales, arriba a la derecha.
2. Haz clic en **"Cerrar sesión"**.

En el portal de familias y en el portal docente la opción está en el menú de tu
perfil.

---

## 7. Campos del formulario

### Acceso del personal

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Usuario | Sí | Texto, sin espacios | El nombre de usuario que te asignó Sistemas (ej. `jperez`) |
| Contraseña | Sí | Mínimo 8 caracteres | Tu clave personal |

### Acceso del representante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula o correo electrónico | Sí | `V-12345678` o `correo@ejemplo.com` | Con cualquiera de los dos puedes entrar |
| Contraseña | Sí | Mínimo 8 caracteres | Tu clave personal |

### Cambio de contraseña

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Contraseña actual | Sí | La que usas hoy | Sirve para comprobar que eres tú |
| Contraseña nueva | Sí | Mínimo 8 caracteres | La clave que usarás de ahora en adelante |
| Confirmar contraseña | Sí | Igual a la anterior | Evita errores de tipeo |

---

## 8. Qué pasa después

- Al entrar, el sistema recuerda tu sesión en ese navegador. Si pasas mucho
  tiempo sin usarlo, la sesión caduca y tendrás que volver a entrar.
- Al cambiar la contraseña, la sesión sigue abierta; no te saca del sistema.
- Al activar el acceso de un representante, sale un **correo de bienvenida** con
  su contraseña inicial.
- Al pedir recuperación de contraseña, sale un **correo con un enlace de un solo
  uso**. Una vez usado, deja de servir.
- El acceso, la creación de usuarios y los cambios de rol quedan registrados en
  **Auditoría**.

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Usuario o contraseña incorrectos." | Los datos no coinciden. | Revisa mayúsculas. Si insiste, pide reinicio a Sistemas. |
| "Credenciales incorrectas. Verifica tu cédula/correo y contraseña." | Igual, en el portal de familias. | Prueba con el correo en vez de la cédula. |
| "Completa todos los campos" | Dejaste un campo vacío. | Llena los dos campos. |
| "Debe cambiar su contraseña antes de continuar." | Tu clave todavía es la inicial. | Ve a "Cambiar contraseña". |
| "La contraseña actual es incorrecta." | Escribiste mal la clave vieja. | Vuelve a intentar. |
| "La contraseña debe tener al menos 8 caracteres." | La clave nueva es muy corta. | Usa 8 o más caracteres. |
| "La nueva contraseña y la confirmación no coinciden." | Las dos claves nuevas son distintas. | Escríbelas de nuevo. |
| "Se requieren contrasena_actual y contrasena_nueva." | Faltó llenar un campo del cambio de clave. | Completa los dos campos. |
| "Los docentes deben ingresar desde el Portal Docente." | Se usó una cuenta de docente en una pantalla administrativa. | Entra por el Portal Docente. |
| "El representante de este alumno no tiene acceso activo al portal." | La familia no tiene el portal habilitado. | Actívalo desde "Representantes". |
| "No puedes desactivar tu propia cuenta administrativa" | Intentaste desactivarte a ti mismo. | Pide a otro Director que lo haga. |
| "El usuario ya se encuentra desactivado." | Esa cuenta ya estaba apagada. | No hay nada que hacer. |
| "Sesion expirada. Inicia sesion nuevamente." | Pasó el tiempo de inactividad. | Vuelve a entrar. |

---

## 10. Advertencias

⚠️ **Reiniciar la contraseña de un usuario es inmediato y no se puede deshacer.**
La clave anterior deja de funcionar de una vez. Avisa a la persona antes de
hacerlo.

⚠️ **Desactivar un usuario le corta el acceso al instante.** No borra su
historial: los pagos y registros que hizo siguen a su nombre.

⚠️ **El enlace de recuperación de contraseña es de un solo uso y caduca.** Si
pasa mucho tiempo o ya lo usaste, tendrás que solicitar uno nuevo.
