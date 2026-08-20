// Datos mock que respetan EXACTAMENTE la forma de los endpoints públicos
// documentados en SITIO_CONTRATO_API.md (sección 3 y 4). El backend real
// (agente en paralelo) expone las mismas rutas y shapes — cuando esté listo,
// solo hay que reemplazar el cuerpo de las funciones en `sitio.service.js`
// por llamadas a `sitioClient`, sin tocar componentes ni páginas.

export const MOCK_CONFIGURACION = {
  logo: 'https://placehold.co/240x80?text=Logo',
  favicon: 'https://placehold.co/64x64?text=F',
  color_primario: '#0fa3b1',
  color_secundario: '#2b303a',
  color_acento: '#fbbf24',
  redes_sociales: {
    facebook: 'https://facebook.com/micolegio',
    instagram: 'https://instagram.com/micolegio',
    twitter: '',
    youtube: '',
    tiktok: '',
  },
  seo_titulo_default: 'Colegio Ejemplo — Educación con propósito',
  seo_descripcion_default: 'Institución educativa comprometida con la excelencia académica y la formación integral de nuestros estudiantes.',
  telefono_contacto: '+58 212 555 0000',
  email_contacto: 'info@micolegio.edu.ve',
  direccion: 'Av. Principal, Caracas, Venezuela',
};

const MEDIA_HERO = 12;
const MEDIA_MAP = {
  12: { thumb: 'https://placehold.co/200x120', sm: 'https://placehold.co/480x280', md: 'https://placehold.co/960x560', lg: 'https://placehold.co/1600x900', original: 'https://placehold.co/1920x1080' },
  13: { thumb: 'https://placehold.co/200x200', sm: 'https://placehold.co/480x480', md: 'https://placehold.co/960x960', lg: 'https://placehold.co/1600x1600', original: 'https://placehold.co/1920x1920' },
  14: { thumb: 'https://placehold.co/200x150', sm: 'https://placehold.co/480x360', md: 'https://placehold.co/960x720', lg: 'https://placehold.co/1600x1200', original: 'https://placehold.co/1920x1440' },
};

// El serializer real expande `imagen`/`foto`/etc (ids) a sus `variantes` al leer.
// Los mocks ya vienen expandidos para simular esa respuesta.
export const MOCK_MENUS = {
  principal: {
    nombre: 'principal',
    items: [
      { etiqueta: 'Inicio', tipo_destino: 'pagina', pagina: { slug: 'home' }, url_externa: '', orden: 1, abre_nueva_pestana: false },
      { etiqueta: 'Nosotros', tipo_destino: 'pagina', pagina: { slug: 'nosotros' }, url_externa: '', orden: 2, abre_nueva_pestana: false },
      { etiqueta: 'Admisiones', tipo_destino: 'pagina', pagina: { slug: 'admisiones' }, url_externa: '', orden: 3, abre_nueva_pestana: false },
      { etiqueta: 'Artículos', tipo_destino: 'url_externa', pagina: null, url_externa: '/articulos', orden: 4, abre_nueva_pestana: false },
      { etiqueta: 'Contacto', tipo_destino: 'pagina', pagina: { slug: 'contacto' }, url_externa: '', orden: 5, abre_nueva_pestana: false },
    ],
  },
  footer: {
    nombre: 'footer',
    items: [
      { etiqueta: 'Nosotros', tipo_destino: 'pagina', pagina: { slug: 'nosotros' }, url_externa: '', orden: 1, abre_nueva_pestana: false },
      { etiqueta: 'Admisiones', tipo_destino: 'pagina', pagina: { slug: 'admisiones' }, url_externa: '', orden: 2, abre_nueva_pestana: false },
      { etiqueta: 'Contacto', tipo_destino: 'pagina', pagina: { slug: 'contacto' }, url_externa: '', orden: 3, abre_nueva_pestana: false },
    ],
  },
};

const seccionesHome = [
  {
    id: 1,
    tipo: 'hero',
    orden: 1,
    animacion: 'fade-in',
    config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'transparente' },
    contenido: {
      titulo: 'Educación con propósito',
      subtitulo: 'Formamos estudiantes íntegros, curiosos y preparados para el mundo.',
      imagen_fondo: { id: MEDIA_HERO, ...MEDIA_MAP[12] },
      cta_texto: 'Conoce nuestras admisiones',
      cta_url: '/admisiones',
      overlay: 'oscuro',
    },
  },
  {
    id: 2,
    tipo: 'texto_imagen',
    orden: 2,
    animacion: 'slide-up',
    config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' },
    contenido: {
      titulo: 'Nuestra misión',
      texto: '<p>Acompañamos a cada estudiante en su desarrollo académico, emocional y social, con un cuerpo docente comprometido y una infraestructura pensada para aprender.</p>',
      imagen: { id: 13, ...MEDIA_MAP[13] },
      posicion_imagen: 'derecha',
      cta_texto: 'Conoce más',
      cta_url: '/nosotros',
    },
  },
  {
    id: 3,
    tipo: 'cards',
    orden: 3,
    animacion: 'stagger',
    config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'gris' },
    contenido: {
      titulo: '¿Por qué elegirnos?',
      items: [
        { icono: 'GraduationCap', imagen: null, titulo: 'Excelencia académica', texto: 'Programas alineados a estándares internacionales.', url: '' },
        { icono: 'Users', imagen: null, titulo: 'Comunidad', texto: 'Un entorno cercano y colaborativo.', url: '' },
        { icono: 'Sparkles', imagen: null, titulo: 'Formación integral', texto: 'Arte, deporte y valores como pilares.', url: '' },
      ],
      columnas: 3,
    },
  },
  {
    id: 4,
    tipo: 'testimonios',
    orden: 4,
    animacion: 'scroll-reveal',
    config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' },
    contenido: {
      titulo: 'Lo que dicen nuestras familias',
      items: [
        { nombre: 'María Pérez', cargo: 'Representante', foto: { id: 14, ...MEDIA_MAP[14] }, texto: 'El acompañamiento del colegio con mis hijos ha sido excepcional.' },
        { nombre: 'Carlos Gómez', cargo: 'Representante', foto: null, texto: 'Un equipo docente comprometido y siempre disponible.' },
      ],
    },
  },
  {
    id: 5,
    tipo: 'cta',
    orden: 5,
    animacion: 'zoom-on-scroll',
    config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'primario' },
    contenido: {
      titulo: '¿Listo para formar parte de nuestra comunidad?',
      texto: 'Inicia el proceso de admisión hoy mismo.',
      boton_texto: 'Comenzar preinscripción',
      boton_url: '/admisiones',
      fondo: null,
    },
  },
];

