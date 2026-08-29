# 30 · Notificaciones automáticas

## Para qué sirve

Configura por dónde salen los avisos del colegio (correo y WhatsApp) y cada
cuántos días se envían los recordatorios de cobranza. Es lo que hace que las
familias reciban solas los avisos de factura y mora, sin que nadie tenga que
llamar una por una.

## Quién puede usarlo

**Director** y **Sistemas**. Cualquier otro rol verá **"Acceso Restringido"**.

## Cómo llegar

Menú lateral → **Sistema** → **"Notificaciones"**.

---

## 1. El cronograma de cobranza automática

Esta es la parte más importante del módulo. Por cada mensualidad impaga, el
sistema envía cuatro avisos:

| Momento | Qué pasa | A quién |
|---------|----------|---------|
| **Día 0** | Aviso de la factura, el día en que vence | Al representante |
| **Día 5** | Primer recordatorio | Al representante |
| **Día 10** | Segundo aviso | Al representante |
| **Día 15** | Alerta de mora | **Al director del colegio** |

Los días 5, 10 y 15 son los valores por defecto: puedes cambiarlos desde esta
pantalla. El día 0 es fijo.

### Cómo decide el sistema cuándo enviar

- Cada día por la mañana, el sistema revisa **todas las mensualidades impagas de
  alumnos activos**.
- Calcula la fecha de vencimiento de cada una usando el **día límite de pago** de
  ese alumno (por defecto, el 5 de cada mes).
- Si hoy es exactamente el día 0, 5, 10 o 15 después del vencimiento, dispara el
  aviso correspondiente.
- **Antes de enviar, vuelve a comprobar que la mensualidad siga impaga.** Si la
  familia ya pagó, el aviso no sale.

---

## 2. Paso a paso

### Cambiar el cronograma de recordatorios

1. Baja hasta **"Cronograma de recordatorios de mora"**.
2. Escribe los días en los tres campos:
   - **"Primer recordatorio (días)"** — por defecto `5`
   - **"Segundo aviso (días)"** — por defecto `10`
   - **"Alerta al director (días)"** — por defecto `15`
3. Haz clic en **"Guardar cronograma"**.

Verás **"Cronograma de recordatorios guardado."**.

> Los tres números deben ser positivos y **cada uno mayor que el anterior**.

[CAPTURA: bloque "Cronograma de recordatorios de mora" con los tres campos de días]

### Configurar el correo

El colegio puede tener un remitente distinto por área. En **"Área (email)"**
elige **"Cobranza"** o **"Control de Estudios"** y configura cada una por
separado.

1. Marca **"Activo"** para habilitar el envío de esa área.
2. Completa el **"Servidor SMTP"**, el **"Puerto"**, el **"Usuario SMTP"**, la
   **"Contraseña SMTP"** y el **"Remitente (From)"**.
3. Decide si marcas **"Usar TLS (ignorado si el puerto es 465 — se usa SSL)"**.
4. Escribe el **"Email del Director"**: ahí llega la alerta del día 15.
5. Haz clic en **"Guardar configuración email"**.

Verás **"Configuración de email guardada."**.

### Configurar WhatsApp

1. Marca la casilla de WhatsApp activo.
2. Elige el **"Proveedor"**: **"Twilio"** o **"Meta Business API"**.
3. Según el proveedor, completa sus datos:
   - Twilio: **"Account SID"**, **"Auth Token"** y **"Número WhatsApp Twilio
     (From)"**.
   - Meta: **"Phone Number ID"** y **"Token de acceso (Meta)"**.
4. Escribe el **"WhatsApp del Director (alertas día 15)"**.
5. Haz clic en **"Guardar configuración WhatsApp"**.

Verás **"Configuración de WhatsApp guardada."**.

### Probar que funciona

1. Ve al bloque de prueba, abajo.
2. Elige el **"Canal"**: **"Email"**, **"WhatsApp"** o **"Ambos"**.
3. Escribe el **"Email destino"** o el **"Número destino"**, según el canal.
4. Si quieres, escribe un **"Mensaje (opcional)"**.
5. Haz clic en **"Enviar prueba"**.

Verás **"Prueba enviada."**. También existe **"Probar conexión"** para verificar
los datos del servidor sin mandar un mensaje.

[CAPTURA: bloque de prueba con el selector de canal, el destino y el botón "Enviar prueba"]

---

## 3. Campos del formulario

