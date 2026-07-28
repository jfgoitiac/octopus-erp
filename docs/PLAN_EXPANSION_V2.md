# PLAN DE EXPANSIÓN — Octopus v2 (revisado con estado real del código)

**Versión:** 2.0
**Fecha:** 2026-07-27
**Reemplaza (en vigencia, no en archivo) a:** `docs/TRD.md`, `docs/APP_FLOW.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/UI_UX_BRIEF.md`, `docs/BACKEND_SCHEMA.md` (v1.0, 2026-06-13)
**Basado en:** `PRD_EXPANSION.md`, `Portal_Representantes_Informe_Integracion.docx`, `Informe_Mejoras_Clientes.docx` + auditoría directa del código (`octopus-api/`, `octopus-frontend/`) el 2026-07-27

---

## 0. Por qué existe esta versión 2

Los documentos v1 (`docs/*.md`, 13-jun-2026) diseñaron los 7 módulos del PRD asumiendo que casi nada existía todavía. Al auditar el código real seis semanas después, la situación cambió:

- **Ya existe** una app `academico` completa con Horarios (incluye generador automático) y un sistema de Notas admin-only — no hay que crearlos desde cero, solo extenderlos.
- **Ya existe** `multisede` con su propio esquema de permisos (`PermisoSede`) — el plan v1 de RBAC lo ignoraba y proponía construir algo paralelo.
- **El Portal de Representantes está más avanzado** de lo que decía su propio informe de integración (comprobantes, panel de aprobación admin, cambio de contraseña y filtro por alumno activo ya están en producción).
- **Stripe quedó a medio conectar**: se agregó y se removió del enrutamiento en commits distintos (`bba6059` → `9fd0fc5`), dejando tests muertos y un valor `'stripe'` huérfano en `cobranza`. **Por decisión del cliente, no se reactiva.**
- **No existe nada** de Comunicación, Portal Docente, Seguimiento Gráfico, PWA ni Admisión — en esto los planes v1 siguen siendo el punto de partida correcto, con ajustes.

Esta v2 no descarta el trabajo de diseño de v1 (mockups de UI, estructura de endpoints siguen siendo útiles) — lo corrige donde el código ya avanzó distinto, y elimina Stripe del alcance.

**Regla de estabilidad (se mantiene de CLAUDE.md):** ninguna fase toca `cobranza` ni `secretaria` — son los módulos con desarrollo activo y bugs abiertos ahora mismo. Todo lo nuevo vive en apps propias o extiende `academico`/`portal` de forma aditiva (nunca se eliminan columnas o endpoints existentes sin una fase de deprecación explícita).

---

## 1. Estado real por módulo (auditoría 2026-07-27)

| Módulo del PRD | Estado | Evidencia |
|---|---|---|
| Horarios | ✅ Completo, con generador automático por constraint-satisfaction | `academico/models.py:195-235` (`HorarioClase`), `academico/views.py:821-918` (`GenerarHorarioView`) |
| Asistencia | 🟡 Parcial — solo binario presente/ausente + justificada, sin "retardado" | `academico/models.py:161-189` |
| Incidentes disciplinarios | ❌ No existe | sin resultados en `academico/` |
| Notas/Calificaciones | 🟡 Existe, pero solo la carga secretaría/director | `academico/views.py:199-334` (`NotasGradoView`), permiso `IsSecretariaOrAbove` (`views.py:26-61`) — **docente no está en la lista de roles permitidos** |
| Boletín | ✅ Existe (ruta `/boletin` documentada en README) | — |
| Portal Docente (login propio, acceso a sus notas) | ❌ No existe | sin rutas/vistas para docente; rol `docente` solo definido en `authentication/models.py:14` |
| Comunicación (circulares, mensajería) | ❌ No existe | `notificaciones` solo tiene alertas de mora/WhatsApp transaccionales |
| Seguimiento Gráfico | ❌ No existe | sin `recharts`/`chart.js` en `package.json` |
| RBAC granular | 🟡 Dos esquemas paralelos, ninguno granular | roles hardcoded por clase de permiso (`IsSecretariaOrAbove` y equivalentes, 8+6+4+2 ocurrencias) + `PermisoSede` en `multisede/models.py:38-70` |
| PWA / Push | ❌ No existe | sin manifest, sin `pywebpush` |
| Admisión Online | ❌ No existe (solo "Pre-Inscripción" = mail-merge sobre alumno ya existente) | `secretaria/utils_preinscripcion.py` |
| Portal Representantes — comprobantes, aprobación admin, cambio de contraseña, filtro por alumno activo | ✅ Completo | `portal/models.py:48-134`, `portal/views.py:308-926` |
| Stripe | ❌ Desconectado (código muerto) — **fuera de alcance, no reactivar** | rutas removidas de `portal/urls.py` en `9fd0fc5`; `portal/tests.py:392-450` (`StripeWebhookTests`) sigue referenciando endpoints inexistentes |

