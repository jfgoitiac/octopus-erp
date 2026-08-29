# 36 · Configuración

## Para qué sirve

Es el panel donde se define cómo funciona el colegio dentro del sistema: el
período escolar activo, las fechas de inscripción, los grados y sus cupos, el día
límite de pago, los bancos, los métodos de pago aceptados y los datos e imágenes
del colegio.

## Quién puede usarlo

**Director** y **Sistemas**. Cualquier otro rol verá **"Acceso Restringido"**.

## Cómo llegar

Menú lateral → **Sistema** → **"Configuración"**.

---

## 1. Qué contiene la pantalla

El título es **"Configuración del Sistema"**, y está dividida en bloques:

| Bloque | Qué configura |
|--------|---------------|
| **"Año Escolar"** | Período activo y fechas del año |
| **"Proceso de Inscripción"** | Cuándo abren y cierran las inscripciones |
| **"Control de Cupos"** | Grados, secciones y cupos máximos |
| **"Panel de Cobros"** | Día límite de pago |
| **"Bancos y Medios de Pago"** | Bancos del colegio y métodos aceptados |
| **"Bancos de Nómina"** | Bancos donde cobra el personal |
| **"Tipos de Cargo"** | Cargos del personal |
| **"Datos del Colegio"** | Nombre, dirección, teléfono, correo |
| **"Logos del Recibo de Pago"** | Imágenes que salen en los recibos |
| **"Personalización visual del portal"** | Colores del portal de familias |
| **"Notificaciones"** | Estado de los canales, prueba e historial |

[CAPTURA: pantalla "Configuración del Sistema" con los bloques de año escolar, inscripciones y control de cupos]

---

## 2. Paso a paso

### Definir el período escolar

1. Ve al bloque **"Año Escolar"**.
2. Escribe el **"Período Activo"** (por ejemplo `2025-2026`). Si no hay ninguno
   dirá **"Sin configurar"**.
3. Indica el **"Inicio del Año"** y el **"Fin del Año"**.
4. Guarda.

Verás **"Configuración global actualizada con éxito."**.

> El período activo es la base de casi todo: inscripciones, cuotas, solvencia y
> pagos retroactivos dependen de él.

Para arrancar un año nuevo, usa **"Nuevo Período"**.

### Definir las fechas de inscripción

En **"Proceso de Inscripción"** indica el **"Inicio Inscripciones"** y el
**"Cierre Inscripciones"**.

### Crear grados y cupos

1. Ve a **"Control de Cupos"**.
2. Escribe el **"Nombre del Grado *"** (por ejemplo `3er Grado - A`).
3. Escribe los **"Cupos Máximos"**.
4. Guarda.

Si no hay ninguno, dirá **"No hay grados configurados."**.

Para vaciar una sección, usa **"Quitar Grado a Todos los Alumnos"**.

### Definir el día límite de pago

1. Ve a **"Panel de Cobros"**.
2. Escribe el **"Día Límite de Pago"** (por ejemplo `5`).
3. Guarda.

Verás **"Día límite de pago aplicado a 214 alumnos"**.

> Este día decide cuándo una mensualidad del mes en curso pasa a estar vencida, y
> por lo tanto cuándo empieza la mora y salen los avisos automáticos.

### Cargar un banco

1. Ve a **"Bancos y Medios de Pago"**.
2. Escribe el **"Nombre del Banco *"**, el **"Código bancario (4 dígitos)"** y el
   **"Número de Cuenta"**.
3. Marca si está **"Activo"**.
4. Guarda.

Si no hay ninguno, dirá **"No hay bancos registrados."**.

En **"Métodos de Pago Aceptados"** marcas cuáles se pueden usar en caja.

Los bancos donde cobra el personal se cargan aparte, en **"Bancos de Nómina"**;
si está vacío dirá **"No hay bancos de nómina registrados."**.

### Cargar los tipos de cargo

En **"Tipos de Cargo"** escribe el **"Nombre del Cargo *"** y su
**"Descripción"**. Si no hay ninguno, dirá **"No hay tipos de cargo
registrados."**.

### Datos e imágenes del colegio

1. En **"Datos del Colegio"** completa **"Nombre del Colegio"**,
   **"Dirección"**, **"Municipio"**, **"Estado"**, **"Teléfono"** y **"Correo
   Electrónico"**.
2. En **"Logos del Recibo de Pago"** sube el **"Logo Colegio"** y el **"Logo
   AVEC"**. Si faltan, verás **"Sin logo"** o **"Sin imagen"**.
3. En **"Personalización visual del portal"** define el **"Color Primario"** y
   el **"Color Secundario"**, y la **"URL del Logo"** con su **"Vista previa del
   logo"**.

### Revisar y probar las notificaciones

El bloque **"Notificaciones"** — *"Estado de canales, pruebas de envío e
historial"* — muestra:

