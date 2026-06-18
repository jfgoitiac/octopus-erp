# TRD — Documento de Requerimientos Técnicos
**Versión:** 1.0  
**Fecha:** 2026-06-13  
**Proyecto:** Octopus — Expansión de Plataforma  
**Basado en:** PRD_EXPANSION.md v1.0

---

## 1. Stack Tecnológico de Referencia

### Frontend (existente — no modificar sin aprobación)
| Tecnología | Versión | Rol |
|-----------|---------|-----|
| React | 19 | UI framework |
| Vite | 8 | Bundler |
| react-router-dom | v7 | Routing |
| Tailwind CSS | v4 | Estilos |
| Axios | latest | HTTP client |
| lucide-react | latest | Íconos |
| react-toastify | latest | Notificaciones UI |
| jsPDF + jspdf-autotable | latest | PDFs |
| xlsx | latest | Exportación Excel |
| date-fns + react-datepicker | latest | Fechas |
| jwt-decode | latest | Auth local |

### Frontend (nuevas dependencias propuestas — requieren aprobación)
| Tecnología | Módulo que la requiere | Justificación |
|-----------|----------------------|---------------|
| `recharts` | Seguimiento Gráfico | Gráficas de línea y barras — alternativa: `chart.js` |
| `vite-plugin-pwa` | PWA | Plugin oficial Vite para Service Worker + manifest |
| `socket.io-client` | Comunicación tiempo real | WebSocket client — solo si se escala a Channels |

### Backend (existente)
| Tecnología | Versión | Rol |
|-----------|---------|-----|
| Django | 4.x | Framework principal |
| Django REST Framework | latest | API REST |
| Celery | latest | Jobs asíncronos |
| SQLite → PostgreSQL | — | BD (migrar en producción) |
| Simple JWT | latest | Autenticación JWT |

### Backend (nuevas dependencias propuestas)
| Tecnología | Módulo que la requiere | Justificación |
|-----------|----------------------|---------------|
| `pywebpush` | PWA / Notificaciones push | Web Push API desde Django |
| `django-guardian` | RBAC | Permisos granulares por objeto (evaluar vs. custom) |
| `Django Channels` | Comunicación tiempo real | WebSockets — solo Fase 2+ del módulo |
| `channels_redis` | Django Channels | Requiere Redis como channel layer |
| `Pillow` | Diario de Clases | Validación y resizing de adjuntos fotográficos |

---

## 2. Requerimientos Técnicos por Módulo

---

### 2.1 Diario de Clases y Horarios

#### Modelos de datos (Django)
```python
# Nuevo app: `academico`

class Horario(models.Model):
    grado = models.ForeignKey('Grado', on_delete=models.CASCADE)
    seccion = models.ForeignKey('Seccion', on_delete=models.CASCADE)
    materia = models.ForeignKey('Materia', on_delete=models.CASCADE)
    docente = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    dia_semana = models.IntegerField(choices=[(0,'Lunes'),(1,'Martes'),...])
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()

class AsistenciaAlumno(models.Model):
    ESTADOS = [('P','Presente'),('A','Ausente'),('J','Justificado'),('R','Retardado')]
    alumno = models.ForeignKey('Alumno', on_delete=models.CASCADE)
    horario = models.ForeignKey(Horario, on_delete=models.CASCADE)
    fecha = models.DateField()
    estado = models.CharField(max_length=1, choices=ESTADOS, default='P')
    observacion = models.TextField(blank=True)
    registrado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    class Meta:
        unique_together = ('alumno', 'horario', 'fecha')

class IncidenteDisciplinario(models.Model):
    SEVERIDADES = [('L','Leve'),('M','Moderado'),('G','Grave')]
    alumno = models.ForeignKey('Alumno', on_delete=models.CASCADE)
    fecha = models.DateField(auto_now_add=True)
    descripcion = models.TextField()
    severidad = models.CharField(max_length=1, choices=SEVERIDADES)
    adjunto = models.ImageField(upload_to='incidentes/', blank=True, null=True)
    registrado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
```

