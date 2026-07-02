# NOTAS TÉCNICAS — Deuda técnica detectada

> Solo se anota aquí. No se implementa hasta que se apruebe.

---

## Portal de Representantes (Fase 1)

### Backend

**1. Migración manual requerida al desplegar**
La migración `portal/0001_initial.py` fue creada manualmente. Antes de levantar el servidor en producción, correr:
```bash
python manage.py migrate portal
```

**2. ~~Usuarios de portal deben crearse manualmente por ahora~~ — RESUELTO**
Management command creado: `python manage.py crear_usuarios_portal`.
Opciones: `--dry-run` para previsualizar, `--sobreescribir` para reactivar usuarios inactivos.
Contraseña inicial = cédula del representante. Ver `portal/management/commands/crear_usuarios_portal.py`.

**3. Celery no está configurado para producción**
`portal/tasks.py` y `cobranza/celery.py` usan Celery pero no hay configuración de broker en `settings.py` para producción. Actualmente solo funciona con `task_always_eager=True` en desarrollo. Se debe configurar Redis o RabbitMQ como broker y correr un worker:
```bash
celery -A config worker -l info
```

**4. ~~`programar_notificaciones_mensualidad` no está conectada~~ — YA ESTABA IMPLEMENTADO**
La señal `al_crear_mensualidad` en `cobranza/signals.py` ya llama a `programar_notificaciones_mensualidad` en el `post_save` de `Mensualidad`. Esta nota estaba desactualizada.

**5. Email backend apunta a consola en desarrollo**
`settings.py` usa `EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'`. Para producción, cambiar a `smtp.EmailBackend` y configurar las variables de entorno `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`.

**6. `related_name` de `RepresentanteUser` es `portal_user` pero `views.py` usa `representante_portal`**
Revisar consistencia: `models.py` define `related_name='portal_user'` en la FK a Representante, pero `views.py` accede con `request.user.representante_portal`. El `related_name='representante_portal'` está en la FK al User de Django — eso es correcto. Solo verificar al hacer pruebas.

**7. No hay límite de tamaño para comprobantes subidos**
`PortalComprobantePagoView` no valida el tamaño del archivo. Un representante podría subir archivos muy grandes. Agregar validación de máximo 5MB antes de guardar.

---

### Frontend

**9. `date-fns/locale/es` import puede variar según versión**
Si hay error de import con `from 'date-fns/locale/es'`, cambiar a `import { es } from 'date-fns/locale'`.

**10. Tailwind v4 — clases de color personalizadas**
El portal usa `#0fa3b1` como color primario hardcodeado en varios componentes. Cuando se lea el perfil del colegio desde la API (spec lo menciona), centralizar en una variable CSS o en `tailwind.config.js`.

**11. Sin manejo de token expirado en `PortalProtectedRoute`**
`PortalProtectedRoute` verifica expiración al montar, pero si el token expira mientras el representante usa la app y el refresh falla silenciosamente, puede quedar en un estado inconsistente. Agregar un intervalo de verificación periódica o escuchar el evento de 401 del `portalClient`.

**~~12. `ultimos_pagos` en el dashboard no filtra por `alumnoActivo`~~ — RESUELTO**
Cuando hay varios alumnos y el representante cambia de tab, los "Últimos pagos" muestran pagos de todos los hijos mezclados. Refactorizar para filtrar por `alumnoActivo.id` o agregar el nombre del alumno en cada fila del historial.

---

## General del sistema (pre-existente)

**13. `apiClient.js` tiene la baseURL hardcodeada**
`http://127.0.0.1:8000/api/` debería venir de una variable de entorno `VITE_API_BASE_URL`. Lo mismo aplica para `portalClient.js`.

**14. SQLite en producción**
El sistema corre con SQLite (`db.sqlite3`). Para producción con varios usuarios simultáneos, migrar a PostgreSQL (psycopg2 ya está instalado).

**15. No hay manejo de CORS para producción**
`CORS_ALLOWED_ORIGINS` solo incluye `localhost:5173`. Antes de desplegar, agregar el dominio real del frontend.

---

## Módulo de Notificaciones — Contratos de API esperados

### Endpoints que el backend debe implementar

