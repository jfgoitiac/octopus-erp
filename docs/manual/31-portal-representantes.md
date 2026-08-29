# 31 · Portal de Representantes (Portal de Familias)

## Para qué sirve

Es la aplicación que usa la familia desde su teléfono. Ahí el representante ve
cuánto debe, qué vence pronto, el historial de pagos de sus hijos, sus notas, las
circulares del colegio y el saldo de la cantina. También puede avisar de un pago
subiendo el comprobante de la transferencia.

## Quién puede usarlo

Solo los **representantes** con acceso activo. El acceso lo habilita el Director
o Sistemas desde el módulo [Representantes](11-representantes.md).

## Cómo llegar

En el navegador del teléfono, la dirección `/portal`. Para entrar por primera
vez, `/portal/login`.

---

## 1. Las secciones del portal

En la barra inferior del teléfono están las secciones principales:

| Sección | Para qué es |
|---------|-------------|
| **"Inicio"** | Estado de cuenta, próximos vencimientos y últimos pagos |
| **"Historial"** | Todos los pagos registrados |
| **"Rendimiento"** | Notas y asistencia por lapso |
| **"Mensajes"** | Conversaciones con los docentes |
| **"Comunicaciones"** | Circulares y avisos del colegio |
| **"Cantina"** | Saldo e historial de consumo de la tarjeta |
| **"Perfil"** | Datos personales y foto |
| **"Ajustes"** | Cambiar contraseña, notificaciones y **"Salir"** |

[CAPTURA: pantalla de "Inicio" del portal en un teléfono, con el saldo, la deuda pendiente y los accesos rápidos]

---

## 2. Inicio

Arriba verás tu situación en un vistazo:

- Si no debes nada: **"Solvente — al día con los pagos"**, en verde.
- Si debes: **"Deuda pendiente"** con el monto, en rojo.

Debajo:

- **"Próximos vencimientos"** — lo que está por vencer.
- **"Últimos pagos"** — los pagos más recientes, con acceso a **"Ver
  historial"**.
- **"Avisos"** — si hay circulares sin leer. Si no hay, dirá **"Estás al día con
  las comunicaciones del colegio."**.
- **"Pagar por transferencia"** — el botón para reportar un pago.

### Si tienes varios hijos

Arriba aparece un selector de estudiante. Cambia de hijo y toda la pantalla se
actualiza: su deuda, sus notas, su cantina.

---

## 3. Reportar un pago por transferencia

Este es el uso más importante del portal.

1. En **"Inicio"**, toca **"Pagar por transferencia"**.
2. Se abre **"Subir comprobante"**. Arriba verás **"Datos para transferencia:"**
   con las cuentas del colegio.
3. Haz la transferencia desde tu banco, fuera del portal.
4. Vuelve al portal y sube el comprobante:
   - **"Cámara"** para tomarle una foto.
   - **"Archivo"** para elegir uno que ya tengas.
   - Si te equivocaste, usa **"Quitar archivo"**.
5. Elige el **"Método de pago"**: **"Transferencia Bancaria"**, **"Pago
   Móvil"**, **"Zelle"** o **"Punto de Venta"**.
6. Escribe el número de referencia de la transacción. Es obligatorio.
7. Envía.

Verás **"Comprobante enviado correctamente. Pendiente de revisión."** y en la
pantalla quedará **"Comprobante enviado. En revisión."**.

[CAPTURA: ventana "Subir comprobante" con los datos bancarios del colegio, los botones de Cámara y Archivo, y el campo de referencia]

### Requisitos del archivo

| Requisito | Valor |
|-----------|-------|
| Formatos | JPG, PNG, WEBP o PDF |
| Tamaño máximo | 10 MB |

### Estados del comprobante

| Estado | Qué significa |
|--------|---------------|
| **Pendiente de revisión** | El colegio todavía no lo verificó |
| **Aprobado** | El pago fue aceptado y tu cuota quedó saldada |
| **Rechazado** | El colegio no lo aceptó; te indicará el motivo |

