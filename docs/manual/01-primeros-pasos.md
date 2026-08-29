# 01 · Primeros pasos

## Para qué sirve

Octopus es el sistema con el que el colegio lleva sus inscripciones, sus cobros,
las notas de los alumnos, la cantina y la comunicación con las familias. Este
capítulo explica cómo se ve la pantalla, dónde está cada cosa y qué puede hacer
cada persona según su rol.

## Quién puede usarlo

Todos. Cada rol ve un menú distinto, pero la pantalla siempre funciona igual.

---

## 1. Las tres puertas de entrada

Octopus no tiene una sola pantalla de acceso. Tiene tres, según quién eres:

| Quién eres | Dirección | Con qué entras |
|------------|-----------|----------------|
| Personal del colegio (director, secretaria, cajero, cobranza, sistemas, administrador, directivo de red) | `/login` | Usuario y contraseña |
| Docente | `/login` — el sistema te lleva solo a tu portal | Usuario y contraseña |
| Representante (papá, mamá o tutor) | `/portal/login` | Cédula o correo electrónico y contraseña |

El personal y los docentes usan **la misma pantalla de acceso**. Al entrar, el
sistema te lleva automáticamente a la pantalla que te corresponde.

[CAPTURA: pantalla de acceso "Octopus ERP — Gestión Escolar" con los campos "Usuario" y "Contraseña" y el botón "Entrar al Sistema"]

---

## 2. Las partes de la pantalla

Una vez dentro del panel administrativo verás siempre tres zonas:

**Barra superior.** Arriba del todo. Contiene:

- El logo del colegio. Haz clic en él para volver al panel de control.
- La fecha de hoy.
- El botón **"BCV"**, que muestra la tasa del día en bolívares (por ejemplo
  `Bs. 45,20`). Haz clic para volver a consultar la tasa. Si el recuadro se pone
  rojo, la tasa no se pudo actualizar.
- Tu círculo de iniciales a la derecha. Haz clic y aparece **"Cerrar sesión"**.
- En teléfono, un botón de menú para abrir el menú lateral.

**Menú lateral (izquierda).** La lista de módulos, agrupada por secciones.

**Área de trabajo (centro).** La pantalla en la que estás trabajando.

[CAPTURA: panel completo mostrando barra superior con la tasa BCV, menú lateral desplegado y el Dashboard al centro]

---

## 3. El menú lateral

El menú está dividido en seis grupos. Solo ves los módulos que tu rol tiene
permitido:

| Grupo | Módulos |
|-------|---------|
| **Principal** | Dashboard · Alumnos · Morosos · Representantes · Inscripciones · Grados · Consulta de Inscripción · Pre-Inscripción |
| **Finanzas** | Cobranza · Comprobantes · Solvencia · Reportes · Nómina · Pagos · Recibos · Conciliador |
| **Académico** | Notas · Boletines · Asistencia · Incidentes · Horarios · Materias · Docentes · Rendimiento |
| **Comunicación** | Circulares |
| **Multi-Sede** | Dashboard Sedes · Gestión de Sedes |
| **Sistema** | Sitio Institucional · Configuración · Notificaciones · Sistemas · Auditoría |

### Contraer un grupo

Haz clic en el nombre del grupo (por ejemplo **"Finanzas"**) para plegarlo o
desplegarlo. Si entras a una pantalla que está dentro de un grupo plegado, el
grupo se abre solo para que veas dónde estás parado.

### Fijar favoritos

Pasa el cursor sobre cualquier módulo del menú y aparecerá un icono de chincheta
a la derecha.

1. Haz clic en la chincheta.
2. Aparece el aviso **"<Módulo> fijado en favoritos"**.
3. El módulo sube a un grupo nuevo llamado **"Favoritos"**, al principio del menú.

Para quitarlo, haz clic otra vez en la chincheta; verás **"<Módulo> quitado de
favoritos"**. Tus favoritos son tuyos: cada usuario tiene los suyos.

[CAPTURA: menú lateral con el grupo "Favoritos" arriba y el icono de chincheta visible sobre un módulo]

### Selector de sede

Si el colegio tiene varias sedes y tu cuenta tiene acceso a más de una, encima
del menú aparece un selector con el nombre de la sede activa y la opción
**"Todas las sedes"**. Todo lo que veas en pantalla (alumnos, pagos, reportes)
corresponde a la sede seleccionada.

---

## 4. Los roles y qué ve cada uno

Octopus tiene ocho roles. El rol lo asigna el Director o Sistemas desde el
módulo **"Sistemas"**.

| Rol | Para qué es | A dónde entra al iniciar sesión |
|-----|-------------|--------------------------------|
| **Director** | Máximo acceso. Ve todo el colegio, aprueba y audita. | Dashboard |
| **Sistemas** | Soporte técnico: usuarios, respaldos, configuración. | Dashboard de Cobranza |
| **Administrador** | Gestión administrativa y financiera del plantel. | Dashboard |
| **Cobranza** | Seguimiento de deudas y pagos. | Dashboard |
| **Cajero** | Caja del día y punto de venta de la cantina. | Cantina |
| **Secretaria** | Inscripciones, alumnos y control de estudios. | Inscripciones |
| **Directivo de Red** | Coordinador de varias sedes. | Dashboard Sedes |
| **Docente** | Sus materias, notas, asistencia y mensajes. | Portal Docente |