#### Endpoints REST
| Método | Ruta | Descripción | Roles permitidos |
|--------|------|-------------|-----------------|
| GET | `/api/academico/horarios/` | Lista horarios (filtros: grado, seccion, docente) | admin, director, docente |
| POST | `/api/academico/horarios/` | Crear bloque de horario | admin, director |
| PUT | `/api/academico/horarios/{id}/` | Editar horario | admin, director |
| DELETE | `/api/academico/horarios/{id}/` | Eliminar bloque | admin, director |
| GET | `/api/academico/asistencia/` | Lista asistencias (filtros: alumno, fecha_inicio, fecha_fin, materia) | admin, director, docente |
| POST | `/api/academico/asistencia/bulk/` | Registrar asistencia de toda una sección | docente |
| GET | `/api/academico/asistencia/reporte/` | Reporte acumulado exportable (PDF/Excel) | admin, director |
| GET | `/api/academico/incidentes/` | Lista incidentes (filtros: alumno, fecha, severidad) | admin, director, docente |
| POST | `/api/academico/incidentes/` | Crear incidente (multipart/form-data para adjunto) | docente |

#### Restricciones técnicas
- El campo `adjunto` de `IncidenteDisciplinario` debe validarse: máx 5MB, solo JPEG/PNG/WEBP.
- El reporte de asistencia se genera con `jsPDF` en el frontend sobre datos del endpoint `/reporte/`. El backend devuelve JSON estructurado.
- El endpoint `/bulk/` recibe array de `{ alumno_id, estado, observacion }` y los persiste en una transacción atómica.

---

### 2.2 Módulo de Comunicación (Mensajería Bidireccional)

#### Modelos de datos
```python
# Nuevo app: `comunicacion`

class Circular(models.Model):
    titulo = models.CharField(max_length=255)
    cuerpo = models.TextField()
    adjunto = models.FileField(upload_to='circulares/', blank=True, null=True)
    publicado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    fecha_publicacion = models.DateTimeField(auto_now_add=True)
    requiere_confirmacion = models.BooleanField(default=False)
    destinatarios = models.ManyToManyField('portal.UsuarioPortal', through='LecturaCircular')

class LecturaCircular(models.Model):
    circular = models.ForeignKey(Circular, on_delete=models.CASCADE)
    usuario = models.ForeignKey('portal.UsuarioPortal', on_delete=models.CASCADE)
    leido = models.BooleanField(default=False)
    fecha_lectura = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        unique_together = ('circular', 'usuario')

class MensajeDirecto(models.Model):
    alumno = models.ForeignKey('Alumno', on_delete=models.CASCADE)
    remitente_docente = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    remitente_representante = models.ForeignKey('portal.UsuarioPortal', on_delete=models.SET_NULL, null=True, blank=True)
    destinatario_docente = models.ForeignKey(User, related_name='mensajes_recibidos', on_delete=models.SET_NULL, null=True, blank=True)
    destinatario_representante = models.ForeignKey('portal.UsuarioPortal', related_name='mensajes_recibidos', on_delete=models.SET_NULL, null=True, blank=True)
    cuerpo = models.TextField()
    adjunto = models.FileField(upload_to='mensajes/', blank=True, null=True)
    fecha = models.DateTimeField(auto_now_add=True)
    leido = models.BooleanField(default=False)
```

#### Endpoints REST
| Método | Ruta | Descripción | Roles permitidos |
|--------|------|-------------|-----------------|
| GET | `/api/comunicacion/circulares/` | Lista circulares (paginado) | admin, director, representante |
| POST | `/api/comunicacion/circulares/` | Publicar circular | admin, director |
| POST | `/api/comunicacion/circulares/{id}/confirmar/` | Marcar como leído | representante |
| GET | `/api/comunicacion/circulares/{id}/lecturas/` | Ver quién leyó | admin, director |
| GET | `/api/comunicacion/mensajes/` | Bandeja (filtro: alumno_id) | docente, representante |
| POST | `/api/comunicacion/mensajes/` | Enviar mensaje | docente, representante |
| PATCH | `/api/comunicacion/mensajes/{id}/leer/` | Marcar como leído | destinatario |

#### Notificaciones automáticas por email
- Al publicar circular con `requiere_confirmacion=True`: email a todos los destinatarios (tarea Celery).
- Al recibir mensaje directo: email al destinatario con asunto "Nuevo mensaje sobre [alumno]".
- Ambas tareas usan el mismo sistema Celery ya configurado en `cobranza/celery.py`.

#### Estrategia tiempo real
- **Fase inicial (polling):** Frontend hace GET cada 30 segundos al endpoint de mensajes no leídos.
- **Fase escala (>50 colegios):** Migrar a Django Channels + Redis. El endpoint de polling sigue funcionando como fallback.

---

### 2.3 Portal Docente

