# UI/UX BRIEF — Brief de Diseño
**Versión:** 1.0  
**Fecha:** 2026-06-13  
**Proyecto:** Octopus — Módulos de Expansión  
**Diseñar para:** React 19 + Tailwind CSS v4

---

## 1. Principios de Diseño (no negociables)

| Principio | Descripción |
|-----------|-------------|
| **Mobile-first** | Todo componente se diseña primero para 375px. Desktop es la extensión, no el punto de partida. |
| **Consistencia con lo existente** | Nuevos módulos deben sentirse parte del mismo producto. Reutilizar patrones de modales, tablas, y formularios ya implementados. |
| **Feedback inmediato** | Toda acción tiene respuesta visual: skeleton, spinner, toast, o estado de éxito/error. Nunca botón sin estado de carga. |
| **Jerarquía clara** | Un usuario debe entender qué puede hacer en cada pantalla en < 3 segundos. Máximo 1 acción primaria visible por sección. |
| **Densidad adaptada al rol** | Director ve dashboards densos con datos. Representante ve tarjetas simples y grandes. Docente ve tablas operativas. |

---

## 2. Sistema de Diseño (tokens existentes)

### Paleta de colores
```css
/* Primario — mantener consistencia con portal existente */
--color-primary: #0fa3b1;        /* teal — acción principal */
--color-primary-dark: #0c8a96;   /* hover */
--color-primary-light: #e0f7fa;  /* fondos suaves, badges */

/* Estado */
--color-success: #22c55e;        /* verde — aprobado, presente */
--color-warning: #f59e0b;        /* amarillo — pendiente, retardado */
--color-danger: #ef4444;         /* rojo — mora, ausente, riesgo */
--color-info: #3b82f6;           /* azul — informativo */

/* Neutros */
--color-gray-50: #f9fafb;
--color-gray-100: #f3f4f6;
--color-gray-200: #e5e7eb;
--color-gray-600: #4b5563;
--color-gray-900: #111827;
```

### Tipografía
- **Familia:** Inter (ya cargada en el proyecto)
- **Escala:** `text-xs` (12px) / `text-sm` (14px) / `text-base` (16px) / `text-lg` (18px) / `text-xl` (20px) / `text-2xl` (24px)
- **Pesos:** Regular (400) para cuerpo, Medium (500) para etiquetas, Semibold (600) para títulos, Bold (700) para métricas destacadas

### Espaciado
- Padding de tarjeta: `p-4` (mobile) → `p-6` (desktop)
- Gap entre secciones: `gap-4` (mobile) → `gap-6` (desktop)
- Padding de página: `px-4` (mobile) → `px-8` (desktop)

---

## 3. Componentes por Módulo

---

### 3.1 Diario de Clases y Horarios

#### Grilla de Horario Semanal
```
┌─────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│         │  LUNES   │  MARTES  │ MIÉRCOLES│  JUEVES  │ VIERNES  │
├─────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 07:00   │ [MAT]    │ [LEN]    │ [MAT]    │ [FIS]    │ [LEN]    │
│ 08:00   │ 5to A    │ 5to A    │ 5to A    │ 5to A    │ 5to A    │
├─────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 08:00   │ [FIS]    │ [MAT]    │ ...      │ ...      │ ...      │
└─────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```
- Celdas: color por materia (asignado automáticamente de una paleta de 10 colores)
- Click en celda → drawer lateral con detalle del bloque
- Mobile: scroll horizontal, columna fija de horas
- Botón `+` flotante (bottom-right) para agregar bloque (solo director)

#### Tabla de Asistencia
```
┌─────────────────────────────────────────────────────────────────┐
│ Asistencia — 5to A — Matemáticas — Lunes 09/06/2026            │
│ 18/20 alumnos marcados                          [Guardar Todo]  │
├──────────────────────────┬────┬────┬────┬────┬─────────────────┤
│ Alumno                   │ P  │ A  │ J  │ R  │ Observación     │
├──────────────────────────┼────┼────┼────┼────┼─────────────────┤
│ García, Ana              │ ●  │ ○  │ ○  │ ○  │                 │
│ López, Carlos            │ ○  │ ●  │ ○  │ ○  │ "Sin aviso"     │
│ Pérez, María             │ ○  │ ○  │ ●  │ ○  │ "Cita médica"   │
└──────────────────────────┴────┴────┴────┴────┴─────────────────┘
```
- Radio buttons grandes (táctiles) — mínimo 44px de área de toque
- Mobile: tabla compacta, observación en expand row
- Selección rápida: "Marcar todos presente" en header