---

## 4. Las demás secciones

### Historial de pagos

Muestra **"Historial de pagos"** con el **"Registro completo de tus pagos"**.
Puedes descargar el recibo de cada uno. Si no hay ninguno, dirá **"No hay pagos
registrados aún."**.

### Rendimiento

Muestra **"Notas y asistencia por lapso"**, con el **"Promedio General por
Lapso"**, las notas por materia y el indicador de **"Asistencia"**.

### Mensajes

**"Conversaciones con los docentes"**. Puedes responder con el campo *"Responder
al docente..."*.

> La conversación **la inicia siempre el docente**. Hasta que él escriba, no
> podrás enviar el primer mensaje.

### Comunicaciones

**"Circulares y avisos del colegio"**. Al abrir una circular que lo pide, se
marca como leída: verás **"Circular marcada como leída."**. Si no hay ninguna,
dirá **"No hay circulares publicadas."**.

### Cantina

Muestra el **"Saldo y consumo de la tarjeta de cantina"** y el **"Historial de
consumo"**. Desde aquí también se recarga la tarjeta, con el mismo procedimiento
del comprobante: **"Moneda"** (**"USD ($)"** o **"VES (Bs.)"**), **"Monto"**,
**"Banco receptor (del colegio)"**, **"Banco de procedencia (tuyo)"**,
referencia y comprobante. Al enviarla verás **"Recarga enviada, será revisada en
breve"**.

Si el alumno no tiene tarjeta, dirá **"Sin tarjeta de cantina"**. Si nunca ha
consumido, **"Aún no hay consumos registrados."**.

### Perfil

**"Gestiona tu información personal"**: **"Nombre"**, **"Apellido"**,
**"Correo electrónico"**, **"Teléfono"** y **"Cambiar foto de perfil"**.

### Ajustes

Desde aquí puedes **"Cambiar contraseña"**, **"Activar notificaciones"** en el
teléfono y **"Cerrar sesión"**.

---

## 5. Campos del formulario

### Subir comprobante

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Archivo | Sí | JPG, PNG, WEBP o PDF, máximo 10 MB | Foto o PDF del comprobante bancario |
| Método de pago | Sí | Transferencia / Pago Móvil / Zelle / Punto de Venta | Cómo pagaste |
| Referencia | Sí | El número que te dio el banco | Identifica la transacción |

### Recargar la tarjeta de cantina

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Moneda | Sí | USD ($) / VES (Bs.) | En qué moneda pagaste |
| Monto | Sí | Número mayor a cero | Cuánto recargas |
| Banco receptor (del colegio) | Sí | Elegido de la lista | Dónde depositaste |
| Banco de procedencia (tuyo) | No | Texto, ej. `Banesco` | Desde qué banco pagaste |
| Referencia | Sí | Texto | Número de la transacción |
| Comprobante | Sí | JPG, PNG, WEBP o PDF, máximo 10 MB | Respaldo del pago |

---

## 6. Qué pasa después

**Al subir un comprobante:**

1. Queda guardado como **pendiente de revisión** y el equipo de cobranza recibe
   el aviso.
2. **La deuda no se salda todavía.** La cuota sigue pendiente hasta que el
   colegio apruebe el comprobante.
3. Cuando lo aprueban, la mensualidad queda pagada y se crea el pago
   correspondiente. Recibirás la confirmación por correo.
4. Si lo rechazan, la deuda sigue tal cual y el colegio te indica el motivo.

**Al recargar la tarjeta de cantina:** la recarga queda en revisión. El saldo
sube cuando el colegio la aprueba.

### Los controles antifraude

El sistema rechaza el comprobante si detecta cualquiera de estas situaciones:

| Situación | Por qué se rechaza |
|-----------|--------------------|
| Ya hay otro comprobante en revisión para esa misma mensualidad | Para evitar duplicados mientras cobranza revisa |
| El mismo archivo ya fue enviado antes | Un comprobante no puede usarse dos veces |
| La referencia ya se usó en otro comprobante | Cada transacción paga una sola cuota |
| La referencia ya está registrada como pago confirmado | Ese dinero ya fue aplicado |
| La referencia ya se usó en una recarga de cantina | No se puede reciclar entre módulos |