---

## 2. PRD — Qué se construye y por qué

### Objetivo
Cerrar las brechas funcionales frente a la competencia (Eduweb) priorizando retención del representante, reducción de churn y valor percibido — sin arriesgar la estabilidad de cobranza/inscripciones, que están en producción activa.

### Fuera de alcance (decisión explícita)
- Pago en línea (Stripe u otra pasarela). Se mantiene el flujo manual de comprobante de transferencia.
- App nativa iOS/Android (la PWA cubre el caso de uso).
- Reescritura completa de RBAC (ver sección 6 — queda como backlog condicional).

### Fases y valor de negocio

| Fase | Módulo | Valor principal |
|---|---|---|
| 0 | Housekeeping | Elimina inconsistencias (README vs. código) y código muerto de Stripe antes de sumar más superficie |
| 1 | Diario de Clases | Elimina papel/WhatsApp para asistencia e incidentes; horarios ya está listo |
| 2 | Centro de Comunicación — Circulares | Reduce dependencia de WhatsApp para avisos institucionales, con trazabilidad de lectura |
| 3 | Portal Docente (+ mensajería bidireccional) | Docentes cargan notas sin ir al colegio; habilita respuesta directa a representantes |
| 4 | Seguimiento Gráfico | Convierte datos ya existentes en valor visual para representantes y directivos |
| 6 | PWA + Push | Reduce fricción de acceso móvil; solo tiene sentido con contenido "empujable" real (circulares, notas) |
| 7 | Admisión Online | Digitaliza la primera impresión del colegio; queda al final por ser superficie pública nueva |
| — | RBAC granular completo | Backlog condicional — se activa solo si un cliente multi-sede real lo exige |

---

## 3. TRD — Requerimientos técnicos por fase

### Stack (sin cambios salvo aprobación explícita)
Frontend existente: React 19, Vite 8, react-router-dom v7, Tailwind v4, Axios, lucide-react, react-toastify, jsPDF+autotable, xlsx, date-fns+react-datepicker, jwt-decode.
Backend existente: Django 6, DRF, SimpleJWT, Celery+Redis, SQLite/PostgreSQL.

**Nuevas dependencias que requieren tu aprobación antes de instalar:**
| Dependencia | Fase | Alternativa |
|---|---|---|
| `recharts` (o `chart.js`+`react-chartjs-2`) | 4 | Elegir una antes de iniciar la fase |
| `vite-plugin-pwa` | 6 | — |
| `pywebpush` + `py-vapid` | 6 | — |
| `Pillow` (validación/resize de adjuntos de incidentes) | 1 | Puede ya estar instalado — verificar `requirements.txt` primero |

---