| Método | Ruta | Body / Response |
|--------|------|-----------------|
| GET | `/api/settings/notifications` | `{ email: {...}, whatsapp: {...} }` |
| PUT | `/api/settings/notifications/email` | Body: objeto de configuración email |
| PUT | `/api/settings/notifications/whatsapp` | Body: objeto de configuración WhatsApp |
| GET | `/api/settings/notifications/rules` | Array de reglas (ver modelo abajo) |
| PUT | `/api/settings/notifications/rules/:id` | Body: campos a actualizar (patch parcial) |
| POST | `/api/settings/notifications/test` | Body: `{ channel, to, ruleId }` |

### Modelo de regla (Rule)
```json
{
  "id": "day_0",
  "label": "Día 0 — Factura generada",
  "offsetDays": 0,
  "channels": { "email": true, "whatsapp": false },
  "emailTemplate": "Hola {{nombre}}, tu factura #{{factura}}...",
  "whatsappTemplate": "",
  "active": true,
  "directorAlert": false
}
```

### Variables disponibles en templates
- `{{nombre}}` — Nombre del representante
- `{{factura}}` — Número de factura
- `{{monto}}` — Monto formateado
- `{{vencimiento}}` — Fecha de vencimiento (locale es)
- `{{cedula}}` — Cédula del representante
- `{{estudiante}}` — Nombre del estudiante

### Deuda técnica detectada

- [ ] **WhatsApp no implementado**: La integración con Twilio/Meta/360dialog está preparada en el frontend (campos de configuración) pero el backend aún debe conectar el proveedor. Ver comentarios en el hook `useNotificationSettings.js`.
- [ ] **Autenticación de endpoints**: Los endpoints `/api/settings/notifications/*` deben estar protegidos por middleware de rol ADMIN/DIRECTOR en el backend.
- [ ] **Encriptación de API Keys**: Las claves de API (SendGrid, Twilio, etc.) se envían en texto plano a la API. El backend debe encriptarlas en reposo (ej. con `crypto` de Node o similar) antes de guardar en BD.
- [ ] **Jobs de cobranza**: La lógica de envío automático según `offsetDays` debe implementarse como un cron job en el backend. El frontend solo configura las reglas; el backend es responsable de ejecutarlas.
- [ ] **Preview de templates real**: El editor de templates usa datos de ejemplo hardcodeados. En el futuro, conectar a un endpoint que devuelva una factura real para previsualización.
- [ ] **Logs de notificaciones enviadas**: No existe pantalla para ver historial de notificaciones enviadas. Considerar agregar tabla de logs en una fase posterior.

**[RESUELTO] Stripe eliminado del proyecto**
Se decidió no usar Stripe. Los pagos en línea se manejan únicamente mediante comprobante de transferencia/pago móvil subido por el representante.

## [2026-05-31] Configuración de Notificaciones — Deuda técnica detectada

### Seguridad
- Los secretos (email_host_password, twilio_auth_token, meta_whatsapp_token) se guardan 
  en texto plano en la BD (SQLite/Postgres). Se recomienda cifrarlos con AES-256-GCM 
  usando una clave derivada de SECRET_KEY antes de persistir. Ver: django-encrypted-fields o 
  implementación propia con cryptography (Fernet).
- El modelo ConfiguracionNotificaciones es un singleton (pk=1). Si el sistema escala a 
  multi-tenant real, refactorizar a FK → Sede o Colegio.

### UX / Frontend
- Los inputs de secretos muestran los últimos 4 chars del valor enmascarado (••••xxxx).
  Si el colegio quiere rotar una clave, debe borrar el campo y escribir el nuevo valor completo.
  Sería mejor agregar un botón explícito "Cambiar clave" que limpie el input.

### Backend
- El endpoint PATCH de ConfiguracionNotificaciones no tiene validación de formato para:
    - email_host_user (debería validar email válido)
    - email_port (debería estar en rango 1-65535)
    - twilio_whatsapp_from (debería empezar con +)
  Agregar serializer DRF con validators.
- POST /notificaciones/probar/ no tiene rate limiting. Un usuario podría spamear envíos 
  de prueba. Agregar throttle con DRF (ScopedRateThrottle).
- Los jobs de cobranza Celery (tasks.py) leen ConfiguracionNotificaciones en cada ejecución.
  Si hay miles de facturas, esto genera N queries. Cachear con Django cache framework (1 min TTL).

## [2026-07-01] Auditoría de performance — hallazgos pendientes (no implementados aún)