#### Badge de estado de asistencia
```
[P] Verde    — Presente
[A] Rojo     — Ausente  
[J] Azul     — Justificado
[R] Amarillo — Retardado
```

---

### 3.2 Módulo de Comunicación

#### Lista de Circulares (Portal Representante)
```
┌─────────────────────────────────────────────────────────────────┐
│ 📢 Comunicaciones                          [●] 2 sin leer       │
├─────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ ● Reunión de padres — 5to grado         Jun 12, 2026      │   │
│ │   "Se convoca a todos los representantes de..."           │   │
│ │   [PDF adjunto]              [⚠ Requiere confirmación]    │   │
│ └───────────────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │   Calendario de evaluaciones Lapso 2     Jun 10, 2026     │   │
│ │   "A continuación el calendario de..."         ✓ Leído    │   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```
- Punto azul = no leído, sin punto = leído
- Badge naranja en navbar con conteo de no leídas
- Botón "He leído" prominente, desaparece al confirmar

#### Chat Docente ↔ Representante
```
┌─────────────────────────────────────────────────────────────────┐
│ ← Conversación sobre Juan Pérez — Prof. García                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Jun 10, 2026 — 09:30                                          │
│   ┌──────────────────────────────┐                              │
│   │ Buenos días. Juan olvidó     │  (Docente)                   │
│   │ entregar la tarea de...      │                              │
│   └──────────────────────────────┘                              │
│                                                                  │
│                              Jun 10, 2026 — 10:15               │
│                              ┌──────────────────────────────┐   │
│                              │ Gracias por avisar. Hablaré  │   │
│                              │ con él esta tarde.           │   │
│                              └────────────────── ✓ Leído ──┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ [📎] Escribe un mensaje...                          [Enviar →]  │
└─────────────────────────────────────────────────────────────────┘
```
- Burbujas: gris izquierda (otro) / teal derecha (yo)
- Timestamp y estado de lectura (✓ / ✓✓)
- Input fijo en bottom, scroll hacia arriba

---

### 3.3 Portal Docente

#### Dashboard Docente
```
┌─────────────────────────────────────────────────────────────────┐
│ Bienvenido, Prof. García                   Lunes, 09 Jun 2026   │
├────────────────┬────────────────┬────────────────┬──────────────┤
│ 4              │ 2              │ 1              │ 3            │
│ Materias       │ Notas          │ Lapso          │ Sin leer     │
│ asignadas      │ pendientes     │ activo         │ mensajes     │
├────────────────┴────────────────┴────────────────┴──────────────┤
│ HOY — Martes 09/06                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│ │ 07:00    │ │ 09:00    │ │ 11:00    │                         │
│ │ Matemát. │ │ Física   │ │ Matemát. │                         │
│ │ 5to A    │ │ 4to B    │ │ 5to B    │                         │
│ └──────────┘ └──────────┘ └──────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```
- Métricas en tarjetas de 1 línea, número grande
- Timeline del día actual prominente
- Tarjetas de clases del día clickeables → va directo a asistencia

#### Tabla de Calificaciones
```
┌─────────────────────────────────────────────────────────────────┐
│ Calificaciones — Matemáticas 5to A — Lapso 1                    │
│                                                                  │
│ Actividades: [Tarea 1 - 20%] [Examen - 40%] [Proyecto - 40%]   │
│              ↑ activa                                            │
├──────────────────────────┬──────────┬──────────────────────────┤
│ Alumno                   │  Nota    │ Comentario               │
├──────────────────────────┼──────────┼──────────────────────────┤
│ García, Ana              │ [18.5  ] │ [+ comentario]           │
│ López, Carlos            │ [12.0  ] │ "Debe mejorar atención"  │
│ Pérez, María             │ [____  ] │                          │
├──────────────────────────┼──────────┼──────────────────────────┤
│ Promedio de actividad    │  15.2    │            [Guardar Todo] │
└──────────────────────────┴──────────┴──────────────────────────┘
```
- Input numérico validado (0.00 - 20.00)
- Promedio en footer calculado en tiempo real
- Notas vacías en gris, cursor va a la siguiente con Tab
- `[Guardar Todo]` — botón sticky en bottom (mobile)

---

### 3.4 Seguimiento Gráfico del Rendimiento

