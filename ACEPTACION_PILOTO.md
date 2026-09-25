# Checklist de piloto por rol

Ejecutar en staging con cuentas de prueba y datos identificables como prueba.
Registrar fecha, rol, resultado y evidencia sin incluir contraseñas, JWT ni
datos bancarios reales. Los pasos que cambian datos deben limpiarse solo en
staging después de que la evidencia sea aprobada.

## Flujos transversales

- [ ] Cada rol inicia sesión y aterriza en su ruta esperada.
- [ ] Un enlace directo a una ruta no autorizada redirige sin mostrar datos.
- [ ] Cerrar sesión invalida el acceso a las rutas protegidas.
- [ ] Un comprobante no se puede descargar desde `/media/comprobantes/`; la
  ruta protegida solo funciona para un usuario autorizado.

## Director

- [ ] Inscribe un alumno y reimprime el comprobante con cédula y dirección.
- [ ] Revisa, aprueba o rechaza un comprobante del portal y confirma el recibo.
- [ ] Consulta notas, asistencia, boletín, incidencias y rendimiento.
- [ ] Revisa auditoría, configuración, constancias y recuperación de respaldo.

## Sistemas

- [ ] Gestiona usuarios, configuración, notificaciones y sitio institucional.
- [ ] Abre Representantes y crea o edita un registro; no ve acciones de
  eliminación financiera.
- [ ] Revisa pagos enviados desde el portal y abre el archivo protegido.
- [ ] Verifica salud, Celery/Redis y logs mediante los comandos documentados.

## Administrador

- [ ] Completa inscripción, gestión de alumnos, representantes y grados.
- [ ] Registra pago, emite recibo y consulta comprobantes.
- [ ] Emite constancia, gestiona firmante autorizado y revisa nómina/pagos.
- [ ] Consulta reportes, morosos, conciliación y rendimiento.

## Cobranza

- [ ] Busca alumno/representante y registra un pago válido.
- [ ] Consulta comprobantes, revisa pagos del portal y aprueba/rechaza uno.
- [ ] Emite o consulta solvencia, morosos, reportes y conciliación.
- [ ] Confirma que no accede a nómina, pagos RRHH ni configuración de sistema.

## Cajero

- [ ] Consulta Alumnos y Representantes sin acceder a edición no autorizada.
- [ ] Registra caja/cobranza, consulta comprobantes y morosos.
- [ ] Ejecuta flujo de cantina: apertura, venta/recarga y cierre de caja.
- [ ] Confirma que no accede a reportes financieros, nómina ni configuración.

## Secretaria

- [ ] Realiza preinscripción e inscripción; valida el comprobante reimpreso.
- [ ] Gestiona alumnos, representantes, grados y constancias permitidas.
- [ ] Registra asistencia, notas e incidencias según las asignaciones vigentes.
- [ ] Confirma que no accede a aprobación de pagos del portal ni nómina.

## Docente

- [ ] Inicia sesión y llega al portal docente, no al panel administrativo.
- [ ] Consulta materias y alumnos asignados; registra notas y asistencia.
- [ ] Envía/recibe mensajes e incidencias dentro de sus asignaciones.
- [ ] Confirma que no puede consultar pagos, inscripción, representantes ni RRHH.

## Representante

- [ ] Inicia sesión en el portal y ve exclusivamente a sus representados.
- [ ] Consulta notas, asistencia, boletines, perfil y comunicaciones.
- [ ] Envía un comprobante de pago y consulta su estado e historial.
- [ ] Descarga solo comprobantes propios mediante la ruta protegida.

## Respaldo y restauración

- [ ] Ejecuta un respaldo externo de prueba con datos no productivos.
- [ ] Confirma archivo local, archivo en Drive de prueba y correo sin adjunto.
- [ ] Restaura el archivo en una BD de prueba, valida SHA-256 y media.
- [ ] Ejecuta `migrate`, `check`, login, inscripción, pago y comprobante sobre
  la restauración; nunca restaurar directamente en producción.