#### Modelos de datos
```python
# Extensión del app `academico`

class PlanEvaluacion(models.Model):
    materia = models.ForeignKey('Materia', on_delete=models.CASCADE)
    seccion = models.ForeignKey('Seccion', on_delete=models.CASCADE)
    lapso = models.IntegerField(choices=[(1,'Lapso 1'),(2,'Lapso 2'),(3,'Lapso 3')])
    actividades = models.JSONField(default=list)
    # Estructura de actividades:
    # [{"nombre": "Examen", "porcentaje": 40, "fecha": "2026-10-01"}, ...]

class Calificacion(models.Model):
    alumno = models.ForeignKey('Alumno', on_delete=models.CASCADE)
    plan_evaluacion = models.ForeignKey(PlanEvaluacion, on_delete=models.CASCADE)
    actividad_index = models.IntegerField()
    nota = models.DecimalField(max_digits=5, decimal_places=2)
    comentario = models.TextField(blank=True)
    
    class Meta:
        unique_together = ('alumno', 'plan_evaluacion', 'actividad_index')

class MaterialEstudio(models.Model):
    materia = models.ForeignKey('Materia', on_delete=models.CASCADE)
    seccion = models.ForeignKey('Seccion', on_delete=models.CASCADE)
    titulo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    archivo = models.FileField(upload_to='materiales/', blank=True, null=True)
    enlace = models.URLField(blank=True)
    publicado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    fecha = models.DateTimeField(auto_now_add=True)
```

#### Endpoints REST
| Método | Ruta | Descripción | Roles permitidos |
|--------|------|-------------|-----------------|
| GET | `/api/academico/docente/mis-materias/` | Materias y secciones asignadas al docente autenticado | docente |
| GET | `/api/academico/planes/` | Planes de evaluación (filtro: materia, seccion, lapso) | docente, director |
| POST | `/api/academico/planes/` | Crear plan de evaluación | docente |
| PUT | `/api/academico/planes/{id}/` | Editar plan | docente (propietario) |
| GET | `/api/academico/calificaciones/` | Notas (filtro: plan, alumno) | docente, director |
| POST | `/api/academico/calificaciones/bulk/` | Guardar notas de toda una actividad | docente |
| GET | `/api/academico/materiales/` | Material de estudio | docente, representante, alumno |
| POST | `/api/academico/materiales/` | Subir material | docente |

#### Auth del portal docente
- El docente usa el mismo JWT del panel admin (no requiere autenticación separada).
- Las rutas del portal docente viven en `/portal-docente/` en el frontend.
- El backend filtra automáticamente por `request.user` para devolver solo sus materias/secciones.

---

### 2.4 Seguimiento Gráfico del Rendimiento

#### Lógica de cálculo (backend)
- Promedio por lapso: media aritmética de todas las `Calificacion` de un alumno en un lapso, ponderada por `porcentaje` de cada actividad.
- Promedio mínimo configurable: se lee de `Configuracion.promedio_minimo_aprobatorio` (default: 10.00 / escala 20).
- Alerta temprana: si promedio actual < 70% del mínimo aprobatorio → crear registro en `AlertaRendimiento`.

#### Endpoints REST
| Método | Ruta | Descripción | Roles permitidos |
|--------|------|-------------|-----------------|
| GET | `/api/academico/rendimiento/alumno/{id}/` | Promedios por lapso y materia | representante (solo sus hijos), director, coordinador |
| GET | `/api/academico/rendimiento/seccion/{id}/` | Resumen por sección (para mapa de calor) | director, coordinador |
| GET | `/api/academico/rendimiento/alertas/` | Alumnos en riesgo académico | director, coordinador |

#### Estructura de respuesta (alumno)
```json
{
  "alumno": { "id": 1, "nombre": "Juan Pérez" },
  "por_lapso": [
    {
      "lapso": 1,
      "promedio_general": 14.5,
      "por_materia": [
        { "materia": "Matemáticas", "promedio": 12.0 },
        { "materia": "Lengua", "promedio": 17.0 }
      ]
    }
  ],
  "asistencia": { "total_clases": 80, "presentes": 72, "porcentaje": 90.0 },
  "en_riesgo": false
}
```

#### Librería de gráficas (frontend)
- **Propuesta:** `recharts` — declarativa, compatible con React 19, sin canvas (más accesible).
- **Alternativa:** `chart.js` con wrapper `react-chartjs-2` — más madura pero requiere más config.
- **Decisión pendiente de aprobación del cliente** antes de instalar.

---

### 2.5 Sistema de Permisos Granulares (RBAC)

