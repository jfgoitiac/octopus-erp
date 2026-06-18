# PLAN DE IMPLEMENTACIÓN
**Versión:** 1.0  
**Fecha:** 2026-06-13  
**Proyecto:** Octopus — Módulos de Expansión  
**Basado en:** PRD_EXPANSION.md + TRD.md

---

## Principios de implementación

- Cada módulo se entrega como una rama de Git independiente (`feat/modulo-nombre`).
- No se mezclan módulos en el mismo PR: un PR = un módulo completo (backend + frontend).
- El backend se implementa primero; el frontend se puede construir en paralelo contra mocks.
- Cada sprint termina con algo demostrable al cliente piloto.

---

## Vista general del roadmap

```
2026                Jun    Jul    Ago    Sep    Oct    Nov    Dic
                     │      │      │      │      │      │      │
FASE 1 (extendida)   ├──────┤──────┤
  Comunicación       │ S1-2 │ S3   │
  Seguimiento        │      │ S4   │
  PWA básica         │      │      │ S5   │

FASE 2               │             ├──────┤──────┤──────┤
  Diario/Horarios    │             │ S6-7 │
  Portal Docente     │             │      │ S8-9 │
  RBAC               │             │      │      │ S10  │
  Gráficas Director  │             │             │ S11  │

FASE 3               │                          ├──────┤──────┤
  Admisión Online    │                          │ S12-13│
  PWA completa       │                          │      │ S14  │
  RBAC multi-sede    │                          │      │ S15  │
```

---

## FASE 1 EXTENDIDA (Sprints 1–5)
**Duración estimada:** 10 semanas  
**Prerrequisito:** Portal de Representantes (Fase 1) entregado y en producción

---

### Sprint 1 — Backend Módulo Comunicación (2 semanas)
**Objetivo:** API funcional de circulares y mensajería

#### Tareas Backend
- [ ] Crear app `comunicacion` (`python manage.py startapp comunicacion`)
- [ ] Implementar modelos: `Circular`, `LecturaCircular`, `MensajeDirecto`
- [ ] Crear migraciones y aplicar
- [ ] Serializers DRF: `CircularSerializer`, `MensajeDirectoSerializer`, `LecturaCircularSerializer`
- [ ] Views:
  - `CircularListCreateView` (GET paginado, POST para director)
  - `CircularDetailView` (GET detalle)
  - `ConfirmarLecturaView` (POST — representante confirma lectura)
  - `CircularLecturasView` (GET — quién leyó, solo director)
  - `MensajeDirectoListCreateView` (GET bandeja filtrada, POST nuevo mensaje)
  - `MarcarMensajeLeido` (PATCH)
- [ ] URLs conectadas en `config/urls.py`
- [ ] Tarea Celery `enviar_email_circular` (email a destinatarios al publicar)
- [ ] Tarea Celery `enviar_email_mensaje` (email al destinatario de mensaje directo)
- [ ] Tests unitarios:
  - Crear circular → LecturaCircular se crea para cada destinatario
  - Confirmar lectura → `leido=True`, `fecha_lectura` se actualiza
  - Mensaje docente → representante recibe email (mock SMTP)

**Entregables:**
- Colección Postman / endpoints documentados con ejemplos de respuesta
- Migraciones commitadas

---

### Sprint 2 — Frontend Módulo Comunicación (2 semanas)
**Objetivo:** Circulares y mensajería funcionales en portal representante y panel admin

#### Tareas Frontend — Panel Admin (director publica)
- [ ] Nueva sección `/comunicacion` en sidebar admin
- [ ] `CircularesPage.jsx` — lista de circulares publicadas con badge de lecturas
- [ ] `ModalNuevaCircular.jsx` — editor con uploader de adjunto (PDF/imagen)
- [ ] `CircularLecturasModal.jsx` — modal "¿quién leyó?"
- [ ] `MensajesAdminPage.jsx` — bandeja del docente con conversaciones por alumno
- [ ] `ChatDocente.jsx` — componente de chat reutilizable

