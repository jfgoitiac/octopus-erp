import { HelpCircle } from 'lucide-react';
import Hero from './bloques/Hero';
import TextoImagen from './bloques/TextoImagen';
import Galeria from './bloques/Galeria';
import Cards from './bloques/Cards';
import Cta from './bloques/Cta';
import Testimonios from './bloques/Testimonios';
import Carrusel from './bloques/Carrusel';

const COMPONENTES_POR_TIPO = {
  hero: Hero,
  texto_imagen: TextoImagen,
  galeria: Galeria,
  cards: Cards,
  cta: Cta,
  testimonios: Testimonios,
  carrusel: Carrusel,
};

/**
 * Preview en vivo de un bloque (`Seccion`) dentro del editor visual admin.
 * Renderiza una versión de PREVIEW simplificada (sin Framer Motion/Embla) del
 * mismo tipo de bloque que arma el sitio público — el objetivo es ver qué se
 * está armando, no una réplica 1:1 animada.
 *
 * Props:
 * - `seccion`: objeto Seccion a previsualizar.
 */
const PreviewBloque = ({ seccion = null }) => {
  if (!seccion) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center justify-center text-center" style={{ border: '1px dashed var(--border-md)', background: 'var(--bg)', color: 'var(--ash)' }}>
        <p className="text-xs">No hay bloque seleccionado.</p>
      </div>
    );
  }

  const Componente = COMPONENTES_POR_TIPO[seccion.tipo];

  if (!Componente) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center justify-center text-center" style={{ border: '1px dashed var(--border-md)', background: 'var(--bg)', color: 'var(--ash)' }}>
        <HelpCircle size={20} className="mb-2 opacity-40" />
        <p className="text-xs">Tipo de bloque desconocido: "{seccion.tipo}".</p>
      </div>
    );
  }

  return <Componente contenido={seccion.contenido || {}} />;
};

export default PreviewBloque;