### Tabla de acceso por módulo

Una marca ✓ significa que ese rol puede abrir ese módulo.

| Módulo | Director | Sistemas | Administrador | Cobranza | Cajero | Secretaria | Directivo de Red |
|--------|:--------:|:--------:|:-------------:|:--------:|:------:|:----------:|:----------------:|
| Dashboard | ✓ | | ✓ | ✓ | | | |
| Alumnos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Morosos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Representantes | ✓ | | ✓ | ✓ | ✓ | ✓ | |
| Inscripciones | ✓ | ✓ | ✓ | | | ✓ | |
| Grados | ✓ | ✓ | ✓ | | | ✓ | |
| Consulta de Inscripción | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pre-Inscripción | ✓ | ✓ | ✓ | | | ✓ | |
| Cobranza | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| Comprobantes | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| Solvencia | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reportes | ✓ | ✓ | ✓ | ✓ | | | |
| Conciliador | ✓ | ✓ | ✓ | ✓ | | | |
| Recibos | ✓ | ✓ | ✓ | | | | |
| Pagos | ✓ | ✓ | ✓ | | | | |
| Nómina | ✓ | ✓ | ✓ | | | | |
| Notas | ✓ | ✓ | | | | ✓ | |
| Boletines | ✓ | | | | | | |
| Asistencia | ✓ | ✓ | | | | ✓ | |
| Incidentes | ✓ | ✓ | | | | ✓ | |
| Horarios | ✓ | ✓ | | | | | |
| Materias | ✓ | ✓ | | | | | |
| Docentes | ✓ | ✓ | | | | | |
| Rendimiento | ✓ | ✓ | ✓ | | | | |
| Circulares | ✓ | ✓ | ✓ | | | | |
| Sitio Institucional | ✓ | ✓ | | | | | |
| Configuración | ✓ | ✓ | | | | | |
| Notificaciones | ✓ | ✓ | | | | | |
| Sistemas | ✓ | ✓ | | | | | |
| Auditoría | ✓ | | | | | | |
| Dashboard Sedes | ✓ | | | | | | ✓ |
| Gestión de Sedes | | | | | | | ✓ |
| Cantina | ✓ | | ✓ | | ✓ | | |

> **Nota sobre el menú y los permisos.** En algunos módulos el menú lateral es
> más restrictivo que el permiso real. Por ejemplo, **Nómina** y **Pagos**
> aparecen en el menú solo para Director y Administrador, aunque Sistemas
> también tiene permiso para abrirlos; y **Alumnos** admite a Cajero y
> Secretaria por permiso, pero no les aparece en el menú. Ver
> [99 · Puntos a confirmar](99-puntos-a-confirmar.md).

---

## 5. Cosas que verás en todas las pantallas

**Avisos emergentes.** Cuando guardas algo, aparece abajo a la derecha un aviso
de color. Verde: salió bien. Rojo: hubo un error. Amarillo: falta algo. El aviso
se cierra solo, o puedes hacerle clic para cerrarlo.

**Cargando.** Mientras el sistema busca datos, verás recuadros grises con forma
de tarjeta o de fila. No es un error: espera unos segundos.

**Tablas anchas.** En teléfono, las tablas se deslizan hacia los lados con el
dedo. La página completa no se mueve, solo la tabla.

**Dinero.** Los montos se muestran en dólares (`$`) y su equivalente en bolívares
(`Bs.`), calculado con la tasa BCV del momento en que se registró la operación.

**Fechas.** Se muestran en español, con el formato `dd/MM/yyyy` o escritas
completas, por ejemplo `15 de marzo de 2026`.

---

## 6. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Usuario o contraseña incorrectos." | Los datos no coinciden. | Revisa mayúsculas y vuelve a intentar. Si sigue, pide a Sistemas que reinicie tu contraseña. |
| "Error en el servidor. Intenta más tarde." | El sistema no respondió. | Espera unos minutos y avisa a Sistemas. |
| "Sin conexión. Revisa tu red." | Tu computadora perdió internet. | Revisa la conexión y vuelve a intentar. |
| "Sesion expirada. Inicia sesion nuevamente." | Pasó demasiado tiempo sin actividad. | Vuelve a entrar. |
| "Debe cambiar su contraseña antes de continuar." | Tu clave es la inicial que te dieron. | Cámbiala; ver [02 · Acceso y cuenta](02-acceso-y-cuenta.md). |
| "Los docentes deben ingresar desde el Portal Docente." | Se intentó usar una cuenta de docente en una pantalla administrativa. | Entra por tu portal de docente. |
| "No tiene acceso a esta sede." | Tu cuenta no tiene permiso sobre esa sede. | Pide al Directivo de Red que te asigne. |

---

## 7. Advertencias

⚠️ **No compartas tu usuario.** Todo lo que se hace en Octopus queda registrado
con tu nombre en el módulo de Auditoría: pagos, anulaciones, cambios y
eliminaciones.

⚠️ **Cierra sesión** cuando dejes la computadora, sobre todo en la caja y en la
cantina.
