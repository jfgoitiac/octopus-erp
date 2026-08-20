import { lazy } from 'react';

/**
 * Catálogo de plantillas de la galería inicial.
 *
 * `bloques` describe la composición que el editor visual debe sembrar al
 * elegir esta plantilla: cada entrada se convierte en una `Seccion` con su
 * `tipo`, `animacion` y `config_estilo`. Las plantillas marcadas
 * `implementada: false` están especificadas en DESIGN_SYSTEM.md y las monta
 * el agente de Renderer público en Fase 2 reutilizando `_kit/bloques.jsx`.
 */
export const PLANTILLAS = [
  {
    id: 'home-umbral',
    nombre: 'Home · Umbral',
    familia: 'Home',
    resumen: 'Entra por la palabra, no por la foto aérea. Titular a la izquierda y un retrato vertical al lado.',
    dials: { variance: 6, motion: 5, density: 3 },
    implementada: true,
    componente: lazy(() => import('./HomeUmbral')),
    bloques: [
      { tipo: 'hero', variante: 'dividido', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'filete', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cards', variante: 'desnudas', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'carrusel', variante: 'ancho', animacion: 'slide-left', config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'testimonios', variante: 'citas', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'cta', variante: 'banda', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' } },
    ],
  },
  {
    id: 'home-patio',
    nombre: 'Home · Patio',
    familia: 'Home',
    resumen: 'Para el colegio cuyo argumento es el lugar. Recorrido fotográfico, cero bloques de texto partido.',
    dials: { variance: 7, motion: 7, density: 3 },
    implementada: true,
    componente: lazy(() => import('./HomePatio')),
    bloques: [
      { tipo: 'hero', variante: 'inmersivo', animacion: 'parallax', config_estilo: { ancho: 'completo', espaciado_top: 'sm', espaciado_bottom: 'sm', fondo: 'transparente' } },
      { tipo: 'cards', variante: 'retrato', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'carrusel', variante: 'ancho', animacion: 'slide-left', config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'galeria', variante: 'mosaico', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'cta', variante: 'sobrefoto', animacion: 'parallax', config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'transparente' } },
    ],
  },
  {
    id: 'home-pizarra',
    nombre: 'Home · Pizarra',
    familia: 'Home',
    resumen: 'Colegio académico sin campus fotogénico. Hero manifiesto sin imagen y dos columnas de argumento.',
    dials: { variance: 5, motion: 4, density: 4 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'desnudas', columnas: 2, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'filete', animacion: 'slide-right', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'testimonios', variante: 'retratos', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'cta', variante: 'discreta', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
    ],
  },
  {
    id: 'nosotros-cronologia',
    nombre: 'Nosotros · Cronología',
    familia: 'Institucional',
    resumen: 'La historia del colegio como línea vertical de hitos con filete de marca, no como muro de párrafos.',
    dials: { variance: 6, motion: 5, density: 4 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'solapado', animacion: 'slide-right', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cards', variante: 'hito', columnas: 1, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'galeria', variante: 'rejilla', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cta', variante: 'banda', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' } },
    ],
  },
  {
    id: 'admisiones-ruta',
    nombre: 'Admisiones · Ruta',
    familia: 'Conversión',
    resumen: 'Una sola pregunta por pantalla: qué sigue. Pasos numerados por contenido, no por etiqueta decorativa.',
    dials: { variance: 5, motion: 5, density: 5 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'dividido', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'pasos', columnas: 4, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'texto_imagen', variante: 'filete', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'testimonios', variante: 'citas', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cta', variante: 'sobrefoto', animacion: 'parallax', config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'transparente' } },
    ],
  },
  {
    id: 'contacto-recepcion',
    nombre: 'Contacto · Recepción',
    familia: 'Conversión',
    resumen: 'Formulario y datos duros arriba del pliegue. La foto del edificio va al fondo, como referencia de llegada.',
    dials: { variance: 4, motion: 3, density: 5 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'contacto', columnas: 3, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'sm', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'formulario', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'galeria', variante: 'rejilla', columnas: 3, animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
    ],
  },
  {
    id: 'articulo-lectura',
    nombre: 'Artículo · Lectura',
    familia: 'Editorial',
    resumen: 'Único typeset serif del sistema. Movimiento bajado a 3 y barra de progreso de lectura.',
    dials: { variance: 4, motion: 3, density: 3 },
    implementada: true,
    componente: lazy(() => import('./ArticuloLectura')),
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'cuerpo', variante: 'lectura', animacion: '', config_estilo: { ancho: 'contenido', espaciado_top: 'sm', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'cta', variante: 'discreta', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'contenidas', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
    ],
  },
  {
    id: 'blog-boletin',
    nombre: 'Noticias · Boletín',
    familia: 'Editorial',
    resumen: 'Una nota destacada a doble ancho y el resto en lista con filetes. Sin tarjetas iguales en rejilla.',
    dials: { variance: 6, motion: 4, density: 5 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'destacada', columnas: 1, animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'sm', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'lista', columnas: 1, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'sm', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'cta', variante: 'discreta', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
    ],
  },
  {
    id: 'eventos-agenda',
    nombre: 'Eventos · Agenda',
    familia: 'Editorial',
    resumen: 'La fecha manda: columna de día y mes a la izquierda, evento a la derecha. Carrusel de lo ya ocurrido.',
    dials: { variance: 5, motion: 5, density: 6 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'dividido', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'agenda', columnas: 1, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'blanco' } },
      { tipo: 'carrusel', variante: 'tarjetas', animacion: 'slide-left', config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cta', variante: 'banda', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' } },
    ],
  },
  {
    id: 'niveles-escalera',
    nombre: 'Niveles · Escalera',
    familia: 'Institucional',
    resumen: 'Preescolar, primaria y bachillerato como tres tramos que se alternan de lado, con foto vertical por tramo.',
    dials: { variance: 7, motion: 6, density: 4 },
    implementada: false,
    bloques: [
      { tipo: 'hero', variante: 'inmersivo', animacion: 'parallax', config_estilo: { ancho: 'completo', espaciado_top: 'sm', espaciado_bottom: 'sm', fondo: 'transparente' } },
      { tipo: 'texto_imagen', variante: 'solapado', animacion: 'slide-right', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'solapado', animacion: 'slide-left', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'galeria', variante: 'mosaico', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cta', variante: 'banda', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' } },
    ],
  },
];

export function plantillaPorId(id) {
  return PLANTILLAS.find((p) => p.id === id) || null;
}
