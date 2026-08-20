import {
  BloqueCards,
  BloqueCarrusel,
  BloqueCta,
  BloqueHero,
  BloqueTestimonios,
  BloqueTextoImagen,
} from './_kit/bloques';
import { FooterPublico, NavPublica } from './_kit/chrome';
import {
  CARDS_PILARES,
  CARRUSEL_VIDA,
  COLEGIO,
  COLUMNAS_FOOTER,
  CTA_ADMISIONES,
  CTA_NAV,
  HERO_UMBRAL,
  MENU_PRINCIPAL,
  TESTIMONIOS_FAMILIAS,
  TEXTO_IMAGEN_PROYECTO,
} from './datosDemo';

/**
 * PLANTILLA 01 · Home "Umbral"
 *
 * Dials: VARIANCE 6 · MOTION 5 · DENSITY 3
 *
 * Punto de vista
 * La mayoría de los sitios de colegio abren con una foto de campus a
 * pantalla completa y un lema encima. Eso no distingue a nadie: todos los
 * campus se ven igual en una foto aérea. "Umbral" hace lo contrario, entra
 * por la palabra: titular a la izquierda, una sola foto vertical a la
 * derecha con proporción de retrato, como la foto de un anuario y no como
 * un banner de agencia de viajes. La página se lee de arriba a abajo con
 * ritmo de folleto impreso, que es exactamente el material con el que un
 * colegio ya sabe comunicar.
 *
 * Es la plantilla por defecto de la galería: la que aguanta cualquier
 * color de marca y cualquier calidad de foto, porque el peso visual lo
 * lleva la tipografía y el filete, no la imagen.
 *
 * Composición de bloques
 *   hero          variante dividido       · slide-up + slide-left
 *   texto_imagen  variante filete         · scroll-reveal + zoom-on-scroll
 *   cards         variante desnudas (3)   · stagger + hover-glow
 *   carrusel      variante ancho          · slide-left por slide
 *   testimonios   variante citas (2)      · stagger
 *   cta           variante banda          · slide-up
 */
export default function HomeUmbral() {
  return (
    <>
      <NavPublica colegio={COLEGIO} items={MENU_PRINCIPAL} cta={CTA_NAV} />

      <main>
        <BloqueHero contenido={HERO_UMBRAL} variante="dividido" animacion="slide-up" />

        <BloqueTextoImagen contenido={TEXTO_IMAGEN_PROYECTO} variante="filete" fondo="gris" />

        <BloqueCards contenido={CARDS_PILARES} variante="desnudas" rotulo="Proyecto educativo" />

        <BloqueCarrusel contenido={CARRUSEL_VIDA} variante="ancho" titulo="La vida del colegio, mes a mes" fondo="gris" />

        <BloqueTestimonios contenido={TESTIMONIOS_FAMILIAS} variante="citas" fondo="blanco" />

        <BloqueCta contenido={CTA_ADMISIONES} variante="banda" />
      </main>

      <FooterPublico colegio={COLEGIO} columnas={COLUMNAS_FOOTER} />
    </>
  );
}
