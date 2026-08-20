/**
 * Datos de demostración para la galería de plantillas.
 * Respetan EXACTAMENTE la forma de `Seccion.contenido` del contrato (§4),
 * con la única diferencia de que los ids de Media ya vienen expandidos a
 * `{thumb, sm, md, lg, alt_text}` tal como los devuelve el serializer público.
 *
 * Las fotos son placeholders con semilla descriptiva; al conectar el backend
 * real se reemplazan por las variantes WebP de la biblioteca de Media.
 */

const foto = (semilla, w = 1600, h = 1200, alt = '') => ({
  thumb: `https://picsum.photos/seed/${semilla}/200/${Math.round((200 * h) / w)}`,
  sm: `https://picsum.photos/seed/${semilla}/480/${Math.round((480 * h) / w)}`,
  md: `https://picsum.photos/seed/${semilla}/960/${Math.round((960 * h) / w)}`,
  lg: `https://picsum.photos/seed/${semilla}/1600/${Math.round((1600 * h) / w)}`,
  alt_text: alt,
});

export const COLEGIO = {
  nombre: 'Colegio Monteverde',
  sigla: 'CM',
  lema: 'Educación bilingüe en Valencia desde 1974. Preescolar, primaria y bachillerato.',
  direccion: 'Av. Carabobo con Calle Páez, Valencia',
  telefono: '+58 241 823 4417',
  email: 'admisiones@monteverde.edu.ve',
};

export const MENU_PRINCIPAL = [
  { etiqueta: 'Nosotros', url: '/nosotros' },
  { etiqueta: 'Niveles', url: '/niveles' },
  { etiqueta: 'Admisiones', url: '/admisiones' },
  { etiqueta: 'Noticias', url: '/articulos' },
  { etiqueta: 'Contacto', url: '/contacto' },
];

export const CTA_NAV = { etiqueta: 'Agendar visita', url: '/admisiones' };

export const COLUMNAS_FOOTER = [
  { titulo: 'El colegio', items: ['Nuestra historia', 'Proyecto educativo', 'Equipo docente', 'Instalaciones'] },
  { titulo: 'Familias', items: ['Portal de representantes', 'Calendario escolar', 'Uniformes', 'Transporte'] },
];

/* ------------------------- Contenido por bloque ------------------------- */

export const HERO_UMBRAL = {
  titulo: 'Un colegio que se recorre caminando',
  subtitulo:
    'Cuatro hectáreas de campus en Valencia, con grupos de 22 estudiantes y un docente que conoce a cada uno por su nombre.',
  imagen_fondo: foto('monteverde-patio-central', 1200, 1500, 'Estudiantes cruzando el patio central'),
  cta_texto: 'Conocer el campus',
  cta_url: '/admisiones',
  overlay: 'ninguno',
};

export const HERO_PATIO = {
  titulo: 'Aquí el aula también está afuera',
  subtitulo: 'Huerto, taller de madera, cancha techada y biblioteca abierta hasta las seis de la tarde.',
  imagen_fondo: foto('monteverde-campus-aereo', 1600, 1000, 'Vista aérea del campus'),
  cta_texto: 'Ver el recorrido',
  cta_url: '/niveles',
  overlay: 'oscuro',
};

export const TEXTO_IMAGEN_PROYECTO = {
  titulo: 'Cincuenta años enseñando a leer despacio',
  texto:
    '<p>Monteverde abrió en 1974 con dos salones y once estudiantes. La apuesta no ha cambiado: grupos pequeños, lectura diaria en voz alta y un tercer idioma desde cuarto grado.</p><p>Hoy son <strong>640 estudiantes</strong> y 58 docentes, y la biblioteca sigue siendo el edificio más grande del campus.</p>',
  imagen: foto('monteverde-biblioteca', 1200, 900, 'Biblioteca del colegio'),
  posicion_imagen: 'derecha',
  cta_texto: 'Leer el proyecto educativo',
  cta_url: '/nosotros',
};

