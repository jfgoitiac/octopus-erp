# PRD — Expansión de la Plataforma Octopus
**Versión:** 1.0  
**Fecha:** 2026-06-04  
**Basado en:** Análisis competitivo de la propuesta Eduweb (E Servicios AT, C.A.)  
**Autor:** Equipo de Producto

---

## 1. Contexto y Justificación

Octopus es un SaaS de gestión escolar para colegios privados en Latinoamérica que actualmente cubre inscripciones, facturación, cobros y reportes PDF. El análisis de la propuesta competitiva de Eduweb 2026 revela brechas funcionales significativas que, de ser cubiertas, posicionarían a Octopus como la solución más completa del mercado regional.

La selección de funcionalidades se hizo priorizando:
- **Impacto directo en la experiencia del usuario final** (padres, docentes, directivos)
- **Diferenciación competitiva real** frente a Eduweb
- **Compatibilidad con el stack existente** (React 19, Django, Tailwind v4)
- **Viabilidad de implementación** dentro de las fases ya planificadas

---

## 2. Herramientas identificadas en el documento Eduweb

| # | Herramienta / Módulo | Descripción en la propuesta |
|---|----------------------|-----------------------------|
| 1 | Control de Estudios (Educomp) | Impresión de documentación MPPE, planes de evaluación, gestión de secciones |
| 2 | Módulo de Calificaciones | Gestión de evaluaciones y boletines digitales |
| 3 | Módulo de Comunicación | Mensajería bidireccional y notificaciones automáticas |
| 4 | Módulo de Admisión | Automatización de procesos para nuevos ingresos |
| 5 | Módulo de Inscripción Online | Procesos administrativos 100% vía internet |
| 6 | Diario de Clases y Horarios | Registro de incidentes diarios, retardos, control de horarios |
| 7 | Módulo de Cobranza / Facturación | Cobros y reportes de pagos (actualmente como módulo adicional en Eduweb) |
| 8 | App Móvil iOS & Android | Notificaciones push, consulta de notas, circulares, cobros, horarios y tareas |
| 9 | Sistema de Permisos por Perfil | Configuración diferenciada por rol (directivo, docente, representante, alumno) |
| 10 | Portal de Padres y Alumnos | Zona privada, autogestión de inscripciones, seguimiento gráfico de rendimiento |
| 11 | Gestión Docente Remota | Carga de notas, compartir material, comentarios en boletas desde cualquier lugar |
| 12 | Monitoreo en Tiempo Real | Seguimiento del desempeño docente en tiempo real |
| 13 | Seguimiento Gráfico del Rendimiento | Visualización de progreso académico para representantes y alumnos |
| 14 | Notificaciones Push en Tiempo Real | Alertas instantáneas en dispositivos móviles |

---

## 3. Herramientas seleccionadas para Octopus

### Criterios de selección aplicados
- **Descartados:** Control de Estudios con formato MPPE (muy específico de Venezuela/burocracia local, bajo ROI para escala regional), Asistencia Remota vía AnyDesk (es soporte, no funcionalidad de producto).
- **Priorizados:** Los que generan retención del representante, reducen churn y aumentan el valor percibido del software.

---

### SELECCIÓN 1 — Diario de Clases y Horarios
**Prioridad: ALTA**

**Justificación:**  
Eduweb lo ofrece solo en su plan Premium. Es una funcionalidad que los directivos demandan activamente: sin registro de retardos ni incidentes digitalizados, la institución sigue usando papel o WhatsApp. Octopus puede diferenciarse entregándolo desde el plan base.

**Impacto esperado:**
- Elimina el registro manual de incidentes y retardos
- Permite al director monitorear puntualidad docente en tiempo real
- Es requisito para generar reportes de asistencia en boletines

**Funcionalidades concretas:**
- Registro de asistencia de alumnos por sección y materia (presente / ausente / justificado / retardado)
- Registro de incidentes disciplinarios con adjunto fotográfico opcional
- Gestión de horarios de clases por grado y sección
- Reporte de asistencia acumulada exportable (PDF/Excel)
- Filtros por alumno, fecha, materia