- El **"Estado de canales"**: si el **"Email"**, **"Twilio: "** o **"Meta
  Business: "** están **"Configurado"** o **"Sin configurar"**, con su
  **"Host: "** y su **"Desde: "**.
- **"Enviar mensaje de prueba"**: elige el **"Canal"** (**"Email"**,
  **"WhatsApp"** o **"Ambos"**), el destino y un **"Mensaje (opcional — usa el
  predeterminado si se omite)"**.
- El **"Historial de notificaciones"**, filtrable por **"Todos los canales"** y
  **"Todos los estados"** (**"Enviado"**, **"Fallido"**, **"Pendiente"**). Si no
  hay nada, dirá **"No hay notificaciones registradas."**.

---

## 3. Campos del formulario

### Año escolar e inscripciones

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Período Activo | Sí | `2025-2026` | El año escolar en curso |
| Inicio del Año, Fin del Año | Sí | `dd/MM/yyyy` | Duración del año escolar |
| Inicio Inscripciones, Cierre Inscripciones | Sí | `dd/MM/yyyy` | Ventana para matricular |

### Grados y cobros

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre del Grado | Sí | Texto, ej. `3er Grado - A` | Grado y sección |
| Cupos Máximos | Sí | Número entero | Cuántos alumnos caben |
| Día Límite de Pago | Sí | Número del 1 al 31 | Día del mes en que vence la mensualidad |

### Bancos

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre del Banco | Sí | Texto | Banco del colegio |
| Código bancario | No | 4 dígitos | Código de la entidad |
| Número de Cuenta | No | Texto | Cuenta del colegio |
| Activo | Sí | Sí / No | Si se puede usar en caja |

### Datos del colegio

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre del Colegio | Sí | Texto | Sale en recibos y documentos |
| Dirección, Municipio, Estado | No | Texto | Ubicación del plantel |
| Teléfono, Correo Electrónico | No | Texto | Contacto institucional |
| Logo Colegio, Logo AVEC | No | Imagen | Se imprimen en los recibos |
| Color Primario, Color Secundario | No | Color | Colores del portal de familias |
| URL del Logo | No | Dirección web | Logo del portal |

---

## 4. Qué pasa después

- **Cambiar el período activo** afecta a todo: las inscripciones nuevas, las
  cuotas que se generan, la solvencia y la validación de los pagos retroactivos.
- **Cambiar el día límite de pago** se aplica a todos los alumnos y recalcula
  desde cuándo se considera vencida la mensualidad del mes.
- **Crear un grado** lo habilita para inscribir alumnos.
- **Reducir los cupos** de una sección no expulsa a nadie, pero impide inscribir
  o reactivar más alumnos.
- **Desactivar un banco** lo saca de las opciones de caja. Si tiene pagos
  asociados no se puede borrar: solo desactivar.
- Los logos y datos del colegio salen impresos en recibos y comprobantes.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Acceso Restringido" | Tu rol no puede entrar aquí. | Solo Director y Sistemas. |
| "Sin configurar" | Ese dato todavía no está definido. | Complétalo y guarda. |
| "No hay período escolar activo configurado." | Falta el período. | Defínelo en "Año Escolar". Sin él no se puede inscribir ni cobrar. |
| "El período escolar activo tiene un formato inválido." | No respeta el formato `2025-2026`. | Corrígelo. |
| "No hay grados configurados." | No se han creado grados. | Créalos en "Control de Cupos". |
| "No hay bancos registrados." | No hay bancos del colegio cargados. | Créalos: sin banco no se puede cobrar. |
| "Banco desactivado. Tiene registros asociados y no puede eliminarse permanentemente." | El banco tiene pagos cargados. | Queda desactivado; es lo correcto. |
| "No hay tipos de cargo registrados." | No se han cargado cargos. | Créalos antes de registrar personal. |
| "No hay notificaciones registradas." | Todavía no ha salido ningún aviso. | Envía un mensaje de prueba. |
| "Sin logo" / "Sin imagen" | Falta cargar el logo. | Súbelo en "Logos del Recibo de Pago". |
| "Sincronizando parámetros Octopus..." | El sistema está cargando la configuración. | Espera unos segundos. |

---

## 6. Advertencias

⚠️ **Cambiar el período escolar activo cambia el comportamiento de todo el
sistema.** Hazlo solo al arrancar un año nuevo, con la administración avisada.

⚠️ **Cambiar el día límite de pago se aplica a todos los alumnos de una vez** y
puede hacer que muchos pasen a mora el mismo día, con sus avisos automáticos.

⚠️ **"Quitar Grado a Todos los Alumnos" vacía la sección completa.** No se
deshace: habría que reasignar a cada alumno a mano.

⚠️ **Reducir los cupos de un grado por debajo de los alumnos ya inscritos** deja
la sección sobrevendida y bloquea reactivaciones.

⚠️ **Un banco desactivado desaparece de las opciones de cobro.** Avisa a la caja
antes de hacerlo.
