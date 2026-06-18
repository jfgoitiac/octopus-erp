# APP FLOW — Flujo de la Aplicación
**Versión:** 1.0  
**Fecha:** 2026-06-13  
**Proyecto:** Octopus — Módulos de Expansión

---

## Convenciones del diagrama
- `[Pantalla]` — vista o página
- `(Acción)` — acción del usuario
- `→` — navegación o consecuencia directa
- `⚡` — llamada a API / evento asíncrono
- `📧` — email automático
- `🔔` — notificación push
- `🔒` — requiere autenticación / rol específico

---

## FLUJO 1 — Diario de Clases y Horarios

```
ACTOR: Docente
─────────────────────────────────────────────────────────

[Login Admin] 🔒(rol: docente)
  → [Dashboard Docente]
      → [Mi Horario Semanal]
          (selecciona bloque de clase del día)
          → [Registro de Asistencia — Sección]
              (marca cada alumno: P/A/J/R)
              (agrega observación opcional)
              (click "Guardar Asistencia")
              ⚡ POST /api/academico/asistencia/bulk/
              → Toast "Asistencia guardada" ✓

      → [Incidentes Disciplinarios]
          (click "Nuevo Incidente")
          → [Modal Nuevo Incidente]
              (selecciona alumno)
              (escribe descripción)
              (selecciona severidad: Leve / Moderado / Grave)
              (adjunta foto opcional — máx 5MB)
              (click "Registrar")
              ⚡ POST /api/academico/incidentes/ (multipart)
              → Toast "Incidente registrado" ✓

ACTOR: Director / Coordinador
─────────────────────────────────────────────────────────

[Dashboard Admin]
  → [Módulo Horarios]
      → [Vista Semanal por Grado/Sección]
          (click "+ Agregar Bloque")
          → [Modal Horario]
              (selecciona grado, sección, materia, docente)
              (define día y hora)
              ⚡ POST /api/academico/horarios/
              → Horario actualizado en vista

  → [Reportes → Asistencia]
      (selecciona filtros: alumno / sección / materia / rango de fechas)
      ⚡ GET /api/academico/asistencia/reporte/
      → [Vista Reporte Acumulado]
          (click "Exportar PDF") → jsPDF genera PDF local
          (click "Exportar Excel") → xlsx genera .xlsx local
```

---

## FLUJO 2 — Módulo de Comunicación

```
ACTOR: Director / Coordinador (publica circular)
─────────────────────────────────────────────────────────

[Panel Admin → Comunicación]
  → [Circulares]
      (click "+ Nueva Circular")
      → [Editor de Circular]
          (escribe título y cuerpo)
          (adjunta PDF/imagen opcional)
          (toggle "Requiere confirmación de lectura")
          (selecciona destinatarios: todos / grado / sección)
          (click "Publicar")
          ⚡ POST /api/comunicacion/circulares/
          ⚡ Celery task → 📧 Email a todos los destinatarios
          🔔 Web Push (si PWA activa)
          → Toast "Circular publicada" ✓
          → [Lista Circulares con badge de lecturas]

  → [Mensajería Directa — Docente]
      (selecciona alumno)
      (selecciona representante del alumno)
      (escribe mensaje)
      ⚡ POST /api/comunicacion/mensajes/
      📧 Email al representante "Nuevo mensaje sobre [alumno]"
      🔔 Web Push (si activo)

ACTOR: Representante (lee circular en portal)
─────────────────────────────────────────────────────────

[Portal Representante → Comunicaciones]
  → [Lista Circulares]
      (badge de no leídas)
      (click en circular)
      → [Detalle Circular]
          ⚡ POST /api/comunicacion/circulares/{id}/confirmar/
          (si requiere_confirmacion=True → botón "He leído" visible)
          (click "He leído")
          ⚡ PATCH LecturaCircular.leido = True
          → Botón desaparece, circular marcada ✓

  → [Mensajes]
      (lista de conversaciones por alumno)
      (click en conversación)
      → [Chat con Docente]
          (escribe mensaje)
          ⚡ POST /api/comunicacion/mensajes/
          📧 Email al docente

ACTOR: Backend (polling frontend)
─────────────────────────────────────────────────────────

Cada 30 segundos:
  ⚡ GET /api/comunicacion/mensajes/?no_leidos=true
  → Si hay nuevos → badge en ícono de mensajes en navbar
```

---

## FLUJO 3 — Portal Docente

