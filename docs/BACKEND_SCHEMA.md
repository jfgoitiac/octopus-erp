# BACKEND SCHEMA — Esquema del Backend
**Versión:** 1.0  
**Fecha:** 2026-06-13  
**Proyecto:** Octopus — Módulos de Expansión  
**Framework:** Django + Django REST Framework

---

## 1. Estructura de Apps Django

```
octopus-api/
├── config/              # Configuración global (settings, urls, celery)
├── authentication/      # Usuarios, perfiles, RBAC (EXPANDIR)
├── cobranza/            # Facturación, pagos, mensualidades (existente)
├── portal/              # Portal de representantes (Fase 1, existente)
├── academico/           # NUEVO — Horarios, asistencia, calificaciones
├── comunicacion/        # NUEVO — Circulares y mensajería directa
├── admision/            # NUEVO — Pipeline de admisión online
└── notificaciones/      # NUEVO — Suscripciones push y log de envíos
```

---

## 2. Diagrama Entidad-Relación (ERD)

### Entidades existentes (referencia)
```
Alumno ──────────────── Representante
  │                          │
  │                    UsuarioPortal (portal)
  │
  ├── Grado
  └── Seccion
```

### Nuevas entidades y sus relaciones

```
academico
─────────────────────────────────────────────────────────────────

Docente (User Django)
  ├──< Horario >── Grado, Seccion, Materia
  │
  ├──< PlanEvaluacion >── Materia, Seccion
  │     └──< Calificacion >── Alumno
  │
  └──< MaterialEstudio >── Materia, Seccion

AsistenciaAlumno >── Alumno, Horario
IncidenteDisciplinario >── Alumno, User(registrado_por)
AlertaRendimiento >── Alumno

comunicacion
─────────────────────────────────────────────────────────────────

Circular
  └──< LecturaCircular >── UsuarioPortal

MensajeDirecto >── Alumno, User(docente), UsuarioPortal(representante)

admision
─────────────────────────────────────────────────────────────────

FormularioAdmision >── Grado, User(revisado_por), Alumno(alumno_creado)
  └──< DocumentoAdmision

authentication (extensión)
─────────────────────────────────────────────────────────────────

PerfilUsuario (existente) ── agrega campo `rol`
PermisoModulo >── (rol, modulo, accion) único
AuditoriaAccion >── User

notificaciones
─────────────────────────────────────────────────────────────────

SuscripcionPush >── UsuarioPortal
LogNotificacion >── (UsuarioPortal | User), Circular | MensajeDirecto
```

---

## 3. Esquema Completo de Tablas

### App: `academico`

