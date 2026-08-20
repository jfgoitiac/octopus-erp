/**
 * Catálogo de plantillas para "Crear página" (CrearPaginaModal).
 *
 * Portado desde `octopus-sitio/src/templates/index.js` (galería de diseño de
 * Fase 1 — `id`, `nombre`, `familia`, `resumen` y composición `bloques` se
 * mantienen idénticos a esa fuente para que la elección visual y el render
 * público coincidan). La diferencia: acá cada entrada de bloque se expande a
 * un `contenido` completo (vía `contenidoPorDefecto`) porque este catálogo
 * sirve para crear `Seccion`es reales, no solo para describir un layout.
 *
 * La plantilla `articulo-lectura` del catálogo original queda fuera: usa un
 * bloque `tipo: 'cuerpo'` que no existe en `Seccion.TIPO_CHOICES` (es diseño
 * para el detalle de un `Articulo`, un modelo distinto a `Pagina`).
 */
import { contenidoPorDefecto } from './EditorVisual/bloques/utils';

// Imagen de relleno determinística (mismo seed → misma foto siempre, para
// que el mockup no "parpadee" entre renders) — sirve solo para que la
// galería de plantillas se vea poblada con fotos reales en vez de cuadros
// grises de "sin imagen"; el colegio las reemplaza por las suyas al editar.
// `resolverImagenUrl`/`urlVariante` (bloques/utils.js y octopus-sitio/lib/media.js)
// aceptan tanto un string URL como el objeto `{variantes}` que devuelve una
// `Media` real del backend, así que no hace falta subir nada a la biblioteca.
const imagenDemo = (semilla, ancho = 1200, alto = 800) => `https://picsum.photos/seed/${semilla}/${ancho}/${alto}`;

const NOMBRES_DEMO = ['María González', 'Carlos Pérez', 'Andrea Ruiz', 'Diego Martínez', 'Valentina López', 'Sofía Hernández'];
const CARGOS_DEMO = ['Representante', 'Egresado', 'Madre de familia', 'Padre de familia', 'Docente'];

/** Contenido de ejemplo (texto genérico + fotos demo) para que cada bloque de una plantilla se vea compuesto, no vacío. */
const contenidoDemoPorTipo = (tipo, semilla) => {
  const base = contenidoPorDefecto(tipo);
  switch (tipo) {
    case 'hero':
      return { ...base, imagen_fondo: imagenDemo(`${semilla}-hero`, 1600, 1200) };
    case 'texto_imagen':
      return { ...base, imagen: imagenDemo(`${semilla}-txt`, 900, 700) };
    case 'galeria':
      return {
        ...base,
        imagenes: Array.from({ length: 6 }, (_, i) => ({ media_id: imagenDemo(`${semilla}-gal${i}`, 700, 700), caption: '' })),
      };
    case 'cards':
      return {
        ...base,
        items: Array.from({ length: 3 }, (_, i) => ({
          imagen: imagenDemo(`${semilla}-card${i}`, 700, 500),
          titulo: `Elemento ${i + 1}`,
          texto: 'Texto breve de ejemplo para esta tarjeta.',
        })),
      };
    case 'testimonios':
      return {
        ...base,
        items: Array.from({ length: 2 }, (_, i) => ({
          foto: imagenDemo(`${semilla}-persona${i}`, 200, 200),
          texto: 'Un testimonio de ejemplo sobre la experiencia en el colegio.',
          nombre: NOMBRES_DEMO[(i + semilla.length) % NOMBRES_DEMO.length],
          cargo: CARGOS_DEMO[(i + semilla.length) % CARGOS_DEMO.length],
        })),
      };
    case 'carrusel':
      return {
        ...base,
        slides: Array.from({ length: 4 }, (_, i) => ({ imagen: imagenDemo(`${semilla}-slide${i}`, 1400, 800), titulo: '', texto: '' })),
      };
    case 'cta':
      return { ...base, titulo: 'Conocé el colegio', texto: 'Agendá una visita guiada.', boton_texto: 'Escribinos', fondo: imagenDemo(`${semilla}-cta`, 1600, 700) };
    default:
      return base;
  }
};

const construirSecciones = (bloques, plantillaId, plantillaResumen) =>
  bloques.map(({ tipo, variante, columnas, animacion, config_estilo }, i) => ({
    tipo,
    contenido: {
      ...contenidoDemoPorTipo(tipo, `${plantillaId}-${i}`),
      // El primer hero de cada plantilla usa el resumen real de la
      // plantilla como subtítulo (ya escrito y curado) en vez del genérico
      // "Subtítulo del bloque" — así el mockup transmite la propuesta real
      // de cada diseño, no un placeholder vacío de sentido.
      ...(tipo === 'hero' && i === 0 ? { subtitulo: plantillaResumen } : {}),
      variante,
      ...(columnas != null ? { columnas } : {}),
    },
    animacion: animacion || '',
    config_estilo,
  }));

const DEFINICIONES = [
  {
    id: 'home-umbral',
    nombre: 'Home · Umbral',
    familia: 'Home',
    resumen: 'Entra por la palabra, no por la foto aérea. Titular a la izquierda y un retrato vertical al lado.',
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
    bloques: [
      { tipo: 'hero', variante: 'editorial', animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'sm', fondo: 'blanco' } },
      { tipo: 'cards', variante: 'contacto', columnas: 3, animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'sm', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'formulario', animacion: 'scroll-reveal', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'galeria', variante: 'rejilla', columnas: 3, animacion: 'fade-in', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
    ],
  },
  {
    id: 'blog-boletin',
    nombre: 'Noticias · Boletín',
    familia: 'Editorial',
    resumen: 'Una nota destacada a doble ancho y el resto en lista con filetes. Sin tarjetas iguales en rejilla.',
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
    bloques: [
      { tipo: 'hero', variante: 'inmersivo', animacion: 'parallax', config_estilo: { ancho: 'completo', espaciado_top: 'sm', espaciado_bottom: 'sm', fondo: 'transparente' } },
      { tipo: 'texto_imagen', variante: 'solapado', animacion: 'slide-right', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'texto_imagen', variante: 'solapado', animacion: 'slide-left', config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' } },
      { tipo: 'galeria', variante: 'mosaico', animacion: 'stagger', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'gris' } },
      { tipo: 'cta', variante: 'banda', animacion: 'slide-up', config_estilo: { ancho: 'contenido', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' } },
    ],
  },
];

export const PLANTILLAS = DEFINICIONES.map((def) => ({
  id: def.id,
  nombre: def.nombre,
  familia: def.familia,
  resumen: def.resumen,
  tipos: [...new Set(def.bloques.map((b) => b.tipo))],
  secciones: construirSecciones(def.bloques, def.id, def.resumen),
}));
