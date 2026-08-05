# Plan de Upgrade — Portal de Representantes

> Objetivo: llevar el portal de representantes (`octopus-frontend/src/portal/`) al mismo
> nivel de diseño y arquitectura que el portal docente (`octopus-frontend/src/portal-docente/`),
> agregando además una página de Perfil y un Hero widget con carrusel (incluyendo alerta de
> rendimiento y avisos/notificaciones sin leer, confirmados por el cliente).
>
> Este documento está pensado para que **cada fase se ejecute con varios agentes en
> paralelo**. Dentro de cada fase, los agentes trabajan en archivos disjuntos (sin
> solapamiento) — se verificó explícitamente que ningún archivo aparece en dos tareas
> paralelas de la misma fase. La Fase 2 es de integración y debe correr con **un solo
> agente**, secuencial, porque depende de que toda la Fase 1 haya terminado.

---

## Fase 0 — Backend de Perfil (YA COMPLETADO)

No requiere agentes: ya se implementó y se verificó con `python manage.py check` (0 errores).

- `octopus-api/portal/serializers.py` → `PortalPerfilSerializer` (combina `User.first_name/last_name/email`,
  `PerfilUsuario.foto` — mismo modelo que ya usa el portal docente vía la señal
  `create_perfil_usuario`, no requirió migración — y `Representante.telefono/cedula`).
- `octopus-api/portal/views.py` → `PortalMiPerfilView` (GET/PATCH) y `PortalFotoPerfilView` (POST multipart),
  con `PortalJWTAuthentication`, espejo de `DocenteMiPerfilView`/`DocenteFotoPerfilView`.
- `octopus-api/portal/urls.py` → `mi-perfil/` y `mi-perfil/foto/` registradas.

**Importante para las fases siguientes**: no hace falta ninguna migración de base de datos.
`PerfilUsuario.foto` ya existe para cualquier `User`, incluyendo el que está detrás de cada
`RepresentanteUser`.

---

## Fase 1 — Implementación en paralelo (6 agentes)

Cada agente trabaja **solo** en los archivos listados en su tarea. No hay dependencias
entre agentes de esta fase — se pueden lanzar los 6 simultáneamente.

### Agente A — Layout desktop + navegación
**Archivos**: `octopus-frontend/src/portal/components/RepresentanteRail.jsx` (nuevo),
`octopus-frontend/src/portal/components/PortalLayout.jsx` (modificar)

- Crear `RepresentanteRail.jsx` calcado de `octopus-frontend/src/portal-docente/components/DesktopRail.jsx`:
  sidebar fijo `w-20`, oculto en móvil (`hidden md:flex`), con ítems: Inicio (`/portal`, `end`),
  Historial (`/portal/historial`), Comunicaciones (`/portal/comunicaciones`), Mensajes (`/portal/mensajes`),
  Rendimiento (`/portal/rendimiento`), **Perfil** (`/portal/perfil`, nuevo). Usar
  `var(--portal-primary, #0fa3b1)` para el estado activo (no `--docente-primary`).
- En `PortalLayout.jsx`:
  - Insertar `<RepresentanteRail />` antes del `<header>`.
  - Cambiar `max-w-[480px] mx-auto` del header/main a `max-w-[480px] md:max-w-7xl mx-auto ... md:pl-20`
    (mismo patrón que `DocenteLayout.jsx`).
  - Agregar el ítem **Perfil** (ícono `UserCircle` de `lucide-react`) a la bottom-nav móvil,
    apuntando a `/portal/perfil`.
  - Reemplazar los `text-[#0fa3b1]` / `bg-[#0fa3b1]` hardcodeados de este archivo (líneas de la
    bottom-nav y el botón de "cambiar contraseña" del header) por `var(--portal-primary, #0fa3b1)`.
    El valor por defecto del `useState` (`color_primario: '#0fa3b1'`) se queda igual, es un fallback,
    no un bug.

### Agente B — Perfil del representante (frontend completo)
**Archivos**: `octopus-frontend/src/portal/api/perfil.service.js` (nuevo),
`octopus-frontend/src/portal/hooks/usePortalPerfil.js` (nuevo),
`octopus-frontend/src/portal/pages/PortalPerfil.jsx` (nuevo),
`octopus-frontend/src/App.jsx` (modificar)