```sql
-- Materias (puede ya existir como modelo)
CREATE TABLE academico_materia (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(20),
    activa BOOLEAN DEFAULT true
);

-- Horarios de clase
CREATE TABLE academico_horario (
    id SERIAL PRIMARY KEY,
    grado_id INTEGER NOT NULL REFERENCES cobranza_grado(id),
    seccion_id INTEGER NOT NULL REFERENCES cobranza_seccion(id),
    materia_id INTEGER NOT NULL REFERENCES academico_materia(id),
    docente_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 4),
    -- 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo BOOLEAN DEFAULT true,
    CONSTRAINT horario_no_solapado UNIQUE (seccion_id, dia_semana, hora_inicio)
);

-- Asistencia de alumnos
CREATE TABLE academico_asistencia_alumno (
    id SERIAL PRIMARY KEY,
    alumno_id INTEGER NOT NULL REFERENCES cobranza_alumno(id),
    horario_id INTEGER NOT NULL REFERENCES academico_horario(id),
    fecha DATE NOT NULL,
    estado CHAR(1) NOT NULL CHECK (estado IN ('P','A','J','R')),
    observacion TEXT DEFAULT '',
    registrado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT asistencia_unica UNIQUE (alumno_id, horario_id, fecha)
);

-- Incidentes disciplinarios
CREATE TABLE academico_incidente_disciplinario (
    id SERIAL PRIMARY KEY,
    alumno_id INTEGER NOT NULL REFERENCES cobranza_alumno(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    descripcion TEXT NOT NULL,
    severidad CHAR(1) NOT NULL CHECK (severidad IN ('L','M','G')),
    adjunto VARCHAR(500),  -- path del archivo
    registrado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Planes de evaluación
CREATE TABLE academico_plan_evaluacion (
    id SERIAL PRIMARY KEY,
    materia_id INTEGER NOT NULL REFERENCES academico_materia(id),
    seccion_id INTEGER NOT NULL REFERENCES cobranza_seccion(id),
    lapso SMALLINT NOT NULL CHECK (lapso IN (1,2,3)),
    actividades JSONB NOT NULL DEFAULT '[]',
    -- [{"nombre":"Examen","porcentaje":40,"fecha":"2026-10-01"}, ...]
    creado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT plan_unico UNIQUE (materia_id, seccion_id, lapso)
);

-- Calificaciones
CREATE TABLE academico_calificacion (
    id SERIAL PRIMARY KEY,
    alumno_id INTEGER NOT NULL REFERENCES cobranza_alumno(id),
    plan_evaluacion_id INTEGER NOT NULL REFERENCES academico_plan_evaluacion(id),
    actividad_index SMALLINT NOT NULL,  -- índice en el JSON de actividades
    nota DECIMAL(5,2) NOT NULL CHECK (nota >= 0 AND nota <= 20),
    comentario TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT calificacion_unica UNIQUE (alumno_id, plan_evaluacion_id, actividad_index)
);

-- Material de estudio
CREATE TABLE academico_material_estudio (
    id SERIAL PRIMARY KEY,
    materia_id INTEGER NOT NULL REFERENCES academico_materia(id),
    seccion_id INTEGER NOT NULL REFERENCES cobranza_seccion(id),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT DEFAULT '',
    archivo VARCHAR(500),
    enlace VARCHAR(2000),
    publicado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    fecha TIMESTAMP DEFAULT NOW()
);

-- Alertas de rendimiento académico
CREATE TABLE academico_alerta_rendimiento (
    id SERIAL PRIMARY KEY,
    alumno_id INTEGER NOT NULL REFERENCES cobranza_alumno(id),
    materia_id INTEGER REFERENCES academico_materia(id),
    lapso SMALLINT,
    promedio_actual DECIMAL(5,2),
    umbral_minimo DECIMAL(5,2),
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    resuelta_at TIMESTAMP
);
```

### App: `comunicacion`

```sql
-- Circulares / comunicados
CREATE TABLE comunicacion_circular (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    cuerpo TEXT NOT NULL,
    adjunto VARCHAR(500),
    publicado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    fecha_publicacion TIMESTAMP DEFAULT NOW(),
    requiere_confirmacion BOOLEAN DEFAULT false,
    activa BOOLEAN DEFAULT true
);

-- Relación circular ↔ destinatario con estado de lectura
CREATE TABLE comunicacion_lectura_circular (
    id SERIAL PRIMARY KEY,
    circular_id INTEGER NOT NULL REFERENCES comunicacion_circular(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES portal_usuario_portal(id) ON DELETE CASCADE,
    leido BOOLEAN DEFAULT false,
    fecha_lectura TIMESTAMP,
    CONSTRAINT lectura_unica UNIQUE (circular_id, usuario_id)
);

-- Mensajes directos docente ↔ representante
CREATE TABLE comunicacion_mensaje_directo (
    id SERIAL PRIMARY KEY,
    alumno_id INTEGER NOT NULL REFERENCES cobranza_alumno(id),
    -- Remitente (uno de los dos)
    remitente_docente_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    remitente_representante_id INTEGER REFERENCES portal_usuario_portal(id) ON DELETE SET NULL,
    -- Destinatario (uno de los dos)
    destinatario_docente_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    destinatario_representante_id INTEGER REFERENCES portal_usuario_portal(id) ON DELETE SET NULL,
    cuerpo TEXT NOT NULL,
    adjunto VARCHAR(500),
    leido BOOLEAN DEFAULT false,
    fecha TIMESTAMP DEFAULT NOW(),
    CONSTRAINT remitente_check CHECK (
        (remitente_docente_id IS NOT NULL) != (remitente_representante_id IS NOT NULL)
    )
);
```