### Mapeo de stack (FASE 0)
- El directorio `backend/` (FastAPI, `main.py`/`routers/`) está **muerto**: no tiene `package.json`,
  no aparece en `deploy.sh`, y ningún `.env` del frontend apunta a su puerto. El módulo real de
  notificaciones que consume el frontend es `octopus-api/notificaciones/` (Django). Tampoco está
  en uso el directorio huérfano `C:\Octopus\src\modules\notifications\` (sin build, sin
  package.json) — parece un prototipo duplicado del mismo módulo. Ambos se pueden eliminar tras
  confirmar con el usuario, no se tocaron en esta sesión.
- `config/settings.py` solo define `DATABASES` con `sqlite3`, sin variante para producción.
  `PyMySQL` en `requirements.txt` no se usa en ningún lado — deuda técnica, no un motor activo.
  Si en producción real se usa MySQL, falta esa configuración en el repo.
- No hay `DEFAULT_PAGINATION_CLASS` global en `REST_FRAMEWORK` (config/settings.py) — cada listado
  pagina (o no) manualmente. Revisar caso por caso antes de asumir que un endpoint está paginado.

### Pendiente de FASE 1 (diagnosticado, no arreglado)
- **Falta de cache** pendiente en catálogos de `academico` (materias/lapsos) — no se tocó, mismo
  patrón que el resuelto abajo se puede replicar ahí si hace falta.
- **I/O bloqueante en request** (no se toca porque cambiar a Celery async rompería el contrato
  actual del frontend, que espera el archivo en la misma respuesta — requiere decisión de
  producto/UX antes de tocarlo): `cobranza/views.py` `ReciboView`, `ExportarAuditoriaExcelView`,
  `ExportarMorososExcelView`; `secretaria/views.py` `ExportarMatriculaGradoExcelView`/`PDFView`;
  `nomina/views.py` `ReciboNominaPDFView`. También `usuarios/views.py` `DatabaseBackupView` corre
  `subprocess` (`manage.py dumpdata`) de forma síncrona en el request.

### Resuelto en esta sesión
- **[RESUELTO]** Índices faltantes (migraciones nuevas, sin cambiar contrato):
  - `cobranza.Mensualidad.pagado` y `cobranza.Pago.fecha_pago` → `cobranza/migrations/0014_...`
  - `portal.ComprobantePago.estatus` y `.referencia_bancaria` → `portal/migrations/0004_...`
  - `secretaria.Alumno.grado_seccion` → `secretaria/migrations/0009_...`
  - `academico.Asistencia.fecha` → `academico/migrations/0006_...`
  - Aplicadas en `db.sqlite3` de dev. `makemigrations --check` confirma que no quedan cambios de
    modelo pendientes. Nota: como el modelo usa `django-simple-history`, las tablas
    `historical*` también recibieron el índice (esperado, no es un efecto colateral raro).
- **[RESUELTO]** N+1 en `multisede/views.py::DashboardConsolidadoView` — dos problemas apilados:
  1. La vista recalculaba en un loop aparte (líneas 289-302 originales) las mismas 4 métricas por
     sede que `SedeResumenSerializer` ya computaba. Se eliminó el loop; los totales ahora se
     derivan sumando `resumen_sedes` (ya calculado), sin re-consultar.
  2. **Bug real más grave, encontrado al medir queries**: `SedeResumenSerializer._total_sedes()`
     (`multisede/serializers.py:58-59`) usaba `self.context.get('total_sedes', Sede.objects...count())`
     — el segundo argumento de `dict.get()` se evalúa siempre en Python, sin importar si la clave
     ya existe, así que esa query de conteo se disparaba en cada una de las 4 llamadas por sede,
     ignorando por completo el valor que ya se pasaba por contexto. Se cambió a un `if total is
     None` explícito. Este bug por sí solo duplicaba el costo de todo el endpoint.
     Combinados: de 12 queries por sede a 4. Tests en
     `multisede/tests.py::DashboardConsolidadoNPlusOneTest`; verificado que fallan sin ambos fixes
     (12 vs 4) y pasan con ellos.
- **[RESUELTO]** N+1 en `secretaria/views.py::RepresentanteViewSet.get_queryset` (línea 992-995):
  `RepresentanteCRUDSerializer.get_portal_creado/get_portal_activo` accedían a `obj.portal_user`
  (OneToOne reverso hacia `portal.RepresentanteUser`) sin `select_related`, 1 query extra por
  representante listado. Se agregó `.select_related('portal_user')` al queryset (JOIN único, sin
  necesidad de `prefetch_related` porque es OneToOne). Tests nuevos en
  `secretaria/tests.py::RepresentanteViewSetNPlusOneTest` (no existían tests en esa app antes;
  archivo tenía solo el stub por defecto). Verificado que falla sin el fix (8 vs 4 queries con 5
  vs 1 representante) y pasa con el fix.
- **[RESUELTO]** Cache en catálogos/config estables:
  - `portal/views.py` `ConfiguracionColegioPublicaView` (público, se pega en cada carga del
    portal) — cache de 5 min + invalidación por señal `post_save` de `ConfiguracionSistema`
    (`secretaria/signals.py`, nuevo archivo, registrado en `secretaria/apps.py::ready()`).
  - `cobranza/views.py` `BancosListView` y `portal/views.py` `PortalBancosView` — cache de 5 min
    + invalidación por señal `post_save`/`post_delete` de `BancoInstitucional`
    (`cobranza/signals.py`).
  - El cache usa el backend de Django por defecto (LocMemCache, no hay `CACHES` en settings.py).
    En producción con varios workers gunicorn, LocMemCache es por-proceso: la invalidación por
    señal solo limpia el proceso que recibe el `save()`; el resto se corrige solo al expirar el
    TTL (5 min). Si se necesita invalidación instantánea entre workers, cambiar a Redis como
    backend de cache (ya está disponible para Celery). Anotado, no implementado.
  - Tests: `portal/tests.py::ConfiguracionColegioPublicaCacheTest`,
    `cobranza/tests.py::BancosListViewCacheTest`. Verificado que fallan sin el fix y pasan con él.
- **[RESUELTO]** N+1 en `multisede/views.py` `_get_pagos_de_sede` (usado por `DashboardSedeView.ultimos_pagos`):
  faltaba `select_related('alumno')`, causando 1 query extra por cada uno de los 5 últimos pagos.
  Se agregó al queryset base (no afecta a los otros usos que solo hacen `.aggregate()`). Tests
  nuevos en `multisede/tests.py::DashboardSedeNPlusOneTest` (no existían tests en esa app; se creó
  el archivo). Verificado que falla sin el fix (20 vs 16 queries con 5 vs 1 pago) y pasa con el fix.
- **[RESUELTO]** N+1 en `portal/views.py` `PortalDashboardView` (líneas 114-183): antes hacía
  2 queries de `Mensualidad` por cada alumno del representante en un loop Python. Ahora una sola
  query trae todas las mensualidades pendientes de los alumnos y se agrupan en Python respetando
  el orden cronológico (`Meta.ordering` de `Mensualidad` es `['anio','mes']`). Mismo JSON de
  salida. Tests en `portal/tests.py::PortalDashboardNPlusOneTest` (verificado que el nº de queries
  no escala con la cantidad de alumnos: 7 antes con 1 alumno vs. 11 con 3 alumnos en el código
  viejo, 7 en ambos casos con el fix).
- **[RESUELTO]** N+1 en `cobranza/serializers.py` `ComprobanteSerializer` (`get_desglose_pagos`,
  `get_total_ves`, `get_total_usd`): cada método hacía su propia query sobre `operacion_uuid`.
  Ahora comparten una sola consulta cacheada por operación (`_get_hermanos`). Tests en
  `cobranza/tests.py::ComprobanteSerializerNPlusOneTest`.
  Nota de comportamiento: el string de `total_usd`/`total_ves` ahora siempre trae 2 decimales
  (antes, cuando SQLite perdía ceros en el `Sum()` agregado, podía devolver `"15"` en vez de
  `"15.00"`). El frontend (`Comprobantes.jsx`) siempre hace `Number(...)` antes de mostrarlo, así
  que no afecta la UI, pero queda anotado por si algún consumidor externo depende del string exacto.

### Higiene de tests (detectado, no corregido)
- `octopus-api/media/comprobantes/pago_*.png` quedan como archivos sueltos tras correr el test
  suite completo (`portal/tests.py`, tests de comprobantes) — no hay limpieza en `tearDown`.
  No se tocó por estar fuera de alcance de esta auditoría de performance.