---

### SELECCIÓN 2 — Módulo de Comunicación (Mensajería Bidireccional)
**Prioridad: ALTA**

**Justificación:**  
Actualmente los colegios usan grupos de WhatsApp para comunicarse con representantes, lo que genera caos, falta de trazabilidad y mezcla de información personal con institucional. Un módulo de mensajería interno con notificaciones automáticas es el diferenciador más visible para el representante y el más solicitado por directivos que quieren eliminar esa dependencia de WhatsApp.

**Impacto esperado:**
- Retención de representantes en la plataforma (necesitan abrirla para leer circulares)
- El colegio tiene trazabilidad de qué comunicados fueron leídos
- Complementa y potencia el Portal de Representantes (Fase 1 ya planificada)

**Funcionalidades concretas:**
- Canal de publicaciones del colegio (circulares, guías de estudio, avisos generales)
- Mensajería directa docente ↔ representante sobre un alumno específico
- Confirmación de lectura en circulares importantes
- Adjuntos: PDF, imágenes
- Notificaciones automáticas por email al recibir un mensaje nuevo
- Preparado para notificaciones push (cuando exista la PWA/App Móvil)

---

### SELECCIÓN 3 — Portal Docente (Gestión Docente Remota)
**Prioridad: ALTA**

**Justificación:**  
Eduweb destaca la carga de notas desde cualquier lugar como una ventaja competitiva clave. Octopus tiene el módulo de calificaciones planificado en Fase 2, pero se puede adelantar la interfaz del docente como acceso independiente, reduciendo la dependencia de que el docente vaya a la sala de computadores del colegio.

**Impacto esperado:**
- Adopción más rápida por parte de los docentes
- Reduce errores al eliminar transcripción manual de notas
- El director puede monitorear en tiempo real si las notas ya fueron cargadas

**Funcionalidades concretas:**
- Login separado para docentes con sus materias/secciones asignadas
- Carga de planes de evaluación (actividades, porcentajes, fechas)
- Ingreso y edición de calificaciones por lapso
- Compartir material de estudio (archivos PDF, enlaces)
- Registro de comentarios personalizados por alumno (aparecen en boleta)
- Vista de su horario semanal

---

### SELECCIÓN 4 — Seguimiento Gráfico del Rendimiento Académico
**Prioridad: MEDIA-ALTA**

**Justificación:**  
Esta funcionalidad convierte datos que ya existen (notas, asistencia) en inteligencia visual accionable. Para el representante, ver una gráfica de tendencia de su hijo es inmediatamente más valioso que una tabla de números. Para el directivo, un dashboard con rendimiento por sección permite detectar problemas pedagógicos antes de que se vuelvan críticos. Se implementa sobre datos que el sistema ya maneja.

**Impacto esperado:**
- Aumenta el tiempo de permanencia en la plataforma (representante y directivo)
- Diferenciador visual frente a sistemas que solo muestran tablas
- Permite identificar alumnos en riesgo académico antes del cierre de lapso

**Funcionalidades concretas:**
- Gráfica de línea de promedio por lapso por alumno (en portal representante)
- Gráfica de barras por materia para comparar rendimiento entre materias
- Indicador de asistencia acumulada vs. umbral mínimo del colegio
- Dashboard directivo: mapa de calor por sección (% de alumnos aprobados)
- Alertas automáticas cuando un alumno cae por debajo del promedio mínimo configurado

---

### SELECCIÓN 5 — Sistema de Permisos Granulares por Perfil (RBAC)
**Prioridad: MEDIA-ALTA**

**Justificación:**  
El sistema actual tiene roles básicos. Eduweb destaca su "Seguridad Flexible" como diferenciador institucional. Para el plan Multi-Sede (Fase 3) es un requisito técnico no negociable: sin RBAC bien implementado, no se puede dar acceso a un directivo regional sin que vea datos de otras sedes. Implementarlo ahora evita refactorización costosa después.

