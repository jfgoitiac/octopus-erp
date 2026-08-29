# 91 · Preguntas frecuentes

Estas preguntas salen de las validaciones y los mensajes reales del sistema. Si
te topaste con un mensaje concreto, búscalo aquí.

---

## Inscripciones y alumnos

### 1. El sistema no me deja inscribir a un alumno y dice que tiene mensualidades pendientes. ¿Puedo saltarlo?

No. La inscripción se bloquea a propósito cuando el alumno debe meses
anteriores, o el mes en curso ya pasado el día límite de pago. Primero se cobra
en **"Cobranza"**, y después se inscribe. Los alumnos marcados como **"Becado
Total"** quedan exentos de esta revisión.
→ [Inscripciones](08-inscripciones.md)

### 2. Dice que el representante tiene el Proyecto de Inversión pendiente y no puedo inscribir a ninguno de sus hijos. ¿Es un error?

No. El Proyecto de Inversión se cobra **por representante, no por alumno**: una
sola vez por período, aunque tenga tres hijos. Mientras esté impago, bloquea la
inscripción de todos.
→ [Representantes](11-representantes.md)

### 3. Dice que el alumno "ya está inscrito para el período". ¿Qué hago?

Ya tiene inscripción para ese año escolar: no hace falta repetirla. Si necesitas
el papel, ve a **"Consulta de Inscripción"** y descarga el comprobante.
→ [Consulta de Inscripción](09-consulta-inscripcion.md)

### 4. "No hay cupos disponibles para 3er Grado - A". ¿Puedo forzarlo?

No desde la pantalla de inscripción. O eliges otra sección, o el Director amplía
los **"Cupos Máximos"** de ese grado en **"Configuración"**.
→ [Configuración](36-configuracion.md)

### 5. Retiré un alumno por error. ¿Puedo devolverlo?

Sí, con **"Reactivar Alumno"** en su fila. Pero ojo: al retirarlo se liberó su
cupo. Si otra familia lo tomó, la reactivación falla hasta que haya cupo libre.
→ [Alumnos](10-alumnos.md)

### 6. Me equivoqué al escribir la cédula del representante y creé uno duplicado. ¿Qué hago?

Avisa a Sistemas. Los pagos de esa familia quedaron repartidos entre dos fichas y
el estado de cuenta no cuadrará hasta que se unifiquen. Por eso conviene siempre
buscar la cédula antes de crear.
→ [Representantes](11-representantes.md)

### 7. La cédula escolar del alumno la dejé vacía. ¿Está mal?

No. Si la dejas en blanco, el sistema genera una automáticamente.
→ [Inscripciones](08-inscripciones.md)

---

## Cobranza y pagos

### 8. Registré un pago con el monto o el banco equivocado. ¿Lo borro?

No se puede borrar. Tienes dos caminos: **corregirlo** (si el pago es válido y
solo el dato está mal) o **anularlo** (si nunca debió contarse). Ambos exigen
escribir un motivo de al menos 10 caracteres, que queda guardado con tu nombre.
→ [Reportes](04-reportes.md)

### 9. Anulé un pago. ¿Qué pasa con las cuotas que ya estaban pagadas?

Vuelven a quedar pendientes: mensualidades, cuotas de inscripción y cuotas de
solvencia. El alumno puede volver a aparecer en **"Morosos"** y a recibir los
avisos automáticos.
→ [Reportes](04-reportes.md)

### 10. "No se puede anular este pago: su fecha cae dentro de un cierre de caja ya validado por el director." ¿Y ahora?

Esa caja ya fue revisada y aprobada. Habla con el Director: hace falta un ajuste
manual, no se puede resolver desde la pantalla.
→ [Reportes](04-reportes.md)

### 11. "No se puede anular automáticamente un pago vinculado a un Proyecto de Inversión…". ¿Por qué?

Porque esos abonos son parciales y el sistema no puede saber con certeza cuánto
restarle a la cuota. Contacta a Sistemas para el ajuste manual.
→ [Reportes](04-reportes.md)

### 12. El sistema me pide 4 dígitos en la referencia. ¿Por qué?

Solo cuando el método es **Punto de Venta**: ahí la referencia y el número de
lote deben tener exactamente cuatro dígitos, por ejemplo `0042`.
→ [Cobranza](20-cobranza.md)