```
ACTOR: Docente
─────────────────────────────────────────────────────────

[Login → /portal-docente/login]
  (email + contraseña del sistema admin)
  ⚡ POST /api/auth/token/ (mismo endpoint admin)
  → [Dashboard Docente]
      Tarjetas: Materias asignadas | Notas pendientes | Mensajes sin leer

  → [Mis Materias]
      ⚡ GET /api/academico/docente/mis-materias/
      → [Lista: Materia + Sección + Lapso]
          (click en materia)
          → [Gestión de Materia]

  → [Gestión de Materia → Plan de Evaluación]
      (si no existe plan)
      (click "+ Crear Plan")
      → [Editor de Plan]
          (define actividades: nombre, porcentaje, fecha)
          (validación: suma porcentajes = 100%)
          ⚡ POST /api/academico/planes/
          → Toast "Plan guardado" ✓

  → [Gestión de Materia → Calificaciones]
      (selecciona actividad del plan)
      → [Tabla de Calificaciones por Sección]
          (fila por alumno, input de nota)
          (click "+ Comentario" → textarea inline)
          (click "Guardar Todas")
          ⚡ POST /api/academico/calificaciones/bulk/
          → Toast "Notas guardadas" ✓

  → [Gestión de Materia → Material de Estudio]
      (click "+ Agregar Material")
      → [Modal Material]
          (título, descripción)
          (adjunta PDF o escribe enlace)
          ⚡ POST /api/academico/materiales/
          → Material aparece en portal del representante

  → [Mi Horario]
      ⚡ GET /api/academico/horarios/?docente=me
      → Vista semanal (solo lectura para el docente)

ACTOR: Director (monitoreo)
─────────────────────────────────────────────────────────

[Panel Admin → Académico → Estado de Notas]
  → [Dashboard por Lapso]
      Columnas: Materia | Docente | % Notas Cargadas | Última Actualización
      ⚡ GET /api/academico/planes/?resumen=true
      → Filas en rojo si notas < 100% a X días del cierre de lapso
```

---

## FLUJO 4 — Seguimiento Gráfico del Rendimiento

```
ACTOR: Representante
─────────────────────────────────────────────────────────

[Portal → Dashboard]
  (tab/selector del hijo activo)
  → [Sección Rendimiento Académico]
      ⚡ GET /api/academico/rendimiento/alumno/{id}/
      → [Gráfica de Línea: Promedio General por Lapso]
          Eje X: Lapso 1, Lapso 2, Lapso 3
          Eje Y: Nota (0-20)
          Línea roja punteada = mínimo aprobatorio
          
      → [Gráficas de Barras por Materia]
          Una barra por materia, con nota del lapso seleccionado
          Click en lapso → actualiza gráficas
          
      → [Indicador de Asistencia]
          Círculo de progreso: X% presencias
          Texto: "72 de 80 clases"
          Rojo si < umbral mínimo configurado

ACTOR: Director / Coordinador
─────────────────────────────────────────────────────────

[Panel Admin → Reportes → Rendimiento]
  → [Mapa de Calor por Sección]
      ⚡ GET /api/academico/rendimiento/seccion/{id}/
      Tabla: Grado/Sección vs. % Aprobados por Materia
      Colores: verde (>80%), amarillo (60-80%), rojo (<60%)
      
  → [Alertas de Riesgo Académico]
      ⚡ GET /api/academico/rendimiento/alertas/
      → Lista de alumnos en riesgo con nombre, sección, promedio actual
      → (click) → perfil del alumno con gráficas detalladas
```

---

## FLUJO 5 — RBAC (Sistema de Permisos)

```
ACTOR: Superadmin / Director
─────────────────────────────────────────────────────────

[Panel Admin → Configuración → Roles y Permisos]
  → [Tabla de Roles]
      Filas: Módulo (Inscripciones, Cobranza, Académico, etc.)
      Columnas: Ver | Crear | Editar | Eliminar
      Por cada rol seleccionado en el selector superior
      
      (toggle un permiso)
      ⚡ PATCH /api/auth/permisos/{rol}/{modulo}/{accion}/
      → Toast "Permiso actualizado" ✓
      → Cambio refleja inmediatamente (próximo login del usuario con ese rol)

  → [Log de Auditoría]
      Filtros: usuario, módulo, fecha, tipo de acción
      ⚡ GET /api/auth/auditoria/
      → Tabla: Fecha | Usuario | Acción | Módulo | Detalle
      → (click fila) → modal con datos_antes vs. datos_despues

ACTOR: Usuario con rol restringido
─────────────────────────────────────────────────────────

[Login] → JWT decodificado incluye rol
→ Sidebar solo muestra módulos donde tiene permiso 'ver'
→ Botones "Crear" / "Editar" / "Eliminar" solo aparecen si tiene el permiso
→ Si intenta acceso directo por URL sin permiso:
    ⚡ API devuelve 403
    → [Pantalla "Sin permisos"] con botón Volver
```

---

## FLUJO 6 — PWA e Instalación