- `perfil.service.js` — espejo de `octopus-frontend/src/portal-docente/api/perfil.service.js` pero
  usando `portalClient` (no `docenteApiClient`) y las rutas nuevas del backend:
  ```js
  export const getMiPerfil = (signal) => portalClient.get('mi-perfil/', signal ? { signal } : undefined);
  export const actualizarMiPerfil = (datos, signal) => portalClient.patch('mi-perfil/', datos, signal ? { signal } : undefined);
  export const subirFotoPerfil = (file, signal) => { /* FormData 'foto', POST mi-perfil/foto/ */ };
  ```
- `usePortalPerfil.js` — espejo de `useDocentePerfil.js` (mismo contrato: `{ perfil, loading, guardando,
  subiendoFoto, guardarPerfil, subirFoto }`).
- `PortalPerfil.jsx` — espejo visual de `DocentePerfil.jsx` pero:
  - Paleta `var(--portal-primary)` / `var(--portal-secondary)` en vez de `--docente-primary`.
  - Agregar campo **Teléfono** (editable) y **Cédula** (solo lectura, con ícono, sin input editable)
    debajo del bloque usuario/rol — la cédula es el identificador de login, no se edita desde acá.
  - El link inferior apunta a `/portal/cambiar-contrasena` (ya existe).
- En `App.jsx`: lazy import `PortalPerfil` y agregar `<Route path="perfil" element={<PortalPerfil />} />`
  dentro del `<Route path="/portal" element={<PortalLayout/>}>` existente.

### Agente C — Fix de colores hardcodeados (archivos hoja)
**Archivos** (confirmado por grep — estos son TODOS los que tienen `#0fa3b1`/`#0d93a0` fuera de
`PortalLayout.jsx`, `PortalDashboard.jsx` y los widgets nuevos, que se resuelven en sus propias fases):

- `octopus-frontend/src/portal/components/EstudianteSelector.jsx`
- `octopus-frontend/src/portal/components/ComprobantePagoModal.jsx`
- `octopus-frontend/src/portal/pages/PortalCambiarContrasena.jsx`
- `octopus-frontend/src/portal/pages/PortalLogin.jsx`
- `octopus-frontend/src/portal/pages/PortalMensajes.jsx`
- `octopus-frontend/src/portal/pages/PortalComunicaciones.jsx`
- `octopus-frontend/src/portal/components/rendimiento/GraficaPorMateria.jsx`
- `octopus-frontend/src/portal/components/rendimiento/GraficaPromedioLapsos.jsx`
- `octopus-frontend/src/portal/components/rendimiento/IndicadorAsistencia.jsx`

Reemplazar `#0fa3b1` → `var(--portal-primary, #0fa3b1)` y `#0d93a0` → `var(--portal-primary-dark,
#0d93a0)` (agregar `--portal-primary-dark` como variable si no existe — ver Nota abajo).
Para clases Tailwind con modificador de opacidad (`bg-[#0fa3b1]/10`, `border-[#0fa3b1]/30`, etc.) que no
rendericen bien con `var()` + opacidad, seguir el precedente ya usado en
`components/NotificacionesModal.jsx`: pasar a `style={{ backgroundColor: 'color-mix(in srgb,
var(--portal-primary, #0fa3b1) 15%, white)' }}` en vez de la clase Tailwind arbitraria.
En los archivos de `rendimiento/` los colores están en props JS (`fill`, `stroke` de recharts), ahí
simplemente pasar el string `'var(--portal-primary, #0fa3b1)'` directamente — es válido como valor de
color SVG.

**Nota**: `PortalLayout.jsx` solo define `--portal-primary` y `--portal-secondary` hoy
(ver `useEffect` con `getConfigColegio`). Si `--portal-primary-dark` no viene de la API, agregar un
fallback calculado en el mismo `useEffect` (ej. oscurecer `color_primario` con una función simple, o
pedir al agente A que lo agregue como parte de su edición de `PortalLayout.jsx` — **coordinar con
Agente A si aplica**, ya que ambos tocan ese archivo. Alternativa más simple para no generar conflicto:
usar directamente `color-mix(in srgb, var(--portal-primary) 85%, black)` en vez de una segunda variable).

### Agente D — Widget Hero (carrusel)
**Archivo**: `octopus-frontend/src/portal/components/widgets/WidgetHeroPortal.jsx` (nuevo)