#### Roles definidos
```python
ROLES = [
    ('superadmin', 'Super Administrador'),   # acceso total, multi-sede futura
    ('director', 'Director'),                 # acceso total a su sede
    ('coordinador', 'Coordinador'),           # lectura + aprobación sin configuración
    ('docente', 'Docente'),                   # solo sus materias/secciones
    ('representante', 'Representante'),       # solo sus hijos (portal separado)
    ('alumno', 'Alumno'),                     # lectura de sus propios datos
]
```

#### Modelo de permisos
```python
# Extensión de `authentication` app

class PermisoModulo(models.Model):
    MODULOS = [
        ('inscripciones', 'Inscripciones'),
        ('cobranza', 'Cobranza'),
        ('academico', 'Módulo Académico'),
        ('comunicacion', 'Comunicación'),
        ('reportes', 'Reportes'),
        ('configuracion', 'Configuración'),
    ]
    ACCIONES = [('ver','Ver'),('crear','Crear'),('editar','Editar'),('eliminar','Eliminar')]
    
    rol = models.CharField(max_length=20, choices=ROLES)
    modulo = models.CharField(max_length=30, choices=MODULOS)
    accion = models.CharField(max_length=10, choices=ACCIONES)
    permitido = models.BooleanField(default=False)
    
    class Meta:
        unique_together = ('rol', 'modulo', 'accion')

class AuditoriaAccion(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    accion = models.CharField(max_length=100)
    modulo = models.CharField(max_length=50)
    objeto_id = models.IntegerField(null=True, blank=True)
    objeto_tipo = models.CharField(max_length=100, blank=True)
    datos_antes = models.JSONField(null=True)
    datos_despues = models.JSONField(null=True)
    ip_address = models.GenericIPAddressField(null=True)
    fecha = models.DateTimeField(auto_now_add=True)
```

#### Implementación en DRF
- Crear `RBACPermission(BasePermission)` custom que consulte `PermisoModulo` para el rol del usuario.
- Middleware de auditoría: señal `post_save` / `post_delete` que registra en `AuditoriaAccion`.
- Panel de administración de roles en `/admin/` de Django (o nueva página en el frontend en Fase 2).

---

### 2.6 PWA / Notificaciones Push

#### Service Worker + Manifest
```json
// manifest.json
{
  "name": "Octopus — Portal Educativo",
  "short_name": "Octopus",
  "start_url": "/portal",
  "display": "standalone",
  "background_color": "#0fa3b1",
  "theme_color": "#0fa3b1",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### Config Vite PWA
```js
// vite.config.js — agregar plugin
import { VitePWA } from 'vite-plugin-pwa'

plugins: [
  VitePWA({
    registerType: 'autoUpdate',
    manifest: { /* ver arriba */ },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      runtimeCaching: [/* estrategias de caché por ruta */]
    }
  })
]
```

#### Backend — Web Push
```python
# Nuevo modelo en `notificaciones`

class SuscripcionPush(models.Model):
    usuario_portal = models.ForeignKey('portal.UsuarioPortal', on_delete=models.CASCADE)
    endpoint = models.URLField(max_length=500)
    p256dh = models.TextField()
    auth = models.TextField()
    activa = models.BooleanField(default=True)
    tipos_activos = models.JSONField(default=list)
    # tipos: ['circular', 'nota', 'factura', 'mensaje']
    fecha_registro = models.DateTimeField(auto_now_add=True)
```

```python
# Tarea Celery para enviar push
from pywebpush import webpush, WebPushException

@shared_task
def enviar_push(suscripcion_id, titulo, cuerpo, url='/portal'):
    sub = SuscripcionPush.objects.get(id=suscripcion_id)
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps({"title": titulo, "body": cuerpo, "url": url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.VAPID_EMAIL}"}
        )
    except WebPushException as e:
        if e.response.status_code == 410:  # suscripción expirada
            sub.activa = False
            sub.save()
```

#### Variables de entorno requeridas
```
VAPID_PUBLIC_KEY=<generar con py-vapid>
VAPID_PRIVATE_KEY=<generar con py-vapid>
VAPID_EMAIL=admin@octopus.app
```

---

### 2.7 Módulo de Admisión Online

#### Modelos de datos
```python
# Nuevo app: `admision`

