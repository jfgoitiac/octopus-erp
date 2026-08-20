# Política de Privacidad — Borrador

> **Esto es un borrador de trabajo, no un documento legal final.** Antes de
> publicarlo o hacerlo firmar por un colegio-cliente, debe revisarlo un
> abogado familiarizado con protección de datos en Venezuela (y en
> cualquier otro país donde opere un colegio-cliente) — este documento no
> sustituye asesoría legal.

## 1. Qué datos maneja Octopus

Por cada representante y alumno registrado:

- **Identificación**: cédula, nombre, apellido, teléfono, correo, dirección.
- **Datos del menor**: nombre, fecha de nacimiento, grado/sección,
  información académica (notas, asistencia, incidentes disciplinarios),
  fotos de perfil.
- **Datos financieros**: historial de pagos, montos, referencias bancarias,
  comprobantes de pago (imágenes/PDF subidos por el representante).
- **Datos técnicos**: dirección IP y timestamps de acceso (logs de
  autenticación, `LogAuditoria`).

## 2. Para qué se usan

- Gestionar la inscripción, cobranza y seguimiento académico del alumno.
- Enviar notificaciones de cobranza (recordatorios de mora), comunicados
  del colegio, y confirmaciones de pago.
- Auditoría interna (quién hizo qué cambio y cuándo — `django-simple-history`).

No se usan para publicidad ni se venden ni comparten con terceros ajenos al
colegio, salvo obligación legal.

## 3. Quién tiene acceso

- El personal del colegio con rol asignado (director, administrador,
  cajero, secretaría) — solo a los datos que su rol necesita, no a todo.
- El representante, únicamente a los datos de sus propios representados
  (aislamiento verificado por tests automatizados — ver `PortalIDORTests`
  en el código).
- Octopus como proveedor del software, solo para soporte técnico y nunca
  para fines distintos al servicio contratado.

## 4. Cuánto tiempo se conservan los datos

**Pendiente de definir con cada colegio-cliente.** Sugerencia de punto de
partida (ajustar según requisito legal/contable local):

- Datos financieros: mínimo el plazo que exija la normativa contable/fiscal
  aplicable (usualmente varios años).
- Datos académicos: mientras el alumno esté inscrito, y un período adicional
  razonable tras su egreso/retiro (útil para constancias).
- Comprobantes de pago (imágenes): mismo criterio que los datos financieros.

## 5. Seguridad

- Contraseñas nunca se guardan en texto plano (hashing estándar de Django).
- Credenciales SMTP sensibles se cifran en reposo (ver `crypto_fields.py`).
- Comunicación cifrada (HTTPS) en producción.
- Backups periódicos con acceso restringido a roles autorizados.

## 6. Derechos del representante

El representante puede solicitar al colegio:

- Acceso a los datos que el sistema tiene sobre él y sus representados.
- Corrección de datos incorrectos (vía el colegio, no directamente sobre
  datos financieros ya auditados).
- Eliminación de su cuenta del portal, sujeto a las obligaciones legales de
  conservación de registros financieros/académicos del colegio.

## 7. Contacto

**Pendiente**: definir un correo/canal de contacto del colegio para
solicitudes relacionadas con privacidad de datos.

---

### Nota técnica (no forma parte del documento final)

Este borrador se generó a partir de una revisión del código (qué modelos
almacenan qué datos y quién los consulta), no de un análisis legal de
normativa aplicable. Los puntos marcados "pendiente" requieren una decisión
del negocio/legal antes de poder considerarse completos.