#### Tareas Frontend — Portal Representante
- [ ] Nueva sección `/portal/comunicaciones` en sidebar portal
- [ ] `CircularesPortalPage.jsx` — lista con badge de no leídas
- [ ] `CircularDetalleModal.jsx` — modal de detalle con botón "He leído"
- [ ] `MensajesPortalPage.jsx` — bandeja del representante
- [ ] `ChatRepresentante.jsx` — reutilizar `ChatDocente` con perspectiva inversa
- [ ] Polling cada 30 segundos para mensajes no leídos → badge en navbar

#### Tareas transversales
- [ ] Hook `useComunicacion.js` — fetch y mutations para ambas apps
- [ ] `cobranza.service.js` → crear `comunicacion.service.js` con todas las llamadas Axios
- [ ] Skeleton loaders para lista de circulares y chat
- [ ] Manejo de errores con `react-toastify`

**Definition of Done:**
- [ ] Funciona en 375px sin scroll horizontal
- [ ] Director puede publicar circular y representante la ve en < 5 segundos (polling)
- [ ] Confirmación de lectura actualiza el contador en tiempo real (después del refresh del polling)

---

### Sprint 3 — Seguimiento Gráfico en Portal Representante (2 semanas)
**Objetivo:** Gráficas de rendimiento visibles en el portal

#### Prerrequisito
- Existen datos de calificaciones en BD (puede ser data seed para demo)

#### Tareas Backend
- [ ] Endpoint `GET /api/academico/rendimiento/alumno/{id}/` con estructura de respuesta definida en TRD
- [ ] Lógica de cálculo de promedio ponderado por actividad
- [ ] Endpoint devuelve estructura completa aunque no haya datos de todos los lapsos

#### Tareas Frontend
- [ ] **Aprobación previa**: proponer `recharts` al cliente — esperar OK antes de instalar
- [ ] `npm install recharts` (una vez aprobado)
- [ ] `RendimientoAlumnoTab.jsx` — nuevo tab en portal representante
- [ ] `GraficaPromedioLapsos.jsx` — LineChart de recharts (promedio general por lapso)
- [ ] `GraficaPorMateria.jsx` — BarChart horizontal (notas por materia)
- [ ] `IndicadorAsistencia.jsx` — círculo de progreso (CSS puro o RadialBar)
- [ ] Hook `useRendimiento.js`
- [ ] Estado vacío elegante cuando no hay notas aún ("Las notas estarán disponibles cuando el docente las cargue")
- [ ] Responsive: gráficas se adaptan al ancho del contenedor (`ResponsiveContainer` de recharts)

**Definition of Done:**
- [ ] Gráficas renderizan correctamente en 375px
- [ ] Línea roja punteada del mínimo aprobatorio visible
- [ ] Materias en riesgo muestran ícono ⚠

---

### Sprint 4 — PWA Básica (2 semanas)
**Objetivo:** Instalable en homescreen y notificaciones push activables

#### Tareas Frontend
- [ ] `npm install -D vite-plugin-pwa`
- [ ] Configurar `vite-plugin-pwa` en `vite.config.js` (manifest + workbox)
- [ ] Crear íconos PWA: `icon-192.png`, `icon-512.png` (diseño del logo Octopus)
- [ ] `manifest.json` con nombre, colores, start_url apuntando a `/portal`
- [ ] `useWebPush.js` — hook para solicitar permiso y registrar suscripción
- [ ] `NotificiacionesModal.jsx` — modal de activación (aparece 10s post-login)
- [ ] Lógica de "no mostrar por 7 días" en `localStorage`
- [ ] Configuración de tipos de notificación (toggle por tipo)

