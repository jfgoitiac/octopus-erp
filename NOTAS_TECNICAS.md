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

**2. Usuarios de portal deben crearse manualmente por ahora**
No existe todavía una vista/comando para crear `RepresentanteUser` en masa. Hay que hacerlo desde el shell de Django o el admin. Se recomienda crear un management command `python manage.py crear_usuarios_portal` que itere sobre todos los `Representante` existentes y cree sus usuarios con la cédula como contraseña inicial forzando cambio de clave.

**3. Celery no está configurado para producción**
`portal/tasks.py` y `cobranza/celery.py` usan Celery pero no hay configuración de broker en `settings.py` para producción. Actualmente solo funciona con `task_always_eager=True` en desarrollo. Se debe configurar Redis o RabbitMQ como broker y correr un worker:
```bash
celery -A config worker -l info
```

**4. `programar_notificaciones_mensualidad` no está conectada al flujo de creación de mensualidades**
La función existe en `portal/tasks.py` pero no se llama en ningún lado. Debe conectarse vía señal `post_save` en `cobranza/signals.py` o desde la view que genera las mensualidades anuales.

**5. Email backend apunta a consola en desarrollo**
`settings.py` usa `EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'`. Para producción, cambiar a `smtp.EmailBackend` y configurar las variables de entorno `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`.

**6. `related_name` de `RepresentanteUser` es `portal_user` pero `views.py` usa `representante_portal`**
Revisar consistencia: `models.py` define `related_name='portal_user'` en la FK a Representante, pero `views.py` accede con `request.user.representante_portal`. El `related_name='representante_portal'` está en la FK al User de Django — eso es correcto. Solo verificar al hacer pruebas.

**7. No hay límite de tamaño para comprobantes subidos**
`PortalComprobantePagoView` no valida el tamaño del archivo. Un representante podría subir archivos muy grandes. Agregar validación de máximo 5MB antes de guardar.

**8. Stripe no implementado**
El botón "Pagar en línea" está deshabilitado en el frontend con `cursor-not-allowed`. Para implementarlo: instalar `stripe` en el backend, crear endpoint `POST /api/portal/stripe/checkout/` que genere una `Session` de Stripe Checkout y retorne la URL de redirect. El frontend solo necesita `window.location.href = url`.

---

### Frontend

**9. `date-fns/locale/es` import puede variar según versión**
Si hay error de import con `from 'date-fns/locale/es'`, cambiar a `import { es } from 'date-fns/locale'`.

**10. Tailwind v4 — clases de color personalizadas**
El portal usa `#0fa3b1` como color primario hardcodeado en varios componentes. Cuando se lea el perfil del colegio desde la API (spec lo menciona), centralizar en una variable CSS o en `tailwind.config.js`.

**11. Sin manejo de token expirado en `PortalProtectedRoute`**
`PortalProtectedRoute` verifica expiración al montar, pero si el token expira mientras el representante usa la app y el refresh falla silenciosamente, puede quedar en un estado inconsistente. Agregar un intervalo de verificación periódica o escuchar el evento de 401 del `portalClient`.

**12. `ultimos_pagos` en el dashboard no filtra por `alumnoActivo`**
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
