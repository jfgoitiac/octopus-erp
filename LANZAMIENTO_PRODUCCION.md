# Lanzamiento controlado a producción

Este documento es el orden de ejecución para un operador autorizado. No
ejecutar `deploy.sh` ni cambiar Nginx, servicios, credenciales o datos hasta
que todos los puntos previos estén aprobados.

## Go / no-go

Antes de abrir la ventana, confirmar y registrar:

- [ ] La rama a publicar fue revisada, sus cambios están consolidados en Git y
  corresponde al commit aprobado. No desplegar un worktree local con cambios
  sin confirmar.
- [ ] El build del frontend, `manage.py check`, migraciones y pruebas
  relevantes pasaron para ese commit.
- [ ] El flujo completo fue probado en staging aislado, incluida la checklist
  de [ACEPTACION_PILOTO.md](ACEPTACION_PILOTO.md).
- [ ] Existe un respaldo reciente, verificable y descargable de PostgreSQL y
  `media/`; se documentó al menos una restauración contra una BD de prueba.
- [ ] El operador conoce el commit actualmente desplegado y tiene acceso al
  log de Nginx, Django, Celery Worker y Celery Beat.
- [ ] Hay una ventana de mantenimiento, responsable técnico y canal de
  comunicación definidos.

Si alguno no se cumple, el resultado es **no-go**: corregirlo o reprogramar,
sin desplegar parcialmente.

## Preparación exclusiva del servidor

Estas configuraciones se hacen una vez por un administrador del servidor y
nunca se versionan con secretos:

- Nginx: aplicar y probar las instrucciones de
  `deploy/nginx/app.clhma.com.snippet.conf`; la ruta directa de comprobantes
  debe devolver 403 y Django debe poder servirlos mediante `X-Accel-Redirect`.
- Celery/Redis: crear las unidades `octopus-celery-worker` y
  `octopus-celery-beat` según `octopus-api/ARRANQUE_CELERY.md`, con una sola
  instancia de Beat.
- Respaldos: instalar el JSON de la cuenta de servicio fuera del repositorio,
  con permisos restrictivos, y configurar las variables indicadas en
  `octopus-api/RESTAURACION_EMERGENCIA.md`. Ejecutar una prueba manual antes
  de activar el respaldo diario.
- Correo: completar `PORTAL_EMAIL_DIRECTOR` si se requiere la alerta mensual
  del portal.

## Secuencia de publicación

1. Anotar fecha, commit anterior y commit objetivo. Notificar el inicio de la
   ventana.
2. Confirmar el respaldo reciente y que no haya migraciones manuales ni tareas
   administrativas ejecutándose.
3. En el checkout de producción, verificar que se usará `main` y que el
   servicio y repositorio son los de producción. Para staging se usan
   explícitamente `REPO`, `SERVICE` y `BRANCH`; no reutilizar esos valores en
   producción.
4. Ejecutar el mecanismo de despliegue aprobado por el operador. El script
   actual instala dependencias, migra, compila frontend y reinicia Django,
   Worker y Beat; observar su salida completa y detener la validación si falla
   cualquier unidad.
5. Validar Nginx antes de anunciar disponibilidad: `nginx -t`, luego recarga
   controlada y comprobación de que sigue activo.

## Validación posterior

Desde una sesión autorizada, sin exponer tokens en tickets o chats:

- [ ] `GET /api/health/` responde HTTP 200 e informa base de datos saludable.
- [ ] Django, Nginx, `octopus-celery-worker` y `octopus-celery-beat` están
  activos; `python manage.py verificar_celery` confirma Redis y Worker.
- [ ] Un usuario autorizado puede iniciar sesión y abrir el dashboard.
- [ ] La descarga directa de `/media/comprobantes/...` está denegada; un
  usuario con autorización sí visualiza su comprobante mediante Django.
- [ ] Se valida un flujo mínimo: inscripción, pago, aprobación, recibo y
  comprobante desde el portal, con cuentas de prueba controladas.
- [ ] Se revisan errores recientes de Nginx, Django y Celery, sin datos
  sensibles en el reporte.

Registrar resultado, hora, commit y cualquier incidencia antes de cerrar la
ventana.

## Reversión

Revertir solo si la validación posterior falla y el problema no puede
corregirse de forma segura dentro de la ventana.

1. Poner el servicio en mantenimiento o informar indisponibilidad breve.
2. Volver el checkout al **commit anterior anotado**, usando el procedimiento
   Git aprobado por el responsable; no usar comandos destructivos sobre un
   worktree que contenga cambios no consolidados.
3. Reinstalar dependencias si el commit anterior lo exige, compilar frontend y
   reiniciar Django, Worker y Beat juntos.
4. No revertir automáticamente una migración de base de datos. Si ya se
   aplicó una migración incompatible, detenerse y seguir un plan de migración
   inversa revisado o restaurar únicamente en coordinación con el responsable
   de datos.
5. Repetir los controles de salud y el flujo mínimo. Documentar el motivo de
   reversión antes de reintentar el lanzamiento.

La restauración de base de datos/media es un último recurso y se realiza
únicamente con el procedimiento de
`octopus-api/RESTAURACION_EMERGENCIA.md`, primero validado en un entorno de
prueba.