class FormularioAdmision(models.Model):
    ESTADOS = [
        ('recibido', 'Recibido'),
        ('revision', 'En Revisión'),
        ('entrevista', 'Entrevista'),
        ('aprobado', 'Aprobado'),
        ('rechazado', 'Rechazado'),
    ]
    # Datos del candidato
    nombre_candidato = models.CharField(max_length=200)
    fecha_nacimiento = models.DateField()
    grado_solicitado = models.ForeignKey('Grado', on_delete=models.SET_NULL, null=True)
    
    # Datos del representante
    nombre_representante = models.CharField(max_length=200)
    cedula_representante = models.CharField(max_length=20)
    email_representante = models.EmailField()
    telefono_representante = models.CharField(max_length=20)
    
    # Estado del proceso
    estado = models.CharField(max_length=15, choices=ESTADOS, default='recibido')
    notas_internas = models.TextField(blank=True)
    fecha_solicitud = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    revisado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Al aprobar → referencia al alumno creado
    alumno_creado = models.OneToOneField('Alumno', on_delete=models.SET_NULL, null=True, blank=True)

class DocumentoAdmision(models.Model):
    TIPOS = [('partida','Partida de Nacimiento'),('foto','Fotografía'),('boletin','Boletín Anterior'),('otro','Otro')]
    formulario = models.ForeignKey(FormularioAdmision, on_delete=models.CASCADE, related_name='documentos')
    tipo = models.CharField(max_length=20, choices=TIPOS)
    archivo = models.FileField(upload_to='admision/documentos/')
    fecha_subida = models.DateTimeField(auto_now_add=True)
```

#### Endpoints REST
| Método | Ruta | Descripción | Roles permitidos |
|--------|------|-------------|-----------------|
| POST | `/api/admision/solicitud/` | Crear solicitud (público, sin auth) | Público |
| GET | `/api/admision/solicitudes/` | Listar pipeline | admin, director, coordinador |
| GET | `/api/admision/solicitudes/{id}/` | Detalle de solicitud | admin, director, coordinador |
| PATCH | `/api/admision/solicitudes/{id}/estado/` | Cambiar estado del pipeline | director, coordinador |
| POST | `/api/admision/solicitudes/{id}/aprobar/` | Aprobar → crear alumno e inscripción | director |
| GET | `/api/admision/solicitud/{token}/status/` | Estado para el representante (token único) | Público con token |

#### Lógica de aprobación automática
Al hacer POST a `/aprobar/`:
1. Crear `Alumno` con datos del formulario.
2. Crear `Representante` vinculado.
3. Crear `UsuarioPortal` para el representante (contraseña temporal = cédula).
4. Enviar email al representante con credenciales del portal.
5. Marcar `formulario.estado = 'aprobado'` y `formulario.alumno_creado = nuevo_alumno`.
Todo en una transacción atómica (`transaction.atomic()`).

---

## 3. Requerimientos No Funcionales

| Requerimiento | Especificación |
|--------------|---------------|
| **Performance** | Endpoints de lista responden en < 500ms con hasta 1000 registros (paginación de 25 por página) |
| **Mobile** | Todos los componentes nuevos funcionales en viewport 375px sin scroll horizontal |
| **Seguridad** | Todos los endpoints nuevos requieren JWT válido, excepto `/api/admision/solicitud/` y `/api/admision/solicitud/{token}/status/` |
| **Archivos** | Máximo 5MB por archivo. Tipos permitidos: PDF, JPEG, PNG, WEBP. Validación en backend y frontend |
| **Concurrencia** | El endpoint `/bulk/` de asistencia y calificaciones usa `transaction.atomic()` |
| **Auditoría** | Toda acción de escritura en módulos sensibles (calificaciones, RBAC) se registra en `AuditoriaAccion` |
| **Caché** | Promedios y estadísticas de rendimiento se cachean 5 minutos con Django cache framework |
| **Compatibilidad push** | Web Push requiere iOS 16.4+. Para versiones anteriores: fallback a email |

---

## 4. Migraciones de Base de Datos

| App nueva | Comando |
|-----------|---------|
| `academico` | `python manage.py makemigrations academico && python manage.py migrate academico` |
| `comunicacion` | `python manage.py makemigrations comunicacion && python manage.py migrate comunicacion` |
| `admision` | `python manage.py makemigrations admision && python manage.py migrate admision` |
| Extensión `authentication` (RBAC) | `python manage.py makemigrations authentication && python manage.py migrate authentication` |

---

## 5. Variables de Entorno Nuevas Requeridas

```env
# PWA / Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=

# Celery (producción)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Django Channels (solo si se activa mensajería en tiempo real)
CHANNEL_LAYERS_HOST=localhost
CHANNEL_LAYERS_PORT=6379
```