const seccionesNosotros = [
  {
    id: 6,
    tipo: 'hero',
    orden: 1,
    animacion: 'fade-in',
    config_estilo: { ancho: 'completo', espaciado_top: 'lg', espaciado_bottom: 'lg', fondo: 'transparente' },
    contenido: {
      titulo: 'Nosotros',
      subtitulo: 'Más de 20 años formando líderes.',
      imagen_fondo: { id: 13, ...MEDIA_MAP[13] },
      cta_texto: '',
      cta_url: '',
      overlay: 'oscuro',
    },
  },
  {
    id: 7,
    tipo: 'galeria',
    orden: 2,
    animacion: 'stagger',
    config_estilo: { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' },
    contenido: {
      titulo: 'Nuestras instalaciones',
      imagenes: [
        { media_id: 12, media: { id: 12, ...MEDIA_MAP[12] }, caption: 'Biblioteca' },
        { media_id: 13, media: { id: 13, ...MEDIA_MAP[13] }, caption: 'Laboratorio' },
        { media_id: 14, media: { id: 14, ...MEDIA_MAP[14] }, caption: 'Cancha deportiva' },
      ],
      columnas: 3,
    },
  },
  {
    id: 8,
    tipo: 'carrusel',
    orden: 3,
    animacion: '',
    config_estilo: { ancho: 'completo', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'gris' },
    contenido: {
      slides: [
        { imagen: { id: 12, ...MEDIA_MAP[12] }, titulo: 'Eventos culturales', texto: 'Celebramos nuestra identidad todo el año.' },
        { imagen: { id: 13, ...MEDIA_MAP[13] }, titulo: 'Actividades deportivas', texto: 'Fomentamos el trabajo en equipo.' },
      ],
      autoplay: true,
      intervalo_ms: 5000,
    },
  },
];

export const MOCK_PAGINAS = {
  home: {
    id: 1,
    titulo: 'Inicio',
    slug: 'home',
    estado: 'publicado',
    es_home: true,
    seo_titulo: '',
    seo_descripcion: '',
    publicado_en: '2026-01-05T10:00:00Z',
    secciones: seccionesHome,
  },
  nosotros: {
    id: 2,
    titulo: 'Nosotros',
    slug: 'nosotros',
    estado: 'publicado',
    es_home: false,
    seo_titulo: 'Nosotros — Colegio Ejemplo',
    seo_descripcion: 'Conoce nuestra historia, misión e instalaciones.',
    publicado_en: '2026-01-05T10:00:00Z',
    secciones: seccionesNosotros,
  },
};

export const MOCK_CATEGORIAS = [
  { id: 1, nombre: 'Noticias', slug: 'noticias' },
  { id: 2, nombre: 'Eventos', slug: 'eventos' },
  { id: 3, nombre: 'Admisiones', slug: 'admisiones' },
];

const generarArticulos = () =>
  Array.from({ length: 14 }).map((_, i) => ({
    id: i + 1,
    titulo: `Artículo institucional #${i + 1}`,
    slug: `articulo-institucional-${i + 1}`,
    resumen: 'Resumen breve del artículo para la tarjeta del listado, pensado para dar contexto rápido al lector.',
    imagen_destacada: { id: 12, ...MEDIA_MAP[12] },
    categoria: MOCK_CATEGORIAS[i % MOCK_CATEGORIAS.length],
    autor: { id: 1, nombre: 'Equipo de Comunicaciones' },
    vistas: 10 * (i + 1),
    publicado_en: `2026-0${(i % 6) + 1}-1${i % 9}T12:00:00Z`,
  }));

export const MOCK_ARTICULOS = generarArticulos();

export const MOCK_ARTICULO_DETALLE = (slug) => {
  const base = MOCK_ARTICULOS.find((a) => a.slug === slug) ?? MOCK_ARTICULOS[0];
  return {
    ...base,
    cuerpo: `<p>Contenido completo del artículo <strong>${base.titulo}</strong>. Este cuerpo HTML viene sanitizado desde el backend (Tiptap + bleach).</p><p>Segundo párrafo de ejemplo con más contexto institucional.</p>`,
    seo_titulo: '',
    seo_descripcion: '',
  };
};