### App: `admision`

```sql
-- Formularios de admisión
CREATE TABLE admision_formulario (
    id SERIAL PRIMARY KEY,
    -- Datos del candidato
    nombre_candidato VARCHAR(200) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    grado_solicitado_id INTEGER REFERENCES cobranza_grado(id) ON DELETE SET NULL,
    -- Datos del representante
    nombre_representante VARCHAR(200) NOT NULL,
    cedula_representante VARCHAR(20) NOT NULL,
    email_representante VARCHAR(254) NOT NULL,
    telefono_representante VARCHAR(20) NOT NULL,
    -- Estado del proceso
    estado VARCHAR(15) NOT NULL DEFAULT 'recibido'
        CHECK (estado IN ('recibido','revision','entrevista','aprobado','rechazado')),
    notas_internas TEXT DEFAULT '',
    revisado_por_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    -- Token único para seguimiento sin login
    token_seguimiento UUID DEFAULT gen_random_uuid() UNIQUE,
    -- Referencias una vez aprobado
    alumno_creado_id INTEGER REFERENCES cobranza_alumno(id) ON DELETE SET NULL,
    fecha_solicitud TIMESTAMP DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP DEFAULT NOW()
);

-- Documentos adjuntos de la solicitud
CREATE TABLE admision_documento (
    id SERIAL PRIMARY KEY,
    formulario_id INTEGER NOT NULL REFERENCES admision_formulario(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('partida','foto','boletin','otro')),
    archivo VARCHAR(500) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT NOW()
);
```

### App: `authentication` (extensiones)

```sql
-- Permisos granulares por rol y módulo
CREATE TABLE authentication_permiso_modulo (
    id SERIAL PRIMARY KEY,
    rol VARCHAR(20) NOT NULL,
    modulo VARCHAR(30) NOT NULL,
    accion VARCHAR(10) NOT NULL,
    permitido BOOLEAN DEFAULT false,
    CONSTRAINT permiso_unico UNIQUE (rol, modulo, accion)
);

-- Datos iniciales (migration)
-- Se poblan con los defaults de cada rol al crear la migración

-- Log de auditoría
CREATE TABLE authentication_auditoria_accion (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    accion VARCHAR(100) NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    objeto_id INTEGER,
    objeto_tipo VARCHAR(100) DEFAULT '',
    datos_antes JSONB,
    datos_despues JSONB,
    ip_address INET,
    fecha TIMESTAMP DEFAULT NOW()
);

-- Índice para búsquedas frecuentes de auditoría
CREATE INDEX idx_auditoria_usuario ON authentication_auditoria_accion(usuario_id);
CREATE INDEX idx_auditoria_fecha ON authentication_auditoria_accion(fecha DESC);
CREATE INDEX idx_auditoria_modulo ON authentication_auditoria_accion(modulo);
```

### App: `notificaciones` (extensión de la existente)

```sql
-- Suscripciones Web Push
CREATE TABLE notificaciones_suscripcion_push (
    id SERIAL PRIMARY KEY,
    usuario_portal_id INTEGER NOT NULL REFERENCES portal_usuario_portal(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    activa BOOLEAN DEFAULT true,
    tipos_activos JSONB DEFAULT '["circular","nota","factura","mensaje"]',
    fecha_registro TIMESTAMP DEFAULT NOW()
);

-- Log de notificaciones enviadas
CREATE TABLE notificaciones_log (
    id SERIAL PRIMARY KEY,
    -- Destinatario (uno de los dos)
    usuario_portal_id INTEGER REFERENCES portal_usuario_portal(id) ON DELETE SET NULL,
    usuario_admin_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    canal VARCHAR(20) NOT NULL CHECK (canal IN ('email','push','whatsapp')),
    tipo VARCHAR(30) NOT NULL,  -- 'circular', 'nota', 'factura', 'mensaje'
    titulo VARCHAR(255),
    cuerpo TEXT,
    estado VARCHAR(10) NOT NULL CHECK (estado IN ('enviado','fallido','pendiente')),
    error_detalle TEXT,
    fecha TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Índices de Performance Recomendados

```sql
-- Asistencia: consultas frecuentes por alumno + fecha
CREATE INDEX idx_asistencia_alumno_fecha ON academico_asistencia_alumno(alumno_id, fecha DESC);
CREATE INDEX idx_asistencia_horario_fecha ON academico_asistencia_alumno(horario_id, fecha);