export const CARDS_PILARES = {
  titulo: 'Lo que sostiene el día a día',
  items: [
    {
      icono: 'BookOpen',
      titulo: 'Lectura diaria',
      texto: 'Cuarenta minutos de lectura acompañada, todos los días, de preescolar a quinto año.',
    },
    {
      icono: 'Users',
      titulo: 'Grupos de 22',
      texto: 'Ninguna sección pasa de 22 estudiantes. Es la razón por la que no abrimos más secciones.',
    },
    {
      icono: 'Sprout',
      titulo: 'Huerto y taller',
      texto: 'Dos horas semanales de trabajo manual y cultivo desde tercer grado.',
    },
  ],
  columnas: 3,
};

export const CARDS_NIVELES = {
  titulo: 'Tres etapas, un mismo campus',
  items: [
    {
      titulo: 'Preescolar',
      texto: 'De 3 a 5 años. Juego dirigido, motricidad y primer contacto con el inglés oral.',
      imagen: foto('monteverde-preescolar', 900, 1200, 'Aula de preescolar'),
    },
    {
      titulo: 'Primaria',
      texto: 'De 1ro a 6to. Lectura diaria, huerto, taller de madera y proyecto anual por grado.',
      imagen: foto('monteverde-primaria', 900, 1200, 'Estudiantes de primaria'),
    },
    {
      titulo: 'Bachillerato',
      texto: 'De 1ro a 5to año. Tres idiomas, laboratorio propio y tutoría de proyecto de vida.',
      imagen: foto('monteverde-bachillerato', 900, 1200, 'Laboratorio de bachillerato'),
    },
  ],
  columnas: 3,
};

export const GALERIA_CAMPUS = {
  titulo: 'El campus, sin retoques',
  imagenes: [
    { media: foto('monteverde-cancha-techada', 1200, 1200), caption: 'Cancha techada' },
    { media: foto('monteverde-huerto', 1200, 900), caption: 'Huerto escolar' },
    { media: foto('monteverde-taller-madera', 1200, 900), caption: 'Taller de madera' },
    { media: foto('monteverde-comedor', 1200, 900), caption: 'Comedor' },
    { media: foto('monteverde-laboratorio', 1200, 900), caption: 'Laboratorio' },
  ],
  columnas: 3,
};

export const CARRUSEL_VIDA = {
  slides: [
    {
      imagen: foto('monteverde-feria-ciencias', 1600, 1000),
      titulo: 'Feria de ciencias',
      texto: 'Cada noviembre, quinto año presenta sus proyectos a las familias.',
    },
    {
      imagen: foto('monteverde-coro', 1600, 1000),
      titulo: 'Coro y orquesta',
      texto: 'Ciento veinte estudiantes en el ensamble de cuerdas y voces.',
    },
    {
      imagen: foto('monteverde-juegos-deportivos', 1600, 1000),
      titulo: 'Juegos internos',
      texto: 'Dos semanas de competencia entre casas, con arbitraje de bachillerato.',
    },
    {
      imagen: foto('monteverde-teatro', 1600, 1000),
      titulo: 'Montaje anual',
      texto: 'Obra completa producida por estudiantes, del guion a la iluminación.',
    },
  ],
  autoplay: false,
  intervalo_ms: 5000,
};

export const TESTIMONIOS_FAMILIAS = {
  titulo: 'Lo que dicen las familias',
  items: [
    {
      nombre: 'Mariana Estévez',
      cargo: 'representante, dos hijas en primaria',
      foto: foto('retrato-mariana-estevez', 400, 400),
      texto:
        'Cambiamos de colegio buscando grupos más pequeños. A las tres semanas la maestra ya sabía en qué se traba mi hija leyendo.',
    },
    {
      nombre: 'Rodrigo Villalba',
      cargo: 'egresado 2009',
      foto: foto('retrato-rodrigo-villalba', 400, 400),
      texto:
        'El taller de madera me enseñó a medir dos veces antes de cortar. Sigo trabajando así, quince años después.',
    },
  ],
};

export const CTA_ADMISIONES = {
  titulo: 'Las inscripciones para 2026 abren en octubre',
  texto: 'Agende una visita guiada con la coordinadora de admisiones. Se hacen martes y jueves, de 8 a 11 de la mañana.',
  boton_texto: 'Agendar visita',
  boton_url: '/admisiones',
  fondo: foto('monteverde-entrada-principal', 1600, 900),
};

/* ------------------------------ Artículo ------------------------------ */