### 13. Quiero cobrarle a la familia un adelanto de mensualidades y no me deja.

Los adelantos y los pagos parciales solo se aceptan con **Efectivo USD** o
**Zelle**. Cambia el método de pago y vuelve a intentar.
→ [Cobranza](20-cobranza.md)

### 14. "No se ha registrado ninguna tasa de cambio." ¿Qué falta?

El sistema no tiene la tasa BCV del momento. Haz clic en el botón **"BCV"** de la
barra superior para sincronizarla. Sin tasa no se puede registrar un pago.
→ [Primeros pasos](01-primeros-pasos.md)

### 15. Una familia dice que pagó, pero no aparece. ¿Cómo lo verifico?

Usa el **"Conciliador"**: elige el banco, sube el estado de cuenta y busca por
los últimos 4 a 6 dígitos de la referencia. Si la transacción está, cárgala como
pago retroactivo desde **"Reportes"**.
→ [Conciliador](25-conciliador.md)

### 16. "La referencia ya fue registrada como pago confirmado". ¿Qué significa?

Ese número de transacción ya se usó. Cada referencia bancaria sirve para una sola
operación: no se puede reciclar entre mensualidades, ni entre el portal y la
cantina.
→ [Portal de Representantes](31-portal-representantes.md)

### 17. Un alumno que está al día aparece en "Morosos". ¿Por qué?

La mora no es solo la mensualidad. También cuentan la cuota de inscripción
impaga, la solvencia con monto mayor a cero y el Proyecto de Inversión del
representante. Abre **"Cobranza"** con su cédula y revisa concepto por concepto.
→ [Morosos](22-morosos.md)

### 18. Subí el monto de una mensualidad que ya estaba pagada y ahora el alumno figura en mora.

Es el comportamiento esperado: si el monto sube por encima de lo pagado, la cuota
vuelve a quedar pendiente. Para ajustes de un alumno concreto usa **"Ajustar
Deuda"** en su fila, no los montos globales.
→ [Alumnos](10-alumnos.md)

---

## Portal de familias

### 19. Subí el comprobante y la deuda sigue apareciendo. ¿Falló?

No. Subir el comprobante **no salda la deuda**: queda en revisión hasta que el
colegio lo apruebe. Mientras tanto la cuota sigue vencida y pueden llegarte
recordatorios.
→ [Portal de Representantes](31-portal-representantes.md)

### 20. "Ya tiene un comprobante en revisión para esta mensualidad". ¿Envío otro?

No. Espera la respuesta del equipo de cobranza. El sistema bloquea el segundo
envío justamente para que no se dupliquen.
→ [Portal de Representantes](31-portal-representantes.md)

### 21. No me llega el correo para recuperar mi contraseña del portal.

Puede ser que el colegio no tenga tu correo cargado, o que tu acceso al portal no
esté activo. El sistema siempre responde lo mismo, exista o no la cuenta, para no
revelar quién tiene portal. Llama a la administración.
→ [Acceso y cuenta](02-acceso-y-cuenta.md)

### 22. ¿Cuál es mi contraseña la primera vez que entro al portal?

Tu cédula. El sistema te obligará a cambiarla antes de dejarte usar cualquier
otra pantalla.
→ [Representantes](11-representantes.md)

### 23. Tengo tres hijos en el colegio. ¿Necesito tres cuentas?

No. Con una sola cuenta ves a todos: arriba hay un selector para cambiar de
estudiante, y toda la pantalla se actualiza.
→ [Portal de Representantes](31-portal-representantes.md)

### 24. Quiero escribirle al docente y no me deja iniciar la conversación.

La conversación siempre la inicia el docente. Hasta que él te escriba, no puedes
enviar el primer mensaje.
→ [Portal de Representantes](31-portal-representantes.md)

---

## Académico

### 25. El lapso está cerrado y necesito corregir una nota.

Con el lapso cerrado nadie puede cargar ni editar notas, ni en el panel ni en el
Portal Docente. Solo el Director puede reabrirlo.
→ [Notas](14-notas.md)

### 26. ¿Por qué no puedo escribir la nota definitiva?

Porque la calcula el sistema: es el promedio de las evaluaciones que cargaste. Si
el promedio no da lo que esperas, revisa las evaluaciones parciales.
→ [Notas](14-notas.md)

### 27. El boletín sale sin promedio general.