#### Tareas Backend
- [ ] `pip install pywebpush` → agregar a `requirements.txt`
- [ ] Modelo `SuscripcionPush` en app `notificaciones`
- [ ] Migración
- [ ] Endpoint `POST /api/notificaciones/push/suscribir/`
- [ ] Endpoint `DELETE /api/notificaciones/push/desuscribir/`
- [ ] Endpoint `PATCH /api/notificaciones/push/tipos/`
- [ ] Tarea Celery `enviar_push(suscripcion_id, titulo, cuerpo, url)`
- [ ] Generar y guardar claves VAPID en `.env`
- [ ] Conectar push a eventos existentes: nueva circular, nuevo mensaje directo
- [ ] Manejo de `410 Gone` → marcar suscripción como inactiva

**Definition of Done:**
- [ ] App instalable en Chrome Android y Safari iOS (16.4+)
- [ ] Notificación aparece al publicar circular (con push activado)
- [ ] Fallback a email si push no está disponible

---

## FASE 2 (Sprints 6–11)
**Duración estimada:** 12 semanas  
**Prerrequisito:** Fase 1 extendida en producción y validada con piloto

---

### Sprint 5-6 — Backend Módulo Académico (Horarios + Asistencia) (3 semanas)

#### Tareas
- [ ] Crear app `academico` y modelos: `Materia`, `Horario`, `AsistenciaAlumno`, `IncidenteDisciplinario`
- [ ] Migraciones
- [ ] Serializers y Views de Horarios (CRUD para director)
- [ ] View `AsistenciaBulkCreateView` con `transaction.atomic()`
- [ ] View `AsistenciaReporteView` — devuelve JSON para que frontend genere PDF/Excel
- [ ] Views de Incidentes con validación de adjunto (máx 5MB, solo imágenes)
- [ ] Pillow para validación de imágenes: `pip install Pillow`
- [ ] Tests: unicidad de asistencia (mismo alumno+horario+fecha no puede tener 2 registros)

---

### Sprint 7-8 — Frontend Diario de Clases y Horarios (3 semanas)

#### Tareas
- [ ] Nueva sección `/academico` en sidebar admin (solo visible con permiso `academico:ver`)
- [ ] `HorariosPage.jsx` — grilla semanal con colores por materia
- [ ] `ModalHorario.jsx` — crear/editar bloque de horario
- [ ] `AsistenciaPage.jsx` — tabla de asistencia por sección con radio buttons
- [ ] `IncidentesPage.jsx` — lista y formulario de incidentes
- [ ] `ReporteAsistenciaPage.jsx` — filtros + exportación PDF/Excel
- [ ] Portal Docente (`/portal-docente`) — estructura de rutas y layout
- [ ] `PortalDocenteDashboard.jsx` — tarjetas métricas + timeline del día
- [ ] `AsistenciaDocenteView.jsx` — misma tabla adaptada para docente (solo sus secciones)

---

### Sprint 9-10 — Backend + Frontend Portal Docente (Calificaciones + Material) (3 semanas)

#### Tareas Backend
- [ ] Modelos: `PlanEvaluacion`, `Calificacion`, `MaterialEstudio`
- [ ] Migraciones
- [ ] `DocenteMateriasView` — filtra automáticamente por `request.user`
- [ ] `PlanEvaluacionDetailView` con validación de que porcentajes sumen 100%
- [ ] `CalificacionBulkCreateView` con `transaction.atomic()`
- [ ] `MaterialEstudioListCreateView` con soporte multipart

#### Tareas Frontend (Portal Docente)
- [ ] `MisMateriasList.jsx`
- [ ] `GestionMateriaPage.jsx` — tabs: Asistencia / Plan / Calificaciones / Material
- [ ] `EditorPlanEvaluacion.jsx` — drag para reordenar actividades, validación suma = 100%
- [ ] `TablaCalificaciones.jsx` — input navegable con Tab entre celdas
- [ ] `MaterialEstudioList.jsx` — lista con uploader

---

### Sprint 11 — RBAC + Dashboard Rendimiento Directivo (3 semanas)