```
ACTOR: Representante (primera visita en móvil)
─────────────────────────────────────────────────────────

[Abre portal.colegio.octopus.app en navegador móvil]
  → Service Worker registrado en background
  → [Banner del navegador: "Agregar a pantalla de inicio"]
      (click "Instalar")
      → App aparece en homescreen con ícono Octopus
      → Próximas aperturas: modo standalone (sin barra del navegador)

[Primera vez en Dashboard]
  → [Modal "Activar notificaciones"]
      (click "Sí, activar")
      → Browser pide permiso de notificaciones
      → (acepta) → ⚡ POST /api/notificaciones/push/suscribir/
          { endpoint, p256dh, auth, tipos: ['circular','nota','factura','mensaje'] }
      → Toast "Notificaciones activadas" ✓
      
      (click "Ahora no") → modal no vuelve a aparecer por 7 días

FLUJO DE NOTIFICACIÓN ENTRANTE
─────────────────────────────────────────────────────────

[Backend: evento disparador]
  ⚡ Celery task: enviar_push(suscripcion_id, titulo, cuerpo, url)
  → pywebpush envía al endpoint del browser
  → Sistema operativo muestra notificación aunque la app esté cerrada
  
  (click en notificación)
  → Abre portal en la URL indicada (ej: /portal/mensajes)
```

---

## FLUJO 7 — Admisión Online

```
ACTOR: Representante prospecto (sin cuenta)
─────────────────────────────────────────────────────────

[Accede a colegio.octopus.app/admision]  ← URL pública, sin login
  → [Formulario de Admisión — Paso 1: Datos del Candidato]
      Nombre completo, fecha de nacimiento, grado al que aplica
      (click "Siguiente")
      
  → [Formulario de Admisión — Paso 2: Datos del Representante]
      Nombre, cédula, email, teléfono
      (click "Siguiente")
      
  → [Formulario de Admisión — Paso 3: Documentos]
      Uploader para: Partida de nacimiento, Fotografía, Boletín anterior
      (click "Enviar Solicitud")
      ⚡ POST /api/admision/solicitud/ (multipart)
      📧 Email al representante con token de seguimiento
      
  → [Página de Confirmación]
      "Su solicitud fue recibida"
      Link para ver estado: /admision/seguimiento/{token}

[Representante visita /admision/seguimiento/{token}]
  ⚡ GET /api/admision/solicitud/{token}/status/
  → [Estado actual en timeline visual]
      ● Recibido ● En Revisión ○ Entrevista ○ Aprobado/Rechazado

ACTOR: Director / Coordinador (pipeline de admisión)
─────────────────────────────────────────────────────────

[Panel Admin → Admisión]
  → [Pipeline Kanban — 5 columnas]
      Recibido | En Revisión | Entrevista | Aprobado | Rechazado
      Tarjetas: nombre candidato, grado, fecha, días en estado actual
      
      (drag & drop tarjeta entre columnas)
      ⚡ PATCH /api/admision/solicitudes/{id}/estado/
      📧 Email automático al representante "Su solicitud pasó a [estado]"
      
      (click tarjeta)
      → [Detalle de Solicitud]
          Datos completos del candidato y representante
          Documentos adjuntos (preview PDF/imagen)
          Campo "Notas internas" (solo visible para admin)
          
          (click "Aprobar Solicitud") → [Modal Confirmación]
          ⚡ POST /api/admision/solicitudes/{id}/aprobar/
              → transaction.atomic():
                  - Crea Alumno
                  - Crea Representante
                  - Crea UsuarioPortal (contraseña = cédula)
                  - Estado → 'aprobado'
              📧 Email al representante con credenciales del portal
          → Toast "Alumno creado exitosamente" ✓
          → [Redirige al perfil del nuevo alumno en Inscripciones]
```

---

## Mapa General de Navegación (Admin)

```
/                       Panel Principal (Dashboard)
├── /inscripciones      Gestión de alumnos
├── /cobranza           Facturación y cobros
├── /academico          (NUEVO — Fase 2)
│   ├── /horarios       Horarios de clases
│   ├── /asistencia     Registro de asistencia
│   ├── /calificaciones Notas (vista director)
│   ├── /rendimiento    Gráficas y alertas
│   └── /materiales     Material de estudio
├── /comunicacion       (NUEVO — Fase 1 extendida)
│   ├── /circulares     Publicaciones
│   └── /mensajes       Mensajería directa
├── /admision           (NUEVO — Fase 3)
│   └── /pipeline       Kanban de candidatos
├── /reportes           Reportes existentes + nuevos
└── /configuracion
    ├── /notificaciones Configuración existente
    └── /roles          (NUEVO — RBAC)

/portal-docente         (NUEVO — Fase 2)
├── /login
├── /dashboard
├── /mis-materias
│   └── /:materiaId
│       ├── /asistencia
│       ├── /calificaciones
│       ├── /plan
│       └── /material
└── /horario

/portal                 Portal de Representantes (Fase 1)
├── /login
├── /dashboard
├── /pagos
├── /comunicaciones     (NUEVO — Fase 1 extendida)
│   ├── /circulares
│   └── /mensajes
└── /rendimiento        (NUEVO — Seguimiento gráfico)

/admision               (NUEVO — Público, sin auth)
└── /seguimiento/:token
```