### Cronograma

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Primer recordatorio (días) | Sí | Número positivo, ej. `5` | Días después del vencimiento para el primer recordatorio |
| Segundo aviso (días) | Sí | Número mayor al anterior, ej. `10` | Días para el segundo aviso |
| Alerta al director (días) | Sí | Número mayor al anterior, ej. `15` | Días para avisar al director |

### Correo

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Área (email) | Sí | Cobranza / Control de Estudios | Qué remitente estás configurando |
| Activo | Sí | Sí / No | Si esa área envía correos |
| Servidor SMTP | Sí | Texto, ej. `smtp.hostinger.com` | Servidor de salida del correo |
| Puerto | Sí | Número, ej. `465` | Puerto del servidor |
| Usuario SMTP | Sí | Texto | Usuario de la cuenta de correo |
| Contraseña SMTP | Sí | Contraseña de aplicación | Clave de la cuenta |
| Remitente (From) | Sí | `Cobranza <cobranza@colegio.edu.ve>` | Cómo aparece el remitente |
| Usar TLS | No | Sí / No | Se ignora si el puerto es 465 |
| Email del Director | Sí | `director@colegio.edu.ve` | Donde llega la alerta del día 15 |

### WhatsApp

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| WhatsApp activo | Sí | Sí / No | Si se envían mensajes por WhatsApp |
| Proveedor | Sí | Twilio / Meta Business API | Qué servicio se usa |
| Account SID | Sí con Twilio | Texto, ej. `ACxxxxxxxx…` | Identificador de la cuenta Twilio |
| Auth Token | Sí con Twilio | Texto | Clave de la cuenta Twilio |
| Número WhatsApp Twilio (From) | Sí con Twilio | `+14155238886` | Número emisor |
| Phone Number ID | Sí con Meta | Texto | Identificador del número en Meta Business |
| Token de acceso (Meta) | Sí con Meta | Token permanente | Clave de acceso de Meta |
| WhatsApp del Director (alertas día 15) | Sí | `+58 4XX XXXXXXX` | Donde llega la alerta al director |

---

## 4. Qué pasa después

Además de los avisos de mora, el sistema envía correo automático en estos casos:

| Situación | Quién lo recibe |
|-----------|-----------------|
| Se activa el acceso al portal de un representante | El representante, con su clave inicial |
| El representante pide recuperar su contraseña | El representante, con un enlace de un solo uso |
| Se registra un pago | El representante, como confirmación |
| La familia sube un comprobante | El equipo de cobranza |
| Se completa una inscripción | El representante, con el comprobante |
| Se publica una circular | Todos los representantes con portal activo |
| Llega un mensaje entre docente y representante | El destinatario |

Todos los envíos quedan registrados con su canal, su destinatario y si salieron
bien o fallaron.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Los días deben ser positivos y crecientes (recordatorio 1 < recordatorio 2 < alerta al director)." | Los números están en desorden o en cero. | Usa por ejemplo 5, 10 y 15. |
| "El envío de prueba falló — revisa la configuración." | Los datos del servidor están mal. | Revisa servidor, puerto, usuario y contraseña. |
| "Error al enviar prueba." | No se pudo contactar al servicio. | Verifica la conexión del servidor. |
| "Error al cargar la configuración de notificaciones." | Falló la consulta. | Recarga la página. |
| "Acceso Restringido" | Tu rol no puede entrar aquí. | Solo Director y Sistemas. |
| "No configurado" | Ese canal todavía no tiene datos. | Complétalo y guarda. |
| Las familias no reciben nada | El área de correo puede estar desactivada, o las familias no tienen correo cargado. | Revisa "Activo" y los correos en "Representantes". |
| Llegan avisos de cuotas ya pagadas | El pago pudo registrarse después de disparado el aviso. | Verifica el pago en "Comprobantes". |

---

## 6. Advertencias

⚠️ **Cambiar el cronograma afecta a todo el colegio.** Los nuevos plazos se
aplican a partir de la siguiente revisión diaria.

⚠️ **Las contraseñas y tokens que cargues aquí dan acceso al correo y al WhatsApp
del colegio.** No los compartas ni los dejes escritos fuera del sistema.

⚠️ **Desactivar el correo apaga todos los avisos automáticos**, no solo los de
mora: también la bienvenida al portal, la recuperación de contraseña y las
confirmaciones de pago.

⚠️ **Prueba siempre después de cambiar la configuración.** Un dato mal escrito
deja al colegio sin avisos y nadie se entera hasta que alguien reclama.