**Impacto esperado:**
- Permite vender el producto a instituciones con estructuras organizacionales complejas
- Habilita la Fase 3 (Multi-Sede) con menor esfuerzo
- Reduce riesgos de filtración de datos entre perfiles

**Funcionalidades concretas:**
- Roles base: `superadmin`, `director`, `coordinador`, `docente`, `representante`, `alumno`
- Permisos granulares por módulo (ver / crear / editar / eliminar)
- Asignación de roles a nivel de sede (para Fase 3)
- Log de auditoría: quién hizo qué y cuándo
- Panel de administración de roles en el backoffice

---

### SELECCIÓN 6 — PWA / App Móvil con Notificaciones Push
**Prioridad: MEDIA**

**Justificación:**  
Eduweb ofrece app nativa iOS & Android, lo cual es costoso de desarrollar y mantener. Octopus puede lograr una experiencia equivalente o superior con una PWA (Progressive Web App) usando el stack existente (React + Vite), sin necesidad de publicar en stores. Las notificaciones push vía Web Push API cubren el 90% del caso de uso real: avisos de notas, cobros y circulares. La PWA es la estrategia correcta para un SaaS multi-tenant.

**Impacto esperado:**
- El representante puede "instalar" Octopus en su celular desde el navegador
- Recibe notificaciones sin abrir el navegador (Web Push)
- Reduce el tiempo de respuesta a cobros y circulares importantes
- Ventaja de costo vs. Eduweb (no requiere mantener apps nativas)

**Funcionalidades concretas:**
- Service Worker + manifest.json para instalación en home screen
- Notificaciones push via Web Push API (backend: Django Channels o simple web-push library)
- Notificaciones de: nueva circular, nota cargada, factura generada, mensaje recibido
- Gestión de suscripciones push por usuario (puede activar/desactivar por tipo)
- Diseño mobile-first ya en roadmap de Fase 1 (se extiende a toda la plataforma)

---

### SELECCIÓN 7 — Módulo de Admisión Online
**Prioridad: MEDIA**

**Justificación:**  
Eduweb lo ofrece desde el plan Intermedio. Para los colegios, el proceso de admisión es la primera impresión que tiene el representante del colegio. Si ese proceso es digital, el colegio proyecta modernidad y reduce carga administrativa. Para Octopus, es una fuente de datos limpios desde el inicio del ciclo de vida del alumno (evita errores de transcripción en inscripción posterior).

**Impacto esperado:**
- Reduce el tiempo de admisión de días a horas
- Genera un pipeline visual de candidatos para el director
- Datos del formulario de admisión se convierten automáticamente en expediente al aprobar

**Funcionalidades concretas:**
- Formulario de admisión público (sin login) con campos configurables por colegio
- Carga de documentos requeridos (partida de nacimiento, fotos, etc.)
- Pipeline de estados: Recibido → En revisión → Entrevista → Aprobado / Rechazado
- Notificación automática al representante en cada cambio de estado
- Al aprobar: conversión automática a inscripción activa en el sistema

---

## 4. Herramientas descartadas y por qué

| Herramienta | Razón del descarte |
|-------------|-------------------|
| Sistema Educomp (docs MPPE) | Específico del sistema educativo venezolano, bajo ROI para expansión regional. Se puede añadir como módulo de localización Venezuela si el mercado lo requiere. |
| Monitoreo en tiempo real de desempeño docente | Funcionalidad de alto costo político interno (docentes lo perciben como vigilancia). Se puede derivar del módulo de carga de notas sin un módulo separado. |
| App Nativa iOS & Android | La PWA cubre el caso de uso al mismo costo de desarrollo. App nativa se evalúa si tracción de mercado lo justifica post-Fase 3. |

---

## 5. Roadmap de Implementación Propuesto