export const ARTICULO = {
  titulo: 'Por qué dejamos de mandar tareas los fines de semana',
  resumen:
    'Tres años de datos de nuestra coordinación pedagógica, y una decisión que tomó más tiempo discutir que aplicar.',
  categoria: { nombre: 'Pedagogía', slug: 'pedagogia' },
  autor: 'Isabel Nucete, coordinadora pedagógica',
  publicado_en: '2026-07-28',
  lectura_min: 6,
  imagen_destacada: foto('articulo-tareas-fin-de-semana', 1600, 900, 'Cuadernos sobre una mesa de trabajo'),
  cuerpo: `
    <p class="lead">En marzo de 2023 la coordinación pedagógica empezó a registrar algo que las maestras venían diciendo en cada consejo: los lunes se perdían. No en sentido figurado. Se perdían de verdad, entre la revisión de lo que se mandó el viernes y el reacomodo del grupo.</p>
    <p>Durante tres trimestres medimos dos cosas simples. Cuántos minutos de la primera hora del lunes se iban en revisar tarea de fin de semana, y qué proporción de los estudiantes la entregaba completa. Los números no eran dramáticos, pero eran consistentes.</p>
    <h2>Lo que encontramos</h2>
    <p>El promedio fue de veintiséis minutos por sección, con un pico de cuarenta en cuarto grado. La entrega completa rondó el 61 por ciento en primaria y bajó a 48 en bachillerato. Lo interesante no fue el promedio sino la varianza: en los grupos donde la tarea era de lectura libre, la entrega subía; donde era ejercitación repetitiva, se hundía.</p>
    <blockquote>La tarea de fin de semana no estaba enseñando. Estaba midiendo qué tan organizada es la casa de cada estudiante.</blockquote>
    <p>Esa frase, de una maestra de tercer grado en el consejo de junio, fue la que terminó de mover la discusión. Porque una escuela puede pedir esfuerzo, pero no puede pedir condiciones de casa que no todas las familias tienen.</p>
    <h2>Qué cambió en la práctica</h2>
    <p>Desde enero, de viernes a lunes no se asigna trabajo escrito en ningún nivel. Lo que sí se mantiene es la lectura: veinte minutos diarios, del libro que el estudiante escoja, sin reporte ni ficha de comprensión. Esa fue la parte que más costó acordar, porque la tentación de pedir evidencia es fuerte.</p>
    <p>El trabajo escrito se redistribuyó de martes a jueves, con un techo de cuarenta minutos totales por día para todas las materias juntas. Los jefes de departamento coordinan ese techo en una reunión semanal de quince minutos.</p>
    <h2>Los primeros seis meses</h2>
    <p>La primera hora del lunes recuperó unos veinte minutos útiles por sección. La entrega de trabajo de martes a jueves subió a 84 por ciento en primaria. No tenemos aún datos limpios de rendimiento, y no los vamos a inventar: eso se mide al cierre del año escolar.</p>
    <p>Lo que sí podemos decir es que ninguna maestra ha pedido volver al esquema anterior.</p>
  `,
};

export const ARTICULOS_RELACIONADOS = {
  titulo: 'Seguir leyendo',
  items: [
    {
      titulo: 'El huerto no es una materia, es una hora de silencio',
      texto: 'Cómo se organiza el trabajo de campo en primaria y qué pasa cuando llueve.',
      imagen: foto('articulo-huerto-escolar', 1200, 900),
      url: '/articulos/huerto-escolar',
    },
    {
      titulo: 'Qué preguntamos en la entrevista de admisión',
      texto: 'Las cinco preguntas que hacemos a las familias, y por qué ninguna es sobre notas.',
      imagen: foto('articulo-entrevista-admision', 1200, 900),
      url: '/articulos/entrevista-admision',
    },
    {
      titulo: 'Cincuenta años del primer salón',
      texto: 'La casa de la calle Páez donde empezó todo, contada por quienes estuvieron.',
      imagen: foto('articulo-aniversario', 1200, 900),
      url: '/articulos/cincuenta-anos',
    },
  ],
  columnas: 3,
};

export const CTA_BOLETIN = {
  titulo: 'El boletín de Monteverde',
  texto: 'Una nota al mes de la coordinación pedagógica. Sin circulares ni recordatorios de pago.',
  boton_texto: 'Suscribirme',
  boton_url: '/boletin',
};
