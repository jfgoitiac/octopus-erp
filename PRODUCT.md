# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Representante** (padre, madre o tutor legal) de uno o varios estudiantes de un colegio privado en Venezuela. Entra casi siempre desde el celular, en ratos cortos (en la cola, en el trabajo, de noche en casa), muchas veces con datos móviles y pantallas de 360px.
- Trabajo principal, en orden: saber si debe algo y cuánto; pagarlo o reportar la transferencia; ver los avisos del colegio; revisar notas, rendimiento y mensajes de los docentes.
- Audiencias secundarias que tocan el mismo código pero NO son el usuario de este portal: el panel administrativo (personal del colegio), el portal docente y la cantina (POS).

## Product Purpose

Octopus es un SaaS de gestión escolar para colegios privados en Latinoamérica (inscripciones, facturación, cobranza, reportes, módulo académico, cantina). El portal de representantes es la cara del colegio hacia la familia: éxito es que el representante entienda su estado de cuenta en segundos, reporte su pago sin llamar al colegio y se entere de lo que el colegio comunica.

## Positioning

Cada colegio ve su propia marca (nombre, logo y colores leídos del perfil del colegio en la API). El portal habla en montos de referencia (REF/USD) con su equivalente en bolívares a tasa BCV, y el pago típico es transferencia o pago móvil con comprobante que el colegio aprueba o rechaza.

## Operating Context

- Montos en REF con equivalente en Bs. a tasa BCV del día.
- Pago manual: el representante sube un comprobante (imagen o PDF) con número de referencia; el colegio lo marca Pendiente / Aprobado / Rechazado (con motivo).
- Familias con varios hijos: la deuda se consolida; algunos datos (pagos, notas) se filtran por hijo activo.
- Recordatorios automáticos de cobranza por email (día 0, 5, 10, 15) y notificaciones push opcionales.
- Instalable como PWA en el celular.

## Capabilities and Constraints

- Secciones: Inicio, Historial, Avisos (comunicaciones), Mensajes, Rendimiento, Plan de evaluación, Cantina, Mi perfil, Seguridad (cambio de contraseña).
- El representante **no** ve incidentes disciplinarios.
- Stack fijo: React 19 + Vite, react-router-dom v7, Tailwind CSS v4, lucide-react, react-toastify, date-fns (locale `es`). No se agregan librerías sin consultar.
- Mobile-first estricto (360px primero); solo breakpoints sm/md/lg/xl de Tailwind; `dvh`, nunca `vh`; modales solo con `src/components/ui/Modal.jsx`; tablas anchas con `TablaScroll.jsx`.
- Fechas visibles siempre con date-fns en español.

## Brand Commitments

- El color de marca es el del colegio (`--portal-primary` / `--portal-secondary`, inyectados por `BrandingContext`); el portal nunca impone un color propio de Octopus.
- El nombre real del colegio (`nombreColegio`) aparece en el marco, nunca un texto genérico.
- Nada de promociones ni mensajes comerciales dentro del portal.
- Bordes semi-redondeados, aspecto moderno y holgado (preferencia del dueño del producto).

## Evidence on Hand

- Logo y colores por colegio vienen de la API; existe un logo de respaldo en `octopus-frontend/src/assets/logo-colegio.png`.
- Imagen de referencia de composición aportada por el dueño (dashboard "University": lienzo claro, riel lateral con avatar, gran bloque de color con el indicador principal). Es referencia de aire y composición, no de contenido.
- No hay fotos de estudiantes ni avatares reales: se usan iniciales.

## Product Principles

1. Lo primero que se ve es cuánto se debe y cómo pagarlo; todo lo demás va después.
2. Una sola pregunta por bloque: cada tarjeta responde algo concreto (¿debo?, ¿qué vence?, ¿qué pagué?, ¿qué dijo el colegio?).
3. Holgado antes que denso: pocas cajas compitiendo, mucho aire, tipografía grande para los títulos de sección.
4. El colegio es el protagonista visual; Octopus desaparece.
5. Al alcance del pulgar: la acción de pago y la navegación principal siempre alcanzables en 360px.

## Accessibility & Inclusion

- Objetivos táctiles de al menos 44px; contraste AA sobre el color del colegio (que es variable, así que el texto sobre marca es blanco y los colores de estado no dependen de la marca).
- Respetar `prefers-reduced-motion`.