### Fase 0 — Housekeeping
- Corregir `README.md`: quitar mención de "Stripe Checkout" como activo; mover la documentación de `activar-portal-masivo` a `authentication/` (no `portal/`) donde realmente vive (`authentication/urls.py:12`).
- Decidir destino del código muerto de Stripe: eliminar `StripeWebhookTests` (`portal/tests.py:392-450`) y evaluar si `'stripe'` sigue siendo válido como choice en `cobranza` (si no hay registros históricos con ese método, se puede retirar del choice list; si los hay, se deja documentado como legado).
- Sin modelos nuevos, sin migraciones.

### Fase 1 — Diario de Clases (extensión aditiva, no reconstrucción)
**Horarios: no se toca, ya está completo.**

Extensión de `Asistencia` (aditiva — no se eliminan `presente`/`justificada`):
```python
class Asistencia(models.Model):
    ESTADOS = [('P', 'Presente'), ('A', 'Ausente'), ('J', 'Justificado'), ('R', 'Retardado')]
    # ... campos existentes (alumno, horario/materia, fecha, presente, justificada) ...
    estado = models.CharField(max_length=1, choices=ESTADOS, null=True)
    # Migración de datos: presente=True,justificada=False -> 'P'
    #                     presente=False,justificada=True -> 'J'
    #                     presente=False,justificada=False -> 'A'
    # 'R' solo se usa a partir de ahora, vía UI nueva
```
Nuevo modelo:
```python
class IncidenteDisciplinario(models.Model):
    SEVERIDADES = [('L', 'Leve'), ('M', 'Moderado'), ('G', 'Grave')]
    alumno = models.ForeignKey('secretaria.Alumno', on_delete=models.CASCADE)
    fecha = models.DateField(auto_now_add=True)
    descripcion = models.TextField()
    severidad = models.CharField(max_length=1, choices=SEVERIDADES)
    adjunto = models.ImageField(upload_to='incidentes/', blank=True, null=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
```

**Primer paso obligatorio antes de codificar:** revisar si `ResumenAsistenciaView` (ya existente) cubre el "reporte acumulado exportable" del PRD antes de construir un endpoint nuevo — evitar duplicar lo que ya funciona.

Endpoints nuevos:
| Método | Ruta | Roles |
|---|---|---|
| PATCH | `/api/academico/asistencia/{id}/` (agrega soporte para `estado='R'`) | docente, secretaria+ |
| GET/POST | `/api/academico/incidentes/` | docente, secretaria+ |
| GET | `/api/academico/incidentes/{id}/` | docente, secretaria+ |

### Fase 2 — Centro de Comunicación (Circulares)
Nueva app `comunicacion` (unidireccional colegio → representante; la mensajería bidireccional se entrega en Fase 3, cuando exista el lado docente):
```python
class Circular(models.Model):
    titulo = models.CharField(max_length=255)
    cuerpo = models.TextField()
    adjunto = models.FileField(upload_to='circulares/', blank=True, null=True)
    publicado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    fecha_publicacion = models.DateTimeField(auto_now_add=True)
    requiere_confirmacion = models.BooleanField(default=False)

class LecturaCircular(models.Model):
    circular = models.ForeignKey(Circular, on_delete=models.CASCADE)
    usuario = models.ForeignKey('portal.RepresentanteUser', on_delete=models.CASCADE)
    leido = models.BooleanField(default=False)
    fecha_lectura = models.DateTimeField(null=True, blank=True)
    class Meta:
        unique_together = ('circular', 'usuario')
```
> Nota: el modelo real de usuario del portal se llama `RepresentanteUser` (`portal/models.py`), no `UsuarioPortal` como asumía v1 — verificar el nombre exacto antes de escribir la FK.

Endpoints:
| Método | Ruta | Roles |
|---|---|---|
| GET/POST | `/api/comunicacion/circulares/` | director+ (POST), representante (GET) |
| POST | `/api/comunicacion/circulares/{id}/confirmar/` | representante |
| GET | `/api/comunicacion/circulares/{id}/lecturas/` | director+ |