#### Vista Representante — Gráficas del Hijo
```
┌─────────────────────────────────────────────────────────────────┐
│ Rendimiento Académico — Juan Pérez                              │
│                                                                  │
│ Promedio General                                                 │
│  20 ┤                                                           │
│  15 ┤          ●────────●                                       │
│  12 ┤ - - - - - - - - - - - - - - (mínimo aprobatorio)         │
│  10 ┤●                            ●                             │
│   0 └────────────────────────────────                           │
│      Lapso 1      Lapso 2      Lapso 3                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Por Materia — [Lapso 1 ▾] [Lapso 2 ▾] [Lapso 3 ▾]             │
│                                                                  │
│  Matemáticas  ████████████░░░░  12.0                            │
│  Lengua       ████████████████  17.0                            │
│  Física       ██████████░░░░░░  10.5 ⚠                         │
│  Historia     █████████████░░░  14.0                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Asistencia          ◐ 90%   72 / 80 clases                     │
│ ████████████████████████████████████░░░░░                       │
└─────────────────────────────────────────────────────────────────┘
```
- Gráfica de línea: recharts `<LineChart>` con tooltip en hover
- Gráfica de barras: `<BarChart>` horizontal (más fácil de leer en mobile)
- Indicador circular de asistencia: CSS o recharts `<RadialBar>`
- Ícono ⚠ en materia cuando la nota está por debajo del mínimo
- Selector de lapso: tabs compactos sobre las barras

#### Dashboard Director — Mapa de Calor
```
┌──────────────┬────────────┬────────────┬────────────┬──────────┐
│ Sección      │ Matemát.   │ Lengua     │ Física     │ Historia │
├──────────────┼────────────┼────────────┼────────────┼──────────┤
│ 1er A        │ 🟢 87%     │ 🟢 92%     │ 🟡 68%     │ 🟢 85%  │
│ 1er B        │ 🟡 72%     │ 🟢 88%     │ 🔴 54%     │ 🟡 71%  │
│ 5to A        │ 🔴 48%     │ 🟡 65%     │ 🔴 41%     │ 🟡 73%  │
└──────────────┴────────────┴────────────┴────────────┴──────────┘
```
- Tabla sticky con header fijo
- Click en celda → modal con lista de alumnos de esa sección/materia
- Filtros: grado, lapso, ordenar por más crítico

---

### 3.5 RBAC — Panel de Permisos

#### Tabla de Configuración de Roles
```
┌─────────────────────────────────────────────────────────────────┐
│ Configuración de Roles          [Rol: Coordinador ▾]            │
├────────────────────┬──────┬───────┬────────┬────────────────────┤
│ Módulo             │ Ver  │ Crear │ Editar │ Eliminar           │
├────────────────────┼──────┼───────┼────────┼────────────────────┤
│ Inscripciones      │  ✓   │  ✓    │   ✓    │   ✗               │
│ Cobranza           │  ✓   │  ✗    │   ✗    │   ✗               │
│ Módulo Académico   │  ✓   │  ✓    │   ✓    │   ✗               │
│ Comunicación       │  ✓   │  ✓    │   ✓    │   ✓               │
│ Reportes           │  ✓   │  ✗    │   ✗    │   ✗               │
│ Configuración      │  ✗   │  ✗    │   ✗    │   ✗               │
└────────────────────┴──────┴───────┴────────┴────────────────────┘
  [Restablecer Valores por Defecto]              [Guardar Cambios]
```
- Toggles grandes (switch), no checkboxes — más táctiles
- Cambios no se guardan hasta el botón "Guardar Cambios"
- Badge "sin guardar" si hay cambios pendientes
- Selector de rol en header — cambia toda la tabla

---

### 3.6 PWA — Elementos de Instalación

#### Modal de Activación de Notificaciones
```
┌─────────────────────────────────────────────────────────────────┐
│            🔔 Mantente informado                                 │
│                                                                  │
│  Activa las notificaciones para recibir alertas de:             │
│                                                                  │
│    📢 Circulares y comunicados del colegio                      │
│    📊 Notas cargadas por los docentes                           │
│    💰 Facturas y recordatorios de pago                          │
│    💬 Mensajes nuevos de docentes                               │
│                                                                  │
│              [Activar Notificaciones]                            │
│                      [Ahora no]                                  │
└─────────────────────────────────────────────────────────────────┘
```
- Aparece 10 segundos después del primer login exitoso
- No bloquea la interfaz (overlay suave, no modal bloqueante)
- "Ahora no" lo pospone 7 días, guarda en localStorage

---

### 3.7 Módulo de Admisión