---

## 7. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Credenciales incorrectas. Verifica tu cédula/correo y contraseña." | Los datos no coinciden. | Prueba con el correo, o pide al colegio que reinicie tu clave. |
| "Completa todos los campos" | Falta la cédula o la contraseña. | Llena ambos. |
| "Debe cambiar su contraseña antes de continuar." | Todavía usas la clave inicial. | Ve a "Cambiar contraseña". |
| "Selecciona un archivo primero" | No adjuntaste el comprobante. | Usa "Cámara" o "Archivo". |
| "Formato no permitido. Solo JPG, PNG, WEBP o PDF." | El archivo no es válido. | Toma una foto o usa el PDF del banco. |
| "El archivo supera el límite de 10 MB." | La imagen pesa demasiado. | Toma la foto en menor calidad. |
| "Debes ingresar el número de referencia o confirmación de la transacción." | Falta la referencia. | Cópiala del comprobante del banco. |
| "Ya tiene un comprobante en revisión para esta mensualidad…" | Ya enviaste uno y sigue en revisión. | Espera la respuesta del colegio. |
| "Este archivo ya fue enviado anteriormente…" | Es el mismo comprobante de otra vez. | Envía el comprobante correcto de esta transferencia. |
| "La referencia «…» ya fue enviada en otro comprobante…" | Esa transacción ya se usó. | Usa la referencia de la transferencia nueva. |
| "La referencia «…» ya fue registrada como pago confirmado…" | El colegio ya aplicó ese pago. | Si crees que hay un error, llama a la administración. |
| "No se pudo enviar. Intenta nuevamente." | Falló el envío. | Revisa tu conexión y reintenta. |
| "No tienes mensualidades vencidas pendientes." | No debes nada vencido. | No hace falta hacer nada. |
| "Este alumno no tiene una tarjeta de cantina asignada todavía." | El colegio no le ha entregado tarjeta. | Solicítala en la administración. |
| "Todavía no hay una conversación iniciada por un docente para este alumno." | Ningún docente te ha escrito. | Espera a que el docente inicie la conversación. |
| "Alumno no encontrado o no pertenece a este representante." | Ese estudiante no está a tu nombre. | Verifica con la administración. |
| "No se pudo descargar el recibo. Intenta más tarde." | El PDF no se pudo generar. | Reintenta más tarde. |
| "La imagen no puede superar 2MB." | La foto de perfil pesa demasiado. | Usa una foto más liviana. |
| "Nombre y apellido no pueden estar vacíos." | Falta un dato del perfil. | Complétalo. |

---

## 8. Advertencias

⚠️ **Subir el comprobante no salda la deuda.** El pago se aplica cuando el colegio
lo aprueba. Hasta entonces la cuota sigue vencida y pueden llegarte
recordatorios.

⚠️ **No envíes dos veces el mismo comprobante.** El sistema lo detecta y lo
rechaza. Si tienes dudas, llama a la administración.

⚠️ **Cada referencia bancaria sirve para una sola cuota.** No uses la misma
transferencia para pagar dos mensualidades.

⚠️ **Cambia tu contraseña inicial.** La primera clave es tu cédula: cualquiera que
la conozca podría ver tu estado de cuenta.

---

## 9. Para el personal del colegio: revisar los comprobantes

Los comprobantes que suben las familias quedan pendientes de aprobación por parte
del **Director**, **Sistemas**, **Administrador** o **Cobranza**. Al aprobar uno,
el sistema marca la mensualidad como pagada y crea el pago correspondiente.

> ⚠️ **Al momento de escribir este manual, esta revisión no tiene una pantalla
> propia en el panel administrativo.** Ver
> [99 · Puntos a confirmar](99-puntos-a-confirmar.md).