Notificación por email reutiliza `notificaciones/services.py::enviar_email` ya existente (perfil de remitente por área). **Sin WebSockets ni Django Channels** en esta fase — el badge de no leídas se resuelve con un GET normal al cargar el dashboard, sin necesidad de polling continuo (la circular no es tan urgente como para justificar infraestructura de tiempo real).

### Fase 3 — Portal Docente + Mensajería Bidireccional
**Decisión de arquitectura (corrige a v1):** el docente **reutiliza el JWT del panel administrativo**, no un JWT separado como el de representantes. El rol `docente` ya existe en `PerfilUsuario.ROLES` y ya es reconocido por la autenticación admin — construir un segundo sistema de auth solo para docentes sería infraestructura duplicada sin necesidad real.

Trabajo de permisos (mínimo necesario, no una reescritura de RBAC):
- Ampliar la clase de permiso que protege `NotasGradoView`/asistencia para aceptar `docente`, pero **filtrando el queryset por `Materia.docente = request.user`** (ya existe ese FK) — el docente nunca ve materias que no le pertenecen.

Modelos nuevos (verificar primero el modelo real detrás de `NotasGradoView` — puede que ya exista algo equivalente a `Calificacion`; no crear un duplicado):
```python
class MaterialEstudio(models.Model):
    materia = models.ForeignKey('academico.Materia', on_delete=models.CASCADE)
    seccion = models.ForeignKey('academico.Seccion', on_delete=models.CASCADE)
    titulo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    archivo = models.FileField(upload_to='materiales/', blank=True, null=True)
    enlace = models.URLField(blank=True)
    publicado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    fecha = models.DateTimeField(auto_now_add=True)
```
Mensajería bidireccional (extensión de la app `comunicacion` creada en Fase 2):
```python
class MensajeDirecto(models.Model):
    alumno = models.ForeignKey('secretaria.Alumno', on_delete=models.CASCADE)
    remitente_docente = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    remitente_representante = models.ForeignKey('portal.RepresentanteUser', null=True, blank=True, on_delete=models.SET_NULL)
    destinatario_docente = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    destinatario_representante = models.ForeignKey('portal.RepresentanteUser', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    cuerpo = models.TextField()
    adjunto = models.FileField(upload_to='mensajes/', blank=True, null=True)
    fecha = models.DateTimeField(auto_now_add=True)
    leido = models.BooleanField(default=False)
```
Endpoints:
| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/academico/docente/mis-materias/` | docente |
| GET/POST | `/api/academico/materiales/` | docente (POST), docente/representante/alumno (GET) |
| GET/POST | `/api/comunicacion/mensajes/` | docente, representante |
| PATCH | `/api/comunicacion/mensajes/{id}/leer/` | destinatario |

**Riesgo de negocio (no técnico):** hoy la carga de notas la hace secretaría/dirección. Pasarla al docente es un cambio de proceso, no solo de software — requiere piloto y capacitación antes de apagar el flujo anterior (mantenerlo activo en paralelo durante la transición).

### Fase 4 — Seguimiento Gráfico
🔴 **Requiere tu aprobación de librería antes de iniciar** (`recharts` vs `chart.js`+`react-chartjs-2`).

Endpoint de agregación (solo lectura, sin modelos nuevos — se calcula sobre Notas/Asistencia existentes):
```
GET /api/academico/rendimiento/alumno/{id}/
GET /api/academico/rendimiento/seccion/{id}/     (director/coordinador)
GET /api/academico/rendimiento/alertas/          (director/coordinador)
```
Alerta automática (`AlertaRendimiento`, único modelo nuevo de esta fase) cuando el promedio cae bajo el umbral configurado — cron Celery diario, reutilizando la infraestructura Celery ya activa.

### Fase 6 — PWA + Push
Solo tiene sentido una vez existan eventos reales que empujar (circulares de Fase 2, notas de Fase 3). Diseño igual al de v1 (manifest + `vite-plugin-pwa` + `pywebpush`/VAPID), sin cambios de fondo. Fallback obligatorio a email para iOS < 16.4.

### Fase 7 — Admisión Online
Nueva app `admision`, pipeline de estados sobre un formulario público sin autenticación. Mayor superficie de riesgo del roadmap:
- Requiere rate-limiting y validación estricta de archivos (mismo patrón antifraude que ya existe en `ComprobantePago` — hash + límite de tamaño — se reutiliza el criterio, no el código).
- Al aprobar, la transacción atómica crea `Alumno` + `Representante` + `RepresentanteUser`, igual que describía v1.
- Va al final porque el colegio ya tiene un sustituto parcial (Pre-Inscripción por mail-merge) que cubre parte de la necesidad sin urgencia de reemplazo inmediato.

### Backlog condicional — RBAC granular completo
No se construye de forma especulativa. Hoy conviven roles hardcoded (por app) + `PermisoSede` (multisede). Antes de invertir en unificarlos hace falta un disparador de negocio real (un cliente multi-sede que lo exija); hacerlo antes sería diseñar para un requisito hipotético y arriesgar módulos estables por una refactorización de alto impacto (toca 20+ clases de permisos). Si se activa, el punto de partida técnico correcto es extender `PermisoSede` — no crear un tercer esquema paralelo.

---

## 4. Flujo de app (resumen por fase)

```
FASE 1 — Diario de Clases
Docente → Mi Horario (ya existe) → toma asistencia de sección
  → marca P/A/J/R por alumno → guarda (bulk, igual que hoy)