```
FASE 1 (en curso) ─────────────────────────────────────────────
  Portal de Representantes (ya planificado en CLAUDE.md)
  └── Se extiende con: Módulo Comunicación (circulares + mensajería)
                       Seguimiento Gráfico del Representante
                       Notificaciones push básicas (Web Push)

FASE 2 ──────────────────────────────────────────────────────────
  Módulo Académico (ya planificado) + Portal Docente
  └── Diario de Clases y Horarios
      Seguimiento Gráfico Directivo (dashboard rendimiento)
      RBAC granular (prerequisito para Fase 3)

FASE 3 ──────────────────────────────────────────────────────────
  Multi-Sede (ya planificado) + Admisión Online
  └── RBAC multi-sede (ya construido en Fase 2)
      PWA completa (service worker + push notifications)
      Admisión Online con pipeline de candidatos
```

---

## 6. Impacto en el Stack Técnico

### Frontend (React 19 + Vite)
| Funcionalidad | Librería/Tecnología | Observación |
|---------------|---------------------|-------------|
| Seguimiento gráfico | `recharts` o `chart.js` | No está en el stack actual — proponer al cliente antes de instalar |
| PWA | Vite PWA Plugin (`vite-plugin-pwa`) | Compatible con Vite 8, mínimo overhead |
| Web Push (frontend) | API nativa del browser | Sin dependencias adicionales |
| Mensajería en tiempo real | `socket.io-client` o WebSocket nativo | Coordinar con backend |

### Backend (Django)
| Funcionalidad | Tecnología | Observación |
|---------------|-----------|-------------|
| Notificaciones push | `pywebpush` | Librería Python para Web Push API |
| Mensajería en tiempo real | `Django Channels` + Redis | Requiere infraestructura de Redis |
| Permisos RBAC | `django-guardian` o RBAC custom | Evaluar si `django-guardian` es suficiente |
| Jobs de admisión / recordatorios | `Celery` + `Redis` (ya planificado en Fase 1) | Reutilizar la misma infraestructura |

---

## 7. Métricas de Éxito

| Módulo | Métrica | Meta (6 meses post-lanzamiento) |
|--------|---------|--------------------------------|
| Comunicación | % de circulares enviadas desde la plataforma vs. WhatsApp | > 60% |
| Diario de Clases | % de colegios con registro diario de asistencia | > 70% |
| Portal Docente | % de docentes cargando notas sin asistencia administrativa | > 80% |
| Seguimiento Gráfico | Tiempo promedio de sesión del representante | +40% vs. baseline |
| PWA | % de representantes con app instalada | > 50% |
| Admisión Online | Tiempo promedio de proceso de admisión | < 3 días |

---

## 8. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Rechazo de docentes a la carga digital de notas | Media | Alto | Capacitación, UI ultra-simple, soporte 1:1 al lanzar |
| Costos de infraestructura Redis/Channels para mensajería en tiempo real | Media | Medio | Iniciar con polling (sin WebSockets), escalar cuando haya > 50 colegios |
| Dependencia de Web Push en iOS (requiere iOS 16.4+) | Baja | Bajo | Fallback a notificaciones por email, comunicar limitación claramente |
| Complejidad del RBAC ralentiza otras fases | Media | Alto | Implementar RBAC en dos etapas: roles básicos en Fase 2, permisos granulares al inicio de Fase 3 |

---

## 9. Definición de Listo (Definition of Done) por módulo

Cada módulo se considera completado cuando:
- [ ] Funciona en mobile (375px) sin degradación visual
- [ ] Tiene manejo de errores con `react-toastify` en todas las llamadas Axios
- [ ] El backend tiene tests unitarios para la lógica de negocio crítica
- [ ] La deuda técnica detectada está anotada en `NOTAS_TECNICAS.md`
- [ ] Se ha probado con datos reales en un colegio piloto
- [ ] El rol de cada usuario accede exactamente a lo que le corresponde (ni más, ni menos)

---

*Este PRD debe revisarse y aprobarse antes de iniciar cualquier implementación de las fases aquí descritas.*
