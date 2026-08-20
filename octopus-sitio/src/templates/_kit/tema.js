/**
 * Aplica los colores de ConfiguracionSitio al árbol de tokens CSS.
 *
 * El problema real de un CMS multi-colegio: el hex de marca es arbitrario.
 * Un colegio carga #f2c94c (amarillo claro) y otro #101820 (casi negro), y
 * ambos tienen que producir botones legibles sin que nadie edite CSS.
 * Se resuelve calculando luminancia relativa y eligiendo tinta o papel
 * para el texto que va ENCIMA de cada relleno de marca.
 */

const HEX = /^#?([a-f\d]{3}|[a-f\d]{6})$/i;

function aRgb(hex) {
  if (!hex || !HEX.test(hex)) return null;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Luminancia relativa WCAG 2.1 */
export function luminancia(hex) {
  const rgb = aRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(hexA, hexB) {
  const a = luminancia(hexA);
  const b = luminancia(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Devuelve el color de texto que cumple mejor AA sobre `fondo`.
 * Se prefiere la tinta cálida antes que el negro puro (ver DESIGN_SYSTEM 2.2).
 */
export function textoSobre(fondo) {
  const conTinta = contraste(fondo, '#191817');
  const conPapel = contraste(fondo, '#fbfaf8');
  return conTinta >= conPapel ? '#191817' : '#fbfaf8';
}

/** Fondo/texto/borde de una superficie (menú o footer) según su `estilo_*`. */
function tokensSuperficie(estilo, primario) {
  switch (estilo) {
    case 'oscuro':
      return { bg: '#15140f', texto: '#f6f4f0', borde: 'rgba(255,255,255,0.10)' };
    case 'marca':
      return { bg: primario, texto: textoSobre(primario), borde: 'rgba(255,255,255,0.15)' };
    case 'transparente':
      return { bg: 'transparent', texto: '#ffffff', borde: 'transparent' };
    case 'claro':
    default:
      return { bg: '#fbfaf8', texto: '#191817', borde: 'rgba(25,24,23,0.10)' };
  }
}

const RADIO_BOTON = {
  pildora: '999px',
  redondeado: '10px',
  cuadrado: '4px',
};

/** Pares de fuente (display/texto) + hoja de Google Fonts a cargar por preset. */
const TIPOGRAFIAS = {
  moderna: {
    display: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    texto: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    fontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  },
  editorial: {
    display: "'Fraunces', Georgia, 'Iowan Old Style', serif",
    texto: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    fontsUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap',
  },
  clasica: {
    display: "'Lora', Georgia, 'Iowan Old Style', serif",
    texto: "'Lora', Georgia, 'Iowan Old Style', serif",
    fontsUrl: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  },
};

/** Inyecta/actualiza el <link> de Google Fonts para el preset de tipografía elegido. */
function cargarFuentes(tipografia) {
  if (typeof document === 'undefined') return TIPOGRAFIAS.moderna;
  const preset = TIPOGRAFIAS[tipografia] || TIPOGRAFIAS.moderna;
  let link = document.getElementById('site-fonts');
  if (!link) {
    link = document.createElement('link');
    link.id = 'site-fonts';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== preset.fontsUrl) link.href = preset.fontsUrl;
  return preset;
}

/**
 * @param {{
 *   color_primario?:string, color_secundario?:string, color_acento?:string,
 *   estilo_menu?:string, menu_fijo?:boolean, alineacion_menu?:string,
 *   estilo_footer?:string, estilo_botones?:string, tipografia?:string,
 * }} config
 * @param {HTMLElement} [raiz]
 */
export function aplicarTemaColegio(config = {}, raiz) {
  const el = raiz || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;

  const primario = HEX.test(config.color_primario || '') ? config.color_primario : '#1f4d3d';
  const secundario = HEX.test(config.color_secundario || '') ? config.color_secundario : '#8a6a3b';
  const acento = HEX.test(config.color_acento || '') ? config.color_acento : '#b3432f';

  el.style.setProperty('--marca-primario', primario);
  el.style.setProperty('--marca-secundario', secundario);
  el.style.setProperty('--marca-acento', acento);
  el.style.setProperty('--marca-primario-texto', textoSobre(primario));
  el.style.setProperty('--marca-acento-texto', textoSobre(acento));

  const menu = tokensSuperficie(config.estilo_menu || 'claro', primario);
  el.style.setProperty('--menu-bg', menu.bg);
  el.style.setProperty('--menu-texto', menu.texto);
  el.style.setProperty('--menu-borde', menu.borde);

  const footer = tokensSuperficie(config.estilo_footer || 'claro', primario);
  el.style.setProperty('--footer-bg', footer.bg);
  el.style.setProperty('--footer-texto', footer.texto);
  el.style.setProperty('--footer-borde', footer.borde);

  el.style.setProperty('--radio-interactivo', RADIO_BOTON[config.estilo_botones] || RADIO_BOTON.pildora);

  const fuentes = cargarFuentes(config.tipografia);
  el.style.setProperty('--fuente-display', fuentes.display);
  el.style.setProperty('--fuente-texto', fuentes.texto);

  el.dataset.menuFijo = config.menu_fijo === false ? 'no' : 'si';
  el.dataset.menuAlineacion = config.alineacion_menu === 'centro' ? 'centro' : 'izquierda';
}

/** Paletas de demo para probar que las plantillas aguantan cualquier marca. */
export const PALETAS_DEMO = [
  { nombre: 'Monteverde', color_primario: '#1f4d3d', color_secundario: '#8a6a3b', color_acento: '#b3432f' },
  { nombre: 'San Ignacio', color_primario: '#123a6b', color_secundario: '#5c6b7a', color_acento: '#c8551f' },
  { nombre: 'Los Nogales', color_primario: '#7a1f2b', color_secundario: '#3f3a35', color_acento: '#0f7a63' },
  { nombre: 'Altamira', color_primario: '#f2c94c', color_secundario: '#2c2a26', color_acento: '#1c6ea4' },
];