-- Calificaciones: consultas por plan y alumno
CREATE INDEX idx_calificacion_plan ON academico_calificacion(plan_evaluacion_id);
CREATE INDEX idx_calificacion_alumno ON academico_calificacion(alumno_id);

-- Mensajes: bandeja de entrada
CREATE INDEX idx_mensaje_destinatario_docente ON comunicacion_mensaje_directo(destinatario_docente_id, leido);
CREATE INDEX idx_mensaje_destinatario_rep ON comunicacion_mensaje_directo(destinatario_representante_id, leido);

-- Circulares: no leídas por usuario
CREATE INDEX idx_lectura_usuario_leido ON comunicacion_lectura_circular(usuario_id, leido);

-- Admisión: pipeline por estado
CREATE INDEX idx_admision_estado ON admision_formulario(estado, fecha_actualizacion DESC);

-- Auditoría: búsqueda por fecha (log histórico grande)
CREATE INDEX idx_auditoria_fecha_brin ON authentication_auditoria_accion USING BRIN (fecha);
```

---

## 5. Estructura de URLs por App

### `academico/urls.py`
```python
urlpatterns = [
    # Horarios
    path('horarios/', HorarioListCreateView.as_view()),
    path('horarios/<int:pk>/', HorarioDetailView.as_view()),
    
    # Asistencia
    path('asistencia/', AsistenciaListView.as_view()),
    path('asistencia/bulk/', AsistenciaBulkCreateView.as_view()),
    path('asistencia/reporte/', AsistenciaReporteView.as_view()),
    
    # Incidentes
    path('incidentes/', IncidenteListCreateView.as_view()),
    path('incidentes/<int:pk>/', IncidenteDetailView.as_view()),
    
    # Portal docente
    path('docente/mis-materias/', DocenteMateriasView.as_view()),
    
    # Planes y calificaciones
    path('planes/', PlanEvaluacionListCreateView.as_view()),
    path('planes/<int:pk>/', PlanEvaluacionDetailView.as_view()),
    path('calificaciones/', CalificacionListView.as_view()),
    path('calificaciones/bulk/', CalificacionBulkCreateView.as_view()),
    
    # Material
    path('materiales/', MaterialEstudioListCreateView.as_view()),
    path('materiales/<int:pk>/', MaterialEstudioDetailView.as_view()),
    
    # Rendimiento (gráficas)
    path('rendimiento/alumno/<int:alumno_id>/', RendimientoAlumnoView.as_view()),
    path('rendimiento/seccion/<int:seccion_id>/', RendimientoSeccionView.as_view()),
    path('rendimiento/alertas/', AlertasRendimientoView.as_view()),
]
```

### `comunicacion/urls.py`
```python
urlpatterns = [
    path('circulares/', CircularListCreateView.as_view()),
    path('circulares/<int:pk>/', CircularDetailView.as_view()),
    path('circulares/<int:pk>/confirmar/', ConfirmarLecturaView.as_view()),
    path('circulares/<int:pk>/lecturas/', CircularLecturasView.as_view()),
    path('mensajes/', MensajeDirectoListCreateView.as_view()),
    path('mensajes/<int:pk>/leer/', MarcarMensajeLeido.as_view()),
]
```

### `admision/urls.py`
```python
urlpatterns = [
    path('solicitud/', SolicitudAdmisionCreateView.as_view()),           # público
    path('solicitud/<uuid:token>/status/', SolicitudStatusPublica.as_view()),  # público con token
    path('solicitudes/', SolicitudAdmisionListView.as_view()),
    path('solicitudes/<int:pk>/', SolicitudAdmisionDetailView.as_view()),
    path('solicitudes/<int:pk>/estado/', CambiarEstadoSolicitud.as_view()),
    path('solicitudes/<int:pk>/aprobar/', AprobarSolicitud.as_view()),
]
```

### `authentication/urls.py` (extensiones)
```python
urlpatterns += [
    path('permisos/', PermisoModuloListView.as_view()),
    path('permisos/<str:rol>/', PermisosPorRolView.as_view()),
    path('permisos/<str:rol>/<str:modulo>/<str:accion>/', TogglePermisoView.as_view()),
    path('auditoria/', AuditoriaListView.as_view()),
]
```

### `notificaciones/urls.py` (extensiones)
```python
urlpatterns += [
    path('push/suscribir/', SuscripcionPushView.as_view()),
    path('push/desuscribir/', DesuscripcionPushView.as_view()),
    path('push/tipos/', ActualizarTiposPushView.as_view()),
]
```

---

## 6. Tareas Celery por Módulo

```python
# academico/tasks.py
@shared_task
def generar_alertas_rendimiento():
    """Cron job diario: detecta alumnos bajo el mínimo aprobatorio y crea AlertaRendimiento."""
    pass

