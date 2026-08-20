import {
  BloqueHero, BloqueTextoImagen, BloqueGaleria, BloqueCards, BloqueCta, BloqueTestimonios, BloqueCarrusel,
} from '../../templates/_kit/bloques';

// Requisitos mínimos por tipo para considerar el `contenido` válido —
// suficiente para evitar romper el render (contrato §4: "fallback silencioso").
// Validación completa de schema queda del lado del backend/admin.
const REQUISITOS = {
  hero: (c) => typeof c?.titulo === 'string',
  texto_imagen: (c) => typeof c?.titulo === 'string' || typeof c?.texto === 'string',
  galeria: (c) => Array.isArray(c?.imagenes),
  cards: (c) => Array.isArray(c?.items),
  cta: (c) => typeof c?.titulo === 'string' || typeof c?.boton_texto === 'string',
  testimonios: (c) => Array.isArray(c?.items),
  carrusel: (c) => Array.isArray(c?.slides),
};

const COMPONENTES = {
  hero: BloqueHero,
  texto_imagen: BloqueTextoImagen,
  galeria: BloqueGaleria,
  cards: BloqueCards,
  cta: BloqueCta,
  testimonios: BloqueTestimonios,
  carrusel: BloqueCarrusel,
};

/**
 * Adapta `Seccion.config_estilo` (snake_case, contrato §1) a las props que
 * espera el primitivo `<Seccion>` de `templates/_kit/primitivos.jsx`
 * (camelCase). `ancho`/`fondo` coinciden en nombre, solo cambia el caso de
 * los espaciados.
 */
const configEstiloAProps = (configEstilo = {}) => ({
  ancho: configEstilo.ancho,
  fondo: configEstilo.fondo,
  espaciadoTop: configEstilo.espaciado_top,
  espaciadoBottom: configEstilo.espaciado_bottom,
});

/**
 * Switch por `Seccion.tipo` con fallback silencioso: si el tipo es
 * desconocido o el `contenido` no matchea el schema mínimo esperado, no
 * renderiza nada (y avisa por consola en dev) — la página sigue completa.
 *
 * Despacha a los bloques animados de `templates/_kit/bloques.jsx` (Framer
 * Motion + variantes visuales). `contenido.variante` (opcional, ver
 * contrato §4) decide la composición; si falta, cada `Bloque*` usa su
 * propio valor por defecto.
 */
const RenderSeccion = ({ seccion }) => {
  const { tipo, contenido, animacion, config_estilo: configEstilo } = seccion ?? {};
  const Componente = COMPONENTES[tipo];
  const esValido = REQUISITOS[tipo]?.(contenido);

  if (!Componente || !esValido) {
    if (import.meta.env.DEV) {
      console.warn(`[RenderSeccion] Sección omitida — tipo "${tipo}" desconocido o contenido inválido.`, seccion);
    }
    return null;
  }

  return (
    <Componente
      contenido={contenido}
      variante={contenido?.variante}
      animacion={animacion}
      {...configEstiloAProps(configEstilo)}
    />
  );
};

export default RenderSeccion;