Docente → Incidentes → nuevo incidente (alumno, descripción, severidad, foto opcional)
Director → Reportes → Asistencia acumulada (verificar si ya existe antes de crear vista nueva)

FASE 2 — Comunicación (Circulares)
Director → Comunicación → Nueva Circular (texto, adjunto, ¿requiere confirmación?)
  → Publicar → email automático a destinatarios (reutiliza notificaciones existente)
Representante → Portal → Comunicaciones → ve circular, confirma lectura si aplica

FASE 3 — Portal Docente
Docente → login admin existente → ve solo su rol → nueva sección "Mis Materias"
  → Notas (mismo NotasGradoView, ahora accesible y filtrado para docente)
  → Material de Estudio → sube PDF/enlace → visible en portal representante
  → Mensajes → conversación con representante sobre un alumno puntual

FASE 4 — Seguimiento Gráfico
Representante → Portal → tab Rendimiento → gráfica de promedio por lapso + por materia
Director → Reportes → mapa de calor por sección + lista de alertas

FASE 6 — PWA
Representante → banner "Instalar" en navegador móvil → ícono en home screen
  → modal activar notificaciones → push de circulares/notas/facturas

FASE 7 — Admisión
Prospecto → formulario público (3 pasos) → sube documentos → recibe token de seguimiento
Director → pipeline Kanban (Recibido→Revisión→Entrevista→Aprobado/Rechazado)
  → Aprobar → crea Alumno + Representante + acceso al portal automáticamente