# comunicacion/tasks.py
@shared_task
def enviar_email_circular(circular_id):
    """Envía email a todos los destinatarios de una circular."""
    pass

@shared_task
def enviar_email_mensaje(mensaje_id):
    """Notifica por email al destinatario de un mensaje directo."""
    pass

# admision/tasks.py
@shared_task
def enviar_confirmacion_solicitud(formulario_id):
    """Email al representante con token de seguimiento."""
    pass

@shared_task
def notificar_cambio_estado(formulario_id, estado_nuevo):
    """Email al representante cuando cambia el estado de su solicitud."""
    pass

# notificaciones/tasks.py
@shared_task
def enviar_push(suscripcion_id, titulo, cuerpo, url='/portal'):
    """Envía Web Push a una suscripción específica vía pywebpush."""
    pass

@shared_task
def enviar_push_masivo(tipo, payload):
    """Envía Web Push a todos los usuarios suscritos a un tipo."""
    pass
```

### Cron Jobs (Celery Beat)
```python
# config/celery.py
from celery.schedules import crontab

app.conf.beat_schedule = {
    # Alertas académicas: diario a las 06:00
    'alertas-rendimiento-diario': {
        'task': 'academico.tasks.generar_alertas_rendimiento',
        'schedule': crontab(hour=6, minute=0),
    },
    # Recordatorios de cobranza (ya existente, mantener)
    'recordatorios-cobranza': {
        'task': 'cobranza.tasks.enviar_recordatorios',
        'schedule': crontab(hour=8, minute=0),
    },
}
```

---

## 7. Permisos por Rol — Matriz Inicial

| Módulo | superadmin | director | coordinador | docente | representante | alumno |
|--------|-----------|---------|------------|---------|--------------|-------|
| **Inscripciones** | VCEE | VCEE | VC_E | V | — | — |
| **Cobranza** | VCEE | VCEE | V | — | V(propios) | — |
| **Académico** | VCEE | VCEE | VC_E | V+C(propios) | V(hijos) | V(propio) |
| **Comunicación** | VCEE | VCEE | VC_E | VCE | V | — |
| **Reportes** | VCEE | VCEE | V | V(propios) | — | — |
| **Configuración** | VCEE | VCE_ | — | — | — | — |
| **Roles (RBAC)** | VCEE | VCE_ | — | — | — | — |

`V`=Ver, `C`=Crear, `E`=Editar, `_`=sin permiso, `E`(segundo)=Eliminar

---

## 8. Migraciones — Orden de Ejecución

```bash
# 1. Crear apps nuevas
python manage.py startapp academico
python manage.py startapp comunicacion
python manage.py startapp admision

# 2. Agregar a INSTALLED_APPS en settings.py

# 3. Crear y aplicar migraciones en orden (por dependencias FK)
python manage.py makemigrations academico
python manage.py makemigrations comunicacion
python manage.py makemigrations admision
python manage.py makemigrations authentication  # extensión RBAC
python manage.py makemigrations notificaciones  # extensión push

python manage.py migrate

# 4. Poblar permisos por defecto
python manage.py poblar_permisos_rbac  # management command nuevo

# 5. Generar claves VAPID para Web Push
pip install py-vapid
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.private_pem()); print(v.public_key)"
```
