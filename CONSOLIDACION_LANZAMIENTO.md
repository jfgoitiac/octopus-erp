# Plan de consolidación para lanzamiento

Este inventario separa los cambios actualmente no consolidados en entregas
revisables. No ejecuta `git add`, `commit`, `reset`, `checkout` ni despliegues:
el responsable conserva el control de qué se publica y cuándo.

## Regla de consolidación

- Revisar cada grupo y sus pruebas antes de confirmarlo.
- No usar `git add -A`: el worktree contiene trabajo paralelo y cambios de
  producto previos que no deben mezclarse por accidente.
- La migración `authentication/migrations/0007_add_coordinador_role.py` debe
  viajar con el cambio de rol `coordinador`; no separarla.
- Publicar primero a staging y aprobar el piloto antes de llevar cualquiera de
  estos grupos a producción.

## Entrega 1: producto académico, portal y permisos

Objetivo: publicar los cambios funcionales de inscripción/preinscripción,
roles, comprobantes y constancias.

- Backend: `academico/views.py`, `authentication/models.py`, la migración
  `0007_add_coordinador_role.py`, `secretaria/views.py`,
  `secretaria/utils_preinscripcion.py`, `secretaria/tests.py`,
  `config/urls.py`, `config/views.py`, `config/tests.py` y los cambios de
  recibos/comprobantes relacionados.
- Frontend: `src/App.jsx`, `src/components/Sidebar.jsx`,
  `src/constants/roles.js`, `src/api/secretaria.service.js`,
  `src/hooks/useInscripcion.js`, `src/pages/RevisionComprobantes.jsx` y los
  archivos de constancias nuevos o modificados.
- Retiro de la interfaz temporal de limpieza: los dos archivos eliminados de
  `src/components/sistemas/`; revisar que no queden importaciones.

Validación mínima: migraciones, pruebas de `secretaria`, `portal`, rutas de
salud, pruebas frontend, build y los roles de la checklist de piloto.

## Entrega 2: seguridad de dependencias y archivos

Objetivo: reducir superficie de dependencias y proteger comprobantes.

- `octopus-frontend/package.json`, `package-lock.json`,
  `src/hooks/useConciliador.js` y `octopus-frontend/SECURITY.md`.
- `deploy/nginx/app.clhma.com.snippet.conf` y
  `deploy/nginx/app.clhmacoro.com.conf` para la ruta interna de comprobantes.

Validación mínima: `npm ci`, `npm audit`, pruebas/build frontend, `nginx -t`
en el servidor autorizado y pruebas 403 directa / descarga autorizada vía
Django. SheetJS/XLSX conserva la mitigación documentada hasta que exista un
parche compatible.

## Entrega 3: operación, disponibilidad y respaldos

Objetivo: hacer operables Celery, Redis, backups, staging y reversión.

- `deploy.sh`, `STAGING.md`, `deploy/nginx/staging.example.conf`,
  `.gitattributes` y `LANZAMIENTO_PRODUCCION.md`.
- `octopus-api/ARRANQUE_CELERY.md`, `.env.example`, `.env.staging.example`,
  `RESTAURACION_EMERGENCIA.md`, `requirements.txt`.
- `usuarios/backup.py`, `usuarios/tasks.py`, `usuarios/tests.py`, y los
  comandos `respaldo_externo` y `verificar_celery`.

Validación mínima: sintaxis de Bash, pruebas de respaldos, Django check y
migraciones. En staging, verificar Nginx, Redis, Worker, Beat y la
restauración sobre una BD/media de prueba. Los secretos y JSON de Google Drive
se crean solo en el servidor y no forman parte de esta entrega Git.

## Entrega 4: calidad de entrega y aceptación

Objetivo: impedir regresiones antes de una publicación.

- `.github/workflows/ci.yml`: pruebas frontend bloqueantes y build.
- Ajuste de broker Celery exclusivo de test en `config/settings.py` para que
  la suite no dependa de Redis local.
- `ACEPTACION_PILOTO.md`.

Validación mínima: suite Django completa, 39 pruebas frontend, build, y CI en
verde desde el commit consolidado. El lint sigue visible pero no bloqueante por
la deuda preexistente; no declararlo resuelto sin un trabajo dedicado.

## Secuencia sugerida

1. Revisar y consolidar Entrega 1 con su migración.
2. Consolidar Entrega 2 y confirmar build/auditoría.
3. Consolidar Entrega 3, sin aplicar configuraciones de servidor todavía.
4. Consolidar Entrega 4 y subir una rama de lanzamiento.
5. Exigir CI verde, desplegar esa rama únicamente a staging y ejecutar
   `ACEPTACION_PILOTO.md`.
6. Solo con aprobación formal, seguir `LANZAMIENTO_PRODUCCION.md` en
   producción.

## Bloqueadores reales antes de producción

- CI de la rama final debe estar verde, incluida la suite Django completa.
- Debe existir una restauración comprobada de un respaldo en entorno de
  prueba.
- Deben configurarse en el servidor Nginx, servicios Celery/Beat, Redis,
  variables de respaldo y, si aplica, `PORTAL_EMAIL_DIRECTOR`.
- El piloto por roles debe aprobarse y conservar evidencia sin secretos ni
  datos sensibles.