#### Formulario Público (multi-step)
```
Step 1/3 ──●──○──○  Datos del candidato

┌─────────────────────────────────────────────────────────────────┐
│ Solicitud de Admisión — Colegio Ejemplo                         │
│                                                                  │
│ Nombre completo del candidato *                                  │
│ [                                                             ]  │
│                                                                  │
│ Fecha de nacimiento *                                            │
│ [DD/MM/AAAA                                                   ]  │
│                                                                  │
│ Grado al que aplica *                                            │
│ [Seleccionar grado ▾                                          ]  │
│                                                                  │
│                                              [Siguiente →]       │
└─────────────────────────────────────────────────────────────────┘
```
- Indicador de pasos en top (breadcrumb visual)
- Validación inline al salir del campo (no al enviar)
- Mobile: un campo por línea, teclado apropiado (numérico para fechas)
- Botón "Siguiente" deshabilitado hasta completar campos requeridos

#### Pipeline Kanban (Admin)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐
│  RECIBIDO    │ │ EN REVISIÓN  │ │  ENTREVISTA  │ │ APROBADO  │
│  (4)         │ │   (2)        │ │   (1)        │ │   (3)     │
│              │ │              │ │              │ │           │
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │ │           │
│ │Ana Gómez │ │ │ │Luis Mora │ │ │ │Sol Reyes │ │ │           │
│ │1er grado │ │ │ │3er grado │ │ │ │5to grado │ │ │           │
│ │hace 2d   │ │ │ │hace 5d   │ │ │ │hoy       │ │ │           │
│ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │ │           │
└──────────────┘ └──────────────┘ └──────────────┘ └───────────┘
```
- Drag & drop entre columnas (o flechas en mobile)
- Tarjetas con color de borde según urgencia (días en estado)
- Click en tarjeta → drawer lateral con detalle completo

---

## 4. Patrones de Estados de Carga

### Skeleton Loaders (consistencia con lo existente)
Todos los módulos nuevos usan skeletons, no spinners:

```
Tarjeta skeleton:
┌─────────────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░                                    │
│ ░░░░░░░░░░░░░░░                  ░░░░░░░                        │
│ ░░░░░░░░░░░░░░░░░░░░                                            │
└─────────────────────────────────────────────────────────────────┘

Tabla skeleton (3 filas):
┌─────────────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░         │
│ ░░░░░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░         │
│ ░░░░░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░░░    ░░░░░░░░         │
└─────────────────────────────────────────────────────────────────┘
```
- Color: `bg-gray-200 animate-pulse` (Tailwind)
- Duración de animación: 1.5s ease-in-out

### Estados de Error
```
┌─────────────────────────────────────────────────────────────────┐
│               ⚠️  No se pudo cargar la información              │
│          Verifica tu conexión e intenta nuevamente              │
│                                                                  │
│                    [Reintentar]                                  │
└─────────────────────────────────────────────────────────────────┘
```
- Botón "Reintentar" llama al mismo fetch
- Toast de error adicional con `react-toastify` (tipo `error`)

### Estados Vacíos
```
┌─────────────────────────────────────────────────────────────────┐
│                          📭                                      │
│               No hay circulares publicadas                       │
│          Las comunicaciones del colegio aparecerán aquí         │
└─────────────────────────────────────────────────────────────────┘
```
- Ícono de lucide-react apropiado al contexto
- Texto descriptivo (no genérico)
- CTA solo si el usuario tiene permiso para crear

---

## 5. Responsive Breakpoints

```
Mobile first:  375px  (diseño base)
Tablet:        768px  (md:) — layout de 2 columnas donde aplique
Desktop:       1024px (lg:) — sidebars, tablas completas
Wide:          1280px (xl:) — máximo ancho de contenido: max-w-7xl
```

### Adaptaciones críticas por módulo
| Módulo | Mobile (375px) | Desktop (1024px) |
|--------|---------------|-----------------|
| Horario semanal | Scroll horizontal, 1 día visible | Grid de 5 días completo |
| Tabla de asistencia | Expand row para observación | Columna de observación visible |
| Pipeline Kanban | Scroll horizontal, 1 columna visible | 5 columnas en pantalla |
| Gráficas de rendimiento | Barras horizontales (más legibles) | Líneas y barras side-by-side |
| Tabla de calificaciones | Input ocupa 50% del ancho | Columna compacta, más columnas visibles |

---

## 6. Accesibilidad

- Contraste mínimo: 4.5:1 para texto normal, 3:1 para texto grande (WCAG AA)
- Área de toque mínima: 44x44px para todos los controles táctiles
- Labels en todos los inputs (no solo placeholders)
- `aria-label` en botones icónicos sin texto
- Manejo de foco: modales trapean el foco, se cierra con Escape
- Mensajes de toast accesibles: `role="alert"` (react-toastify lo hace automáticamente)