#### Tareas RBAC Backend
- [ ] Modelos: `PermisoModulo`, `AuditoriaAccion`
- [ ] Migraciones
- [ ] Management command `poblar_permisos_rbac` — carga matriz inicial
- [ ] `RBACPermission(BasePermission)` custom para DRF
- [ ] Middleware de auditoría (señales `post_save`/`post_delete`)
- [ ] Endpoints de gestión de permisos

#### Tareas RBAC Frontend
- [ ] `/configuracion/roles` — tabla de permisos con toggles por rol
- [ ] Sidebar se filtra dinámicamente por permisos del JWT
- [ ] Botones de acción (crear/editar/eliminar) ocultos si no hay permiso
- [ ] `AuditoriaPage.jsx` — lista con filtros y modal de detalle

#### Tareas Gráficas Director
- [ ] Backend: `RendimientoSeccionView`, `AlertasRendimientoView`
- [ ] Cron job `generar_alertas_rendimiento` en Celery Beat
- [ ] `RendimientoDashboardPage.jsx` — mapa de calor por sección
- [ ] `AlertasRiesgoPage.jsx` — lista de alumnos en riesgo con acceso a su perfil

---

## FASE 3 (Sprints 12–15)
**Duración estimada:** 8 semanas  
**Prerrequisito:** Fase 2 completa, RBAC en producción

---

### Sprint 12-13 — Módulo de Admisión Online (4 semanas)

#### Tareas Backend
- [ ] Crear app `admision`
- [ ] Modelos: `FormularioAdmision`, `DocumentoAdmision`
- [ ] Migraciones (incluye extensión UUID de PostgreSQL para `token_seguimiento`)
- [ ] `SolicitudAdmisionCreateView` — sin auth, con validación completa
- [ ] `SolicitudStatusPublica` — solo con token UUID, sin auth
- [ ] `SolicitudAdmisionListView` — paginado, filtros por estado
- [ ] `CambiarEstadoSolicitud` — con auditoría + email automático
- [ ] `AprobarSolicitud` — transacción atómica: crea Alumno, Representante, UsuarioPortal
- [ ] Tareas Celery para emails del pipeline
- [ ] Tests de integración: flujo completo desde solicitud hasta alumno creado

#### Tareas Frontend
- [ ] `/admision` — ruta pública (sin layout de admin)
- [ ] `FormularioAdmisionPage.jsx` — multi-step con progress indicator
- [ ] `SeguimientoPage.jsx` — timeline visual del estado (ruta pública con token)
- [ ] `/admin/admision` — vista Kanban del pipeline
- [ ] `KanbanPipeline.jsx` — columnas con drag & drop (o flechas en mobile)
- [ ] `SolicitudDetalleDrawer.jsx` — drawer con datos, documentos y botones de acción
- [ ] `ModalAprobarSolicitud.jsx` — confirmación con preview de datos que se crearán

---

### Sprint 14 — PWA Completa (2 semanas)

#### Objetivos
- Estrategias de caché avanzadas (offline-first para portal representante)
- Notificaciones push para todos los eventos del sistema (calificaciones, admisión)
- Gestión de suscripciones por tipo en perfil del representante

#### Tareas
- [ ] Workbox runtime caching por tipo de ruta (estáticos, API de datos)
- [ ] Página offline fallback
- [ ] Conectar push a: nota cargada, cambio estado admisión
- [ ] `GestionNotificacionesPage.jsx` en portal (activar/desactivar por tipo)
- [ ] `LogNotificacion` — tabla en backend para historial de envíos

---

### Sprint 15 — RBAC Multi-Sede (2 semanas)

#### Objetivos
- Preparar el RBAC para la arquitectura multi-sede de Fase 3