```

*(Diagramas detallados pantalla-por-pantalla ya existen en `docs/APP_FLOW.md` v1 — siguen siendo válidos como referencia visual; los cambios de fondo de esta v2 son: sin JWT separado para docente, sin polling agresivo en circulares, sin reconstrucción de Horarios.)*

---

## 5. UI/UX

El sistema de diseño y los mockups de `docs/UI_UX_BRIEF.md` (paleta, tipografía, patrones de skeleton/error/vacío, breakpoints) **siguen vigentes sin cambios** — fueron diseñados de forma prospectiva y no dependen del estado del backend. Úsalo como referencia visual directa para las 7 fases.

Único ajuste: en el mockup de "Dashboard Docente" de v1, quitar cualquier implicación de una pantalla de login distinta a la del panel admin — el docente entra por el mismo login, y el dashboard docente es una vista condicionada por rol dentro de la misma sesión.

---

## 6. Plan de implementación (orden y checklist)

**Principios (sin cambios respecto a v1):** una rama por módulo, un PR = un módulo completo, backend antes o en paralelo con frontend, cada fase demostrable con datos reales antes de cerrarse.

**Antes de escribir código de cualquier fase:** presentar árbol de archivos, rutas nuevas, componentes a reutilizar y decisiones de arquitectura — esperar aprobación (regla ya establecida en `CLAUDE.md`).

| Orden | Fase | Bloqueada por | Esfuerzo relativo |
|---|---|---|---|
| 1 | Fase 0 — Housekeeping | — | Muy bajo |
| 2 | Fase 1 — Diario de Clases | Fase 0 | Bajo (Horarios ya existe) |
| 3 | Fase 2 — Circulares | Fase 0 | Medio |
| 4 | Fase 3 — Portal Docente + mensajería | Fase 2 (mensajería reutiliza `comunicacion`) | Medio-alto (+ riesgo de adopción, requiere piloto) |
| 5 | Fase 4 — Seguimiento Gráfico | Aprobación de librería de gráficos | Bajo una vez aprobada la librería |
| 6 | Fase 6 — PWA + Push | Fase 2 y 3 (necesita contenido que empujar) | Medio |
| 7 | Fase 7 — Admisión Online | Ninguna estrictamente, pero se deja al final por riesgo | Alto |
| condicional | RBAC granular completo | Disparador de negocio real (cliente multi-sede) | Alto — no se agenda sin ese disparador |

### Checklist de Definición de Listo (por fase, igual criterio que Fase 1 original de CLAUDE.md)
- [ ] Funciona en mobile (375px) sin degradación visual
- [ ] Manejo de errores con `react-toastify` en todas las llamadas Axios
- [ ] Backend con tests unitarios para la lógica crítica
- [ ] Deuda técnica detectada anotada en `NOTAS_TECNICAS.md`
- [ ] Probado con datos reales en un colegio piloto
- [ ] El rol de cada usuario accede exactamente a lo que le corresponde
- [ ] No se tocó `cobranza` ni `secretaria`
- [ ] Migraciones son aditivas (no se eliminan columnas/endpoints existentes en la misma fase que se agrega algo nuevo)

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Docentes rechazan cargar notas ellos mismos | Piloto en una sección, capacitación 1:1, mantener flujo de secretaría activo en paralelo durante la transición |
| Librería de gráficos no aprobada a tiempo | Tener lista la alternativa (`chart.js`) con el mismo esfuerzo de integración estimado |
| Push no funciona en iOS < 16.4 | Fallback a email ya contemplado desde el diseño, comunicar la limitación en el modal de activación |
| Migración de `Asistencia` rompe reportes que leen los booleanos actuales | Migración aditiva: se agrega `estado`, no se tocan `presente`/`justificada` hasta confirmar que nada más los lee |
| Confusión por código muerto de Stripe si no se limpia en Fase 0 | Fase 0 es la primera en el orden, precisamente para resolver esto antes de sumar más superficie |
| RBAC completo se construye "por si acaso" y consume tiempo de las fases con valor real | Se mantiene como backlog condicional, no como fase agendada |

---

## 8. Decisiones pendientes de tu aprobación

1. ¿Confirmas el orden de fases (0→1→2→3→4→6→7, RBAC condicional)?
2. Librería de gráficos para Fase 4: `recharts` o `chart.js`.
3. Código muerto de Stripe en Fase 0: ¿lo eliminamos (tests + choice `'stripe'` en cobranza si no hay registros históricos) o lo dejamos anotado en `NOTAS_TECNICAS.md` sin tocar?
4. ¿El `Informe_Mejoras_Clientes.docx` ya fue enviado a los colegios? Cambia cuánto margen tenemos para reordenar frente a lo ya comunicado.