Construir el componente **solo contra este contrato de props** (los datos reales se conectan en la
Fase 2, no hace falta que este agente resuelva fetch de nada):

```js
<WidgetHeroPortal
  nombre={string}                       // representante.nombre
  resumen={resumen_financiero | null}   // mismo shape que devuelve GET /api/portal/dashboard/
  avisosSinLeer={number}                // circulares no leídas
  alertaRendimiento={[{ alumno_nombre, materia_nombre, promedio, alumno_id }] | []}
  loadingResumen={boolean}
  loadingAvisos={boolean}
  loadingRendimiento={boolean}
/>
```

- Carrusel con autoplay + flechas + puntos + pausa on-hover, **calcado del patrón de**
  `octopus-portal-docente/components/widgets/WidgetHero.jsx` (mismo `AUTOPLAY_MS`, mismo `irA`/
  `anterior`/`siguiente`, mismo botón pausa/play).
- Slides:
  1. **Saludo** — fecha + "Hola, {nombre}" + frase de pendientes (deuda / avisos sin leer), igual
     patrón que `SlideSaludo` de docente.
  2. **Resumen financiero** — si `resumen.total_deuda_usd > 0`, mostrar el monto y el mensualidad más
     vencida; si no, "Solvente — al día con los pagos" (mismo criterio que ya usa
     `PortalDashboard.jsx` hoy, solo llevado a slide).
  3. **Avisos sin leer** — contador de `avisosSinLeer`, con ícono `Megaphone`; si es 0, estado vacío
     "Estás al día con las comunicaciones del colegio."
  4. **Alerta de rendimiento** — si `alertaRendimiento.length > 0`, mostrar frase tipo
     "{alumno} bajó de nota en {materia} ({promedio})" (agrupando por alumno si hay más de uno, igual
     criterio que `SlideAlertaRiesgo` de docente); si está vacío, "Ningún hijo con materias por debajo
     del mínimo aprobatorio."
- Fondo: gradiente con `var(--portal-primary)` / `var(--portal-secondary)` (no crear variables
  `-dark` nuevas para esto, usar `linear-gradient(135deg, var(--portal-primary) 0%,
  var(--portal-secondary) 100%)`, que ya existen ambas).
- Logo del colegio de fondo: reusar el mismo patrón que `WidgetHero.jsx` de docente pero leyendo
  `logo_url` — **pasar `logoColegio` como prop** en vez de fetch propio (ya lo tiene `PortalLayout`
  vía `getConfigColegio`, evitar una tercera llamada al mismo endpoint).

### Agente E — Widgets de dashboard (financiero, vencimientos, pagos, acciones rápidas)
**Archivos** (todos nuevos): `octopus-frontend/src/portal/components/widgets/WidgetResumenFinanciero.jsx`,
`WidgetProximosVencimientos.jsx`, `WidgetUltimosPagos.jsx`, `WidgetAccionesRapidas.jsx`

Extraer tal cual la lógica visual que hoy vive inline en `PortalDashboard.jsx` (líneas ~135–299:
card de resumen financiero con mensualidades vencidas + otros conceptos pendientes, card de
próximos vencimientos, card de últimos pagos con link "Ver todos", botones "Pagar por transferencia"
desktop/móvil), partiéndola en los 4 componentes de arriba **recibiendo los mismos datos por props**
que hoy calcula `PortalDashboard.jsx` (`resumen`, `ultimosPagos`, `tieneDeuda`, `abrirModalComprobante`).
Ya usar `var(--portal-primary, #0fa3b1)` en el código nuevo — no hardcodear `#0fa3b1` en estos
archivos nuevos.

`WidgetAccionesRapidas.jsx` es contenido 100% nuevo (no existía en el dashboard actual), calcado de
`portal-docente/components/widgets/WidgetAccionesRapidas.jsx`: grid de 3-4 accesos directos con
ícono + label, `Link` de react-router:
- "Pagar por transferencia" → abre el modal (necesita recibir `onPagar` como prop callback, ya que
  el modal vive en `PortalDashboard.jsx`)
- "Ver historial" → `/portal/historial`
- "Rendimiento" → `/portal/rendimiento`
- "Comunicaciones" → `/portal/comunicaciones`