#### Tareas
- [ ] Agregar campo `sede_id` a `PermisoModulo` (nullable — null = global)
- [ ] Migración sin romper permisos existentes
- [ ] `superadmin` puede asignar permisos por sede específica
- [ ] Filtros en todos los querysets: `filter(sede=request.user.perfil.sede)` donde aplica
- [ ] Tests: director de Sede A no puede ver datos de Sede B

---

## Criterios Globales de Aceptación

Antes de cerrar cualquier sprint como "Done":

```
□ Funciona en 375px (mobile) sin scroll horizontal ni overflow
□ Manejo de error con react-toastify en todas las llamadas Axios
□ Skeletons durante la carga (no spinners genéricos)
□ Backend tiene tests unitarios para lógica crítica de negocio
□ Deuda técnica detectada anotada en NOTAS_TECNICAS.md
□ Probado con datos reales en el colegio piloto
□ El rol de cada usuario accede exactamente a lo que le corresponde
□ PR revisado y aprobado antes de merge a main
□ Sin console.log() en el código de producción
□ Sin credenciales ni secrets hardcodeados
```

---

## Estimación de Esfuerzo

| Módulo | Backend | Frontend | Total | Sprint |
|--------|---------|----------|-------|--------|
| Comunicación | 2 sem | 2 sem | ~3 sem (paralelo) | S1-S2 |
| Seguimiento Gráfico | 0.5 sem | 1.5 sem | 2 sem | S3 |
| PWA Básica | 1 sem | 1 sem | ~1.5 sem (paralelo) | S4 |
| Horarios + Asistencia | 1.5 sem | 1.5 sem | ~2.5 sem | S5-S6 |
| Portal Docente | 1.5 sem | 2 sem | ~2.5 sem | S7-S8 |
| RBAC + Gráficas Director | 1.5 sem | 1.5 sem | ~2.5 sem | S9-S10 |
| Admisión Online | 2 sem | 2 sem | ~3 sem | S11-S12 |
| PWA Completa | 0.5 sem | 1.5 sem | 2 sem | S13 |
| RBAC Multi-Sede | 1 sem | 0.5 sem | 1.5 sem | S14 |
| **Total** | **~12 sem** | **~14 sem** | **~20 sem** | |

> Nota: los sprints con "(paralelo)" asumen que hay un desarrollador backend y uno frontend trabajando simultáneamente. Con un solo desarrollador, multiplicar por 1.5.

---

## Riesgos y Mitigaciones

| Riesgo | Señal de alerta | Mitigación |
|--------|----------------|-----------|
| Recharts no aprobado por el cliente | Cliente no responde en 3 días | Preparar alternativa con `chart.js` — mismo esfuerzo de integración |
| Docentes no adoptan el portal | < 20% de notas cargadas en primer lapso | Capacitación 1:1, video tutorial, soporte proactivo |
| Push no funciona en iOS < 16.4 | Quejas de representantes con iPhone antiguo | Comunicar limitación en el modal de activación; fallback a email ya implementado |
| Admisión crea datos sucios al reprobar transacción | Error en producción post-aprobación | Tests de integración obligatorios antes de deploy; `transaction.atomic()` no negociable |
| Celery sin configuración de producción (ya en NOTAS_TECNICAS) | Jobs no corren en servidor | Prioridad sprint de infra antes de Fase 2: Redis + worker configurado |

---

## Dependencias entre Módulos

```
PWA Push ──────────────────────────────────────────────────┐
                                                           │
Comunicación ─────────────────┐                           │
                              ├── Portal Representante ←──┘
Seguimiento Gráfico ──────────┘         (Fase 1, existente)

Horarios ──────┐
               ├── Portal Docente ──── Calificaciones ──── Seguimiento Director
Asistencia ────┘

RBAC ──────────────────────────── todo lo anterior (inyectar permisos)

Admisión ─── (independiente, se puede implementar en paralelo con Fase 2)
```

**Orden mínimo viable:** Comunicación → Seguimiento → PWA → Horarios/Asistencia → Portal Docente → RBAC → Admisión