Ocurre cuando todas las materias del alumno son literales (A/B/C): esas no entran
en el promedio. También quedan fuera las materias marcadas para no promediar.
→ [Boletines](15-boletin.md)

### 28. Un docente dice que no ve a sus alumnos.

Revisa dos cosas: que tenga materias asignadas en **"Docentes"**, y que su ficha
esté marcada como **"Docente activo"**. Solo ve las secciones de sus materias.
→ [Docentes](18-docentes.md)

### 29. Pasé asistencia dos veces el mismo día. ¿Se duplicó?

No. Hay un solo registro por alumno y por fecha: el segundo guardado reemplaza al
primero. El cambio queda en el historial.
→ [Asistencia](16-asistencia.md)

### 30. "Ya existe una clase en ese horario. Elige otro día u hora."

Ese bloque de la grilla ya está ocupado. Elige otra celda, o edita la clase que
ya está ahí.
→ [Horarios](17-horarios.md)

---

## Cantina

### 31. El POS no me deja cobrar.

Falta abrir tu caja. Cada cajero abre la suya declarando el monto inicial de
efectivo antes de la primera venta del turno.
→ [Cantina](33-cantina.md)

### 32. "Esta apertura de caja ya fue cerrada — no se puede cerrar dos veces."

Ya registraste el cierre de este turno. Para seguir vendiendo, abre una caja
nueva.
→ [Cantina](33-cantina.md)

### 33. La tarjeta del alumno no aparece al escanearla.

Puede estar sin asignar, bloqueada o extraviada. Revisa su estado en
**"Tarjetas"**.
→ [Cantina](33-cantina.md)

---

## Configuración y accesos

### 34. "No hay período escolar activo configurado." ¿Qué falta?

Falta definir el período en **"Configuración"** → **"Año Escolar"**, con el
formato `2025-2026`. Sin él no se puede inscribir, ni cargar pagos retroactivos,
ni emitir solvencias.
→ [Configuración](36-configuracion.md)

### 35. Cambié el día límite de pago y de golpe hay muchos morosos.

Es lo esperado: ese día decide cuándo vence la mensualidad del mes en curso, y se
aplica a todos los alumnos a la vez. Con él cambia también cuándo salen los
avisos automáticos.
→ [Configuración](36-configuracion.md)

### 36. Un usuario dice que ya no ve un módulo que antes usaba.

Probablemente le cambiaron el rol, o está parado en otra sede. Revisa su rol en
**"Sistemas"** y el selector de sede.
→ [Sistemas](37-sistemas.md) · [Multi-Sede](35-multisede.md)

### 37. "No tiene acceso a esta sede."

Tu cuenta no tiene permiso sobre ese plantel. El Directivo de Red debe asignarte
desde **"Gestión de Sedes"**.
→ [Multi-Sede](35-multisede.md)

### 38. Los números del Dashboard no coinciden con lo que esperaba.

Casi siempre es el selector de sede: estás viendo otro plantel. Revísalo arriba
del menú lateral.
→ [Primeros pasos](01-primeros-pasos.md)

### 39. Las familias no reciben ningún correo.

Revisa en **"Notificaciones"** que el área de correo esté **"Activo"** y que los
datos del servidor sean correctos. Usa **"Enviar prueba"** para comprobarlo. Y
verifica que los representantes tengan su correo cargado.
→ [Notificaciones automáticas](30-configuracion-notificaciones.md)

### 40. ¿Cada cuánto le avisa el sistema a una familia que debe?

Cuatro veces por cada mensualidad impaga: el día del vencimiento, a los 5 días, a
los 10 días y a los 15 días. Este último aviso va al director, no a la familia.
Los tres plazos son configurables.
→ [Notificaciones automáticas](30-configuracion-notificaciones.md)

### 41. Si la familia paga en el día 7, ¿le sigue llegando el aviso del día 10?

No. Antes de enviar cada aviso, el sistema comprueba que la mensualidad siga
impaga. Si ya está pagada, no sale.
→ [Notificaciones automáticas](30-configuracion-notificaciones.md)

### 42. ¿Puedo borrar un registro de la Auditoría?

No, y es a propósito. Si detectas una operación indebida, corrige el dato de
origen (por ejemplo, anula el pago); la bitácora no se toca.
→ [Auditoría](06-auditoria.md)