### Agente F — Hook de datos extra del Hero
**Archivo**: `octopus-frontend/src/portal/hooks/usePortalHeroExtra.js` (nuevo)

```js
// Firma: usePortalHeroExtra(alumnos: Array<{id}>) 
// Retorna: { avisosSinLeer, alertaRendimiento, loadingAvisos, loadingRendimiento }
```

- `avisosSinLeer`: `getCirculares()` (ya existe en `api/comunicacion.service.js`) filtrando `!c.leido`,
  devolver `.length`.
- `alertaRendimiento`: por cada alumno en `alumnos`, llamar `getRendimientoAlumnoPortal(alumno.id)`
  (ya existe en `api/academico.service.js`), tomar el último `por_lapso` con `por_materia.length > 0`
  (mismo criterio que ya usa `PortalRendimiento.jsx`), filtrar materias con `promedio < 10`, mapear a
  `{ alumno_id, alumno_nombre, materia_nombre, promedio }`. Máximo 3 en el resultado.
- Ambos fetch en paralelo con `Promise.allSettled`, con `AbortController` + cleanup, catch silencioso
  (mismo patrón que el resto del portal — no bloquear el Hero por un fallo de red en esto).
- **Sin alumnos** (`alumnos.length === 0`): devolver `alertaRendimiento: []` sin hacer fetch.

---

## Fase 2 — Integración (1 solo agente, secuencial)

Depende de que la Fase 1 completa haya terminado (A–F). No paralelizable: todo converge en el
mismo archivo.

**Archivo principal**: `octopus-frontend/src/portal/pages/PortalDashboard.jsx` (reescritura)

1. Reemplazar el JSX monolítico actual por composición en grid, mismo patrón que
   `DocenteDashboard.jsx` (`space-y-4 md:space-y-0 md:grid md:grid-cols-12 md:gap-4`):
   - `WidgetHeroPortal` (Agente D) — `md:col-span-12`, alimentado con `resumen`, `avisosSinLeer` y
     `alertaRendimiento` obtenidos de `usePortalHeroExtra(dashboardData?.alumnos)` (Agente F).
   - `WidgetAccionesRapidas` (Agente E) — `md:col-span-12`.
   - `WidgetResumenFinanciero`, `WidgetProximosVencimientos`, `WidgetUltimosPagos` (Agente E) —
     distribuidos en columnas (ej. `md:col-span-6` cada uno, o `md:col-span-4` los tres, a definir
     visualmente).
   - El `<EstudianteSelector>` y el nombre del alumno activo se mantienen igual que hoy, arriba del
     grid.
   - `<ComprobantePagoModal>` se mantiene al final, igual que hoy.
2. Verificar que **ningún archivo quedó con `#0fa3b1` hardcodeado** fuera de los fallbacks
   `var(--portal-primary, #0fa3b1)` (correr el mismo grep usado para armar este plan:
   `grep -rn "#0fa3b1" octopus-frontend/src/portal --include=*.jsx --include=*.js | grep -v "var(--portal-primary"`
   — debe devolver solo el default del `useState` en `PortalLayout.jsx`).
3. Actualizar `octopus-frontend/NOTAS_TECNICAS.md`: anotar como **deuda diferida, no implementada**:
   hook compartido `usePortalAlumnos()` para deduplicar el fetch de `getDashboard()` que hoy se repite
   en `PortalDashboard.jsx`, `PortalMensajes.jsx`, `PortalHistorialPagos.jsx` y
   `useRendimientoPortal.js` — cada uno con su propio `alumnoActivo` local. No se toca en este upgrade
   porque es una refactorización transversal fuera del alcance aprobado.
4. Verificación en navegador (dev server): login del portal, dashboard en mobile (bottom nav +
   botón flotante) y desktop (rail + grid), carrusel del Hero (las 4 slides), página `/portal/perfil`
   (editar datos + subir foto), y que los colores respondan si el colegio tiene `color_primario`
   distinto de `#0fa3b1` configurado.

---

## Resumen de paralelización

| Fase | Agentes | Dependencia |
|---|---|---|
| 0 | — (ya hecho) | — |
| 1 | A, B, C, D, E, F — **en paralelo, sin dependencias entre sí** | Fase 0 |
| 2 | 1 agente — integración secuencial | Toda la Fase 1 completa |
