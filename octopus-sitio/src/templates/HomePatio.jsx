import { BloqueCards, BloqueCarrusel, BloqueCta, BloqueGaleria, BloqueHero } from './_kit/bloques';
import { FooterPublico, NavPublica } from './_kit/chrome';
import {
  CARDS_NIVELES,
  CARRUSEL_VIDA,
  COLEGIO,
  COLUMNAS_FOOTER,
  CTA_ADMISIONES,
  CTA_NAV,
  GALERIA_CAMPUS,
  HERO_PATIO,
  MENU_PRINCIPAL,
} from './datosDemo';

/**
 * PLANTILLA 02 · Home "Patio"
 *
 * Dials: VARIANCE 7 · MOTION 7 · DENSITY 3
 *
 * Punto de vista
 * Para el colegio cuyo argumento de venta ES el lugar: campus grande,
 * instalaciones deportivas, huerto, laboratorios. Aquí la foto no ilustra
 * el texto, la foto es el texto. Toda la plantilla está construida para
 * que el visitante haga un recorrido y no una lectura: hero a sangre con
 * parallax, luego tres retratos verticales de cada nivel, un carrusel
 * horizontal de la vida escolar y un mosaico de instalaciones.
 *
 * Regla dura de esta plantilla: cero bloques de texto+imagen partido.
 * Si la plantilla se justifica por las fotos, meter columnas de párrafo
 * al lado de la foto la convierte en cualquier otro sitio institucional.
 * El texto vive corto, dentro de los pies de foto y de las tarjetas.
 *
 * La nav arranca transparente sobre el hero y se solidifica al salir de
 * él, con un centinela de IntersectionObserver, nunca con listener de
 * scroll.
 *
 * Composición de bloques
 *   hero        variante inmersivo (overlay oscuro) · parallax + slide-up
 *   cards       variante retrato (3)                · stagger + zoom-on-scroll + hover-lift
 *   carrusel    variante ancho                      · slide-left por slide
 *   galeria     variante mosaico                    · stagger
 *   cta         variante sobrefoto                  · parallax + slide-up
 */
export default function HomePatio() {
  return (
    <>
      <NavPublica colegio={COLEGIO} items={MENU_PRINCIPAL} cta={CTA_NAV} tono="sobre-foto" />

      <main style={{ marginTop: 'calc(-1 * clamp(68px, 7vw, 76px))' }}>
        <BloqueHero contenido={HERO_PATIO} variante="inmersivo" animacion="slide-up" />

        <BloqueCards contenido={CARDS_NIVELES} variante="retrato" rotulo="Niveles" />

        <BloqueCarrusel contenido={CARRUSEL_VIDA} variante="ancho" titulo="Un año escolar completo" fondo="gris" />

        <BloqueGaleria contenido={GALERIA_CAMPUS} variante="mosaico" fondo="blanco" />

        <BloqueCta contenido={CTA_ADMISIONES} variante="sobrefoto" />
      </main>

      <FooterPublico colegio={COLEGIO} columnas={COLUMNAS_FOOTER} />
    </>
  );
}
