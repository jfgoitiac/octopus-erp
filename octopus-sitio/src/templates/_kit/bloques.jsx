import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Award,
  BookOpen,
  Calendar,
  Circle,
  Compass,
  FlaskConical,
  GraduationCap,
  Globe,
  HeartHandshake,
  Languages,
  Library,
  Microscope,
  Music,
  Palette,
  Sprout,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Boton,
  FondoParallax,
  Filete,
  ImagenZoom,
  ItemStagger,
  Lead,
  Revelar,
  Rotulo,
  Seccion,
  Tarjeta,
  Titular,
} from './primitivos';
import { urlVariante } from '../../lib/media';

/* ==================================================================
   Bloques del contrato (§4 de SITIO_CONTRATO_API.md), en versión
   solo-lectura y animada, con VARIANTES visuales.

   Cada bloque recibe el `contenido` tal como viene del serializer
   (con `imagen` ya expandida a variantes por el backend) y un prop
   `variante` que decide la composición. Las plantillas de la galería
   son combinaciones de bloque + variante + animación, nada más.
   ================================================================== */

/**
 * Paleta de iconos ofrecida por el editor visual para `cards[].icono`.
 * Es un mapa explícito y no `import * as` a propósito: el barrel de
 * lucide-react pesa más de 600 kB sin tree-shaking y este bloque va
 * por encima del pliegue en varias plantillas. Para añadir un icono al
 * catálogo se agrega aquí y en el selector del panel de propiedades.
 */
const ICONOS = {
  Award, BookOpen, Calendar, Compass, FlaskConical, Globe, GraduationCap,
  HeartHandshake, Languages, Library, Microscope, Music, Palette, Sprout,
  Trophy, Users,
};

export const ICONOS_DISPONIBLES = Object.keys(ICONOS);

function IconoLucide({ nombre, ...rest }) {
  const C = ICONOS[nombre] || Circle;
  return <C {...rest} />;
}

/* ------------------------------- HERO ------------------------------- */

/**
 * variante:
 *  - 'dividido'   texto a la izquierda, foto a la derecha en columna alta
 *  - 'inmersivo'  foto a sangre con velo, texto abajo a la izquierda
 *  - 'editorial'  sin foto de fondo, titular como cartel, foto ancha debajo
 */
export function BloqueHero({ contenido, variante = 'dividido', animacion = 'slide-up' }) {
  const { titulo, subtitulo, imagen_fondo, cta_texto, cta_url, overlay = 'oscuro' } = contenido;

  if (variante === 'inmersivo') {
    const sobreOscuro = overlay === 'oscuro';
    return (
      <section className="relative flex min-h-[100dvh] items-end overflow-hidden">
        <FondoParallax src={urlVariante(imagen_fondo, 'lg', 'md')} alt={imagen_fondo?.alt_text || ''} overlay={overlay} prioridad />
        <div
          className="relative mx-auto w-full pb-16 pt-24 sm:pb-24"
          style={{
            maxWidth: 'var(--ancho-contenido)',
            paddingInline: 'var(--canal)',
            color: sobreOscuro ? '#fbfaf8' : 'var(--tinta)',
          }}
        >
          <Revelar animacion={animacion} alto>
            <Titular
              nivel={1}
              escala="var(--paso-7)"
              style={{ maxWidth: '17ch', color: 'inherit', fontWeight: 500 }}
            >
              {titulo}
            </Titular>
            {subtitulo && (
              <Lead style={{ marginTop: '1.25rem', color: 'inherit', opacity: 0.88, maxWidth: '42ch' }}>
                {subtitulo}
              </Lead>
            )}
            {cta_texto && (
              <div className="mt-8 flex flex-wrap gap-3">
                <Boton href={cta_url} variante={sobreOscuro ? 'velo' : 'solido'}>
                  {cta_texto}
                  <ArrowRight size={16} strokeWidth={2} />
                </Boton>
              </div>
            )}
          </Revelar>
        </div>
      </section>
    );
  }

  if (variante === 'editorial') {
    return (
      <Seccion espaciadoTop="lg" espaciadoBottom="sm">
        <Revelar animacion={animacion} alto>
          <Titular nivel={1} escala="var(--paso-7)" style={{ maxWidth: '15ch', fontWeight: 500 }}>
            {titulo}
          </Titular>
          {subtitulo && <Lead style={{ marginTop: '1.5rem' }}>{subtitulo}</Lead>}
          {cta_texto && (
            <div className="mt-8">
              <Boton href={cta_url}>{cta_texto}</Boton>
            </div>
          )}
        </Revelar>
      </Seccion>
    );
  }

  // 'dividido'
  return (
    <Seccion espaciadoTop="md" espaciadoBottom="lg">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <Revelar animacion={animacion} alto>
          {/* 20ch: a paso-6 en la columna de 570px el titular cierra en 2 líneas.
              Con 14ch caía en 3, que es el tope del sistema para un h1. */}
          <Titular nivel={1} escala="var(--paso-6)" style={{ maxWidth: '20ch', fontWeight: 500 }}>
            {titulo}
          </Titular>
          {subtitulo && <Lead style={{ marginTop: '1.5rem' }}>{subtitulo}</Lead>}
          {cta_texto && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Boton href={cta_url}>
                {cta_texto}
                <ArrowRight size={16} strokeWidth={2} />
              </Boton>
            </div>
          )}
        </Revelar>
        <Revelar animacion="slide-left" alto>
          <div
            className="overflow-hidden"
            style={{
              borderRadius: 'var(--radio-superficie)',
              aspectRatio: '4 / 5',
              background: 'var(--papel-3)',
              boxShadow: 'var(--sombra-2)',
            }}
          >
            {urlVariante(imagen_fondo, 'md', 'sm') && (
              <img
                src={urlVariante(imagen_fondo, 'md', 'sm')}
                alt={imagen_fondo?.alt_text || ''}
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </Revelar>
      </div>
    </Seccion>
  );
}

/* ---------------------------- TEXTO + IMAGEN ---------------------------- */

/**
 * variante:
 *  - 'filete'    columna de texto con filete de marca arriba, foto al lado
 *  - 'solapado'  la foto sube por encima del borde de sección (variance alta)
 */
export function BloqueTextoImagen({ contenido, variante = 'filete', animacion = 'scroll-reveal', fondo = 'blanco' }) {
  const { titulo, texto, imagen, posicion_imagen = 'derecha', cta_texto, cta_url } = contenido;
  const imagenPrimero = posicion_imagen === 'izquierda';

  return (
    <Seccion fondo={fondo} espaciadoTop="lg" espaciadoBottom="lg">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Revelar
          animacion={imagenPrimero ? 'slide-left' : 'slide-right'}
          className={imagenPrimero ? 'lg:order-1' : 'lg:order-2'}
          style={variante === 'solapado' ? { marginBlock: '-2.5rem' } : undefined}
        >
          <ImagenZoom src={urlVariante(imagen, 'md', 'sm')} alt={imagen?.alt_text || ''} ratio={variante === 'solapado' ? '3 / 4' : '4 / 3'} />
        </Revelar>

        <Revelar animacion={animacion} className={imagenPrimero ? 'lg:order-2' : 'lg:order-1'}>
          <div
            aria-hidden="true"
            style={{ width: '3rem', height: '3px', background: 'var(--marca-primario)', marginBottom: '1.5rem' }}
          />
          <Titular nivel={2} escala="var(--paso-4)">
            {titulo}
          </Titular>
          <div
            style={{
              marginTop: '1.25rem',
              color: 'var(--tinta-700)',
              fontSize: 'var(--paso-1)',
              lineHeight: 1.7,
              maxWidth: '52ch',
            }}
            dangerouslySetInnerHTML={{ __html: texto }}
          />
          {cta_texto && (
            <div className="mt-7">
              <Boton href={cta_url} variante="texto">
                {cta_texto}
                <ArrowUpRight size={16} strokeWidth={2} />
              </Boton>
            </div>
          )}
        </Revelar>
      </div>
    </Seccion>
  );
}

/* -------------------------------- CARDS -------------------------------- */

/** 'hito': línea de tiempo vertical con filete de marca y punto por hito. */
function CardsHito({ items, animacion }) {
  return (
    <Revelar animacion={animacion} className="mt-12 flex flex-col" style={{ gap: '2.75rem' }}>
      {items.map((item, i) => (
        <ItemStagger
          key={i}
          className="grid gap-x-6"
          style={{ gridTemplateColumns: '1.75rem 1fr' }}
        >
          <div className="relative flex justify-center" aria-hidden="true">
            <span
              style={{
                position: 'absolute',
                top: i === 0 ? '0.9rem' : 0,
                bottom: i === items.length - 1 ? 'calc(100% - 0.9rem)' : '-2.75rem',
                width: '1px',
                background: 'var(--linea)',
              }}
            />
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                marginTop: '0.35rem',
                width: '0.65rem',
                height: '0.65rem',
                borderRadius: '999px',
                background: 'var(--marca-primario)',
                boxShadow: '0 0 0 4px var(--papel)',
              }}
            />
          </div>
          <div style={{ paddingBottom: '0.25rem' }}>
            {item.icono && (
              <IconoLucide
                nombre={item.icono}
                size={20}
                strokeWidth={1.5}
                style={{ color: 'var(--marca-primario)', marginBottom: '0.6rem' }}
              />
            )}
            <h3
              style={{
                fontFamily: 'var(--fuente-display)',
                fontSize: 'var(--paso-2)',
                fontWeight: 600,
                letterSpacing: '-0.015em',
                lineHeight: 1.2,
              }}
            >
              {item.titulo}
            </h3>
            <p style={{ marginTop: '0.6rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.7, maxWidth: '58ch' }}>
              {item.texto}
            </p>
          </div>
        </ItemStagger>
      ))}
    </Revelar>
  );
}

/** 'pasos': secuencia numerada por índice, con conector en desktop. */
function CardsPasos({ items, animacion, columnas, cols }) {
  return (
    <Revelar animacion={animacion} className={`mt-12 grid gap-x-10 gap-y-10 ${cols[columnas] || cols[4] || cols[3]}`}>
      {items.map((item, i) => (
        <ItemStagger key={i} className="relative">
          <div
            style={{
              fontFamily: 'var(--fuente-display)',
              fontSize: 'var(--paso-5)',
              fontWeight: 600,
              color: 'var(--marca-primario)',
              opacity: 0.85,
              lineHeight: 1,
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </div>
          <div
            aria-hidden="true"
            style={{ marginTop: '1rem', width: '2rem', height: '2px', background: 'var(--linea-fuerte)' }}
          />
          <h3
            style={{
              marginTop: '1rem',
              fontFamily: 'var(--fuente-display)',
              fontSize: 'var(--paso-2)',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              lineHeight: 1.2,
            }}
          >
            {item.titulo}
          </h3>
          <p style={{ marginTop: '0.6rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.7 }}>
            {item.texto}
          </p>
          {i < items.length - 1 && (
            <ArrowRight
              aria-hidden="true"
              size={18}
              strokeWidth={1.5}
              className="hidden lg:block"
              style={{ position: 'absolute', top: '0.4rem', right: '-1.7rem', color: 'var(--linea-fuerte)' }}
            />
          )}
        </ItemStagger>
      ))}
    </Revelar>
  );
}

/** 'contacto': tarjeta compacta icono + dato, clicable si trae `url`. */
function CardsContacto({ items, animacion, columnas, cols }) {
  return (
    <Revelar animacion={animacion} className={`mt-12 grid gap-4 ${cols[columnas] || cols[3]}`}>
      {items.map((item, i) => (
        <ItemStagger key={i}>
          <Tarjeta
            gesto="hover-lift"
            as={item.url ? 'a' : 'div'}
            href={item.url || undefined}
            className="flex h-full items-start gap-4"
            style={{
              padding: '1.5rem',
              background: 'var(--papel)',
              border: '1px solid var(--linea)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              className="shrink-0"
              style={{
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '999px',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--papel-2)',
              }}
            >
              <IconoLucide nombre={item.icono} size={20} strokeWidth={1.5} style={{ color: 'var(--marca-primario)' }} />
            </div>
            <div className="min-w-0">
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--paso--2)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--tinta-500)',
                }}
              >
                {item.titulo}
              </p>
              <p style={{ marginTop: '0.4rem', fontSize: 'var(--paso-0)', fontWeight: 500, lineHeight: 1.5 }}>
                {item.texto}
              </p>
            </div>
          </Tarjeta>
        </ItemStagger>
      ))}
    </Revelar>
  );
}

/** 'destacada': primer item a doble ancho con foto, resto en rejilla menor. */
function CardsDestacada({ items, animacion }) {
  const [primero, ...resto] = items;
  if (!primero) return null;
  const conImagen = Boolean(urlVariante(primero.imagen, 'md', 'sm'));

  return (
    <Revelar animacion={animacion} className="mt-12">
      <ItemStagger>
        <Tarjeta
          gesto="hover-lift"
          className={conImagen ? 'grid overflow-hidden lg:grid-cols-2' : 'overflow-hidden'}
          style={{ background: 'var(--papel)', border: '1px solid var(--linea)' }}
        >
          {conImagen && (
            <div style={{ aspectRatio: '16 / 10' }} className="lg:aspect-auto lg:h-full">
              <img
                src={urlVariante(primero.imagen, 'md', 'sm')}
                alt={primero.imagen?.alt_text || ''}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div style={{ padding: '2.25rem' }} className="flex flex-col justify-center">
            <Rotulo>Destacada</Rotulo>
            <h3
              style={{
                marginTop: '1rem',
                fontFamily: 'var(--fuente-display)',
                fontSize: 'var(--paso-4)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              {primero.titulo}
            </h3>
            <p style={{ marginTop: '0.85rem', color: 'var(--tinta-500)', fontSize: 'var(--paso-0)', lineHeight: 1.7, maxWidth: '52ch' }}>
              {primero.texto}
            </p>
            {primero.url && (
              <a
                href={primero.url}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  marginTop: '1.5rem',
                  fontSize: 'var(--paso--1)',
                  fontWeight: 600,
                  color: 'var(--marca-primario)',
                  textDecoration: 'none',
                }}
              >
                Leer nota
                <ArrowUpRight size={15} strokeWidth={2} />
              </a>
            )}
          </div>
        </Tarjeta>
      </ItemStagger>

      {resto.length > 0 && (
        <div className="mt-6 grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--linea)' }}>
          {resto.map((item, i) => (
            <ItemStagger key={i}>
              <Tarjeta gesto="hover-glow" style={{ height: '100%', background: 'var(--papel)', padding: '1.75rem' }}>
                <h3
                  style={{
                    fontFamily: 'var(--fuente-display)',
                    fontSize: 'var(--paso-1)',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.25,
                  }}
                >
                  {item.titulo}
                </h3>
                <p style={{ marginTop: '0.6rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.65 }}>
                  {item.texto}
                </p>
              </Tarjeta>
            </ItemStagger>
          ))}
        </div>
      )}
    </Revelar>
  );
}

/** 'lista': filas compactas separadas por filete, tipo índice de boletín. */
function CardsLista({ items, animacion }) {
  return (
    <Revelar animacion={animacion} className="mt-10 flex flex-col">
      {items.map((item, i) => (
        <ItemStagger key={i}>
          <Tarjeta
            gesto="hover-glow"
            as={item.url ? 'a' : 'div'}
            href={item.url || undefined}
            className="flex items-center gap-5 sm:gap-6"
            style={{
              padding: '1.25rem 0',
              borderTop: i === 0 ? '1px solid var(--linea)' : 'none',
              borderBottom: '1px solid var(--linea)',
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 0,
            }}
          >
            {urlVariante(item.imagen, 'sm', 'thumb') && (
              <div
                className="shrink-0 overflow-hidden"
                style={{ width: '5.5rem', height: '5.5rem', borderRadius: 'var(--radio-interactivo)', background: 'var(--papel-3)' }}
              >
                <img
                  src={urlVariante(item.imagen, 'sm', 'thumb')}
                  alt={item.imagen?.alt_text || ''}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3
                style={{
                  fontFamily: 'var(--fuente-display)',
                  fontSize: 'var(--paso-1)',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3,
                }}
              >
                {item.titulo}
              </h3>
              <p
                className="line-clamp-2"
                style={{ marginTop: '0.35rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.6 }}
              >
                {item.texto}
              </p>
            </div>
            <ArrowUpRight size={18} strokeWidth={1.75} className="hidden shrink-0 sm:block" style={{ color: 'var(--tinta-400)' }} />
          </Tarjeta>
        </ItemStagger>
      ))}
    </Revelar>
  );
}

/** 'agenda': fila con insignia de icono a la izquierda, evento a la derecha. */
function CardsAgenda({ items, animacion }) {
  return (
    <Revelar animacion={animacion} className="mt-10 flex flex-col" style={{ gap: '1px', background: 'var(--linea)' }}>
      {items.map((item, i) => (
        <ItemStagger key={i}>
          <Tarjeta gesto="hover-glow" className="flex items-start gap-6" style={{ background: 'var(--papel)', padding: '1.75rem 0.5rem' }}>
            <div
              className="shrink-0"
              style={{
                width: '4.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.9rem 0',
                borderRadius: 'var(--radio-interactivo)',
                background: 'var(--papel-2)',
                color: 'var(--marca-primario)',
              }}
            >
              <IconoLucide nombre={item.icono || 'Calendar'} size={22} strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                style={{
                  fontFamily: 'var(--fuente-display)',
                  fontSize: 'var(--paso-2)',
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
                  lineHeight: 1.25,
                }}
              >
                {item.titulo}
              </h3>
              <p style={{ marginTop: '0.5rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.7 }}>
                {item.texto}
              </p>
              {item.url && (
                <a
                  href={item.url}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginTop: '0.9rem',
                    fontSize: 'var(--paso--1)',
                    fontWeight: 600,
                    color: 'var(--marca-primario)',
                    textDecoration: 'none',
                  }}
                >
                  Más información
                  <ArrowUpRight size={14} strokeWidth={2} />
                </a>
              )}
            </div>
          </Tarjeta>
        </ItemStagger>
      ))}
    </Revelar>
  );
}

const VARIANTES_LISTA_PROPIA = ['hito', 'pasos', 'contacto', 'destacada', 'lista', 'agenda'];

/**
 * variante:
 *  - 'desnudas'   sin caja, separadas por filetes verticales. Densidad baja.
 *  - 'contenidas' superficie con hover-lift. Para cuando cada card es un destino.
 *  - 'retrato'    imagen alta arriba, texto debajo. Para niveles/programas.
 *  - 'hito'       línea de tiempo vertical. Para cronologías institucionales.
 *  - 'pasos'      secuencia numerada con conector. Para rutas/procesos.
 *  - 'contacto'   icono + dato, clicable. Para teléfono/email/dirección.
 *  - 'destacada'  primer item a doble ancho con foto, resto en rejilla menor.
 *  - 'lista'      filas compactas con filete. Para índices/boletines.
 *  - 'agenda'     insignia de icono + evento, en filas. Para calendarios.
 */
export function BloqueCards({ contenido, variante = 'desnudas', animacion = 'stagger', fondo = 'blanco', rotulo }) {
  const { titulo, items = [], columnas = 3 } = contenido;
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };

  const encabezado = (titulo || rotulo) && (
    <Revelar animacion="slide-up">
      {rotulo && <div className="mb-4">{<Rotulo>{rotulo}</Rotulo>}</div>}
      {titulo && (
        <Titular nivel={2} escala="var(--paso-4)" style={{ maxWidth: '20ch' }}>
          {titulo}
        </Titular>
      )}
    </Revelar>
  );

  if (VARIANTES_LISTA_PROPIA.includes(variante)) {
    return (
      <Seccion fondo={fondo} espaciadoTop="lg" espaciadoBottom="lg">
        {encabezado}
        {variante === 'hito' && <CardsHito items={items} animacion={animacion} />}
        {variante === 'pasos' && <CardsPasos items={items} animacion={animacion} columnas={columnas} cols={cols} />}
        {variante === 'contacto' && <CardsContacto items={items} animacion={animacion} columnas={columnas} cols={cols} />}
        {variante === 'destacada' && <CardsDestacada items={items} animacion={animacion} />}
        {variante === 'lista' && <CardsLista items={items} animacion={animacion} />}
        {variante === 'agenda' && <CardsAgenda items={items} animacion={animacion} />}
      </Seccion>
    );
  }

  return (
    <Seccion fondo={fondo} espaciadoTop="lg" espaciadoBottom="lg">
      {encabezado}

      <Revelar animacion={animacion} className={`mt-12 grid gap-px ${cols[columnas] || cols[3]}`}
        style={variante === 'desnudas' ? { background: 'var(--linea)' } : { gap: '1.5rem', background: 'transparent' }}
      >
        {items.map((item, i) => {
          if (variante === 'retrato') {
            return (
              <ItemStagger key={i}>
                <Tarjeta gesto="hover-lift">
                  <ImagenZoom src={urlVariante(item.imagen, 'md', 'sm')} alt={item.imagen?.alt_text || ''} ratio="3 / 4" />
                  <h3
                    style={{
                      marginTop: '1.25rem',
                      fontFamily: 'var(--fuente-display)',
                      fontSize: 'var(--paso-3)',
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.15,
                    }}
                  >
                    {item.titulo}
                  </h3>
                  <p style={{ marginTop: '0.6rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.65 }}>
                    {item.texto}
                  </p>
                </Tarjeta>
              </ItemStagger>
            );
          }

          const contenida = variante === 'contenidas';
          return (
            <ItemStagger key={i}>
              <Tarjeta
                gesto={contenida ? 'hover-lift' : 'hover-glow'}
                style={{
                  height: '100%',
                  background: 'var(--papel)',
                  padding: contenida ? '2rem' : '2.25rem 1.75rem',
                  border: contenida ? '1px solid var(--linea)' : 'none',
                  borderRadius: contenida ? 'var(--radio-superficie)' : 0,
                }}
              >
                {item.icono && (
                  <IconoLucide
                    nombre={item.icono}
                    size={26}
                    strokeWidth={1.5}
                    style={{ color: 'var(--marca-primario)' }}
                  />
                )}
                <h3
                  style={{
                    marginTop: '1.25rem',
                    fontFamily: 'var(--fuente-display)',
                    fontSize: 'var(--paso-2)',
                    fontWeight: 600,
                    letterSpacing: '-0.015em',
                    lineHeight: 1.2,
                  }}
                >
                  {item.titulo}
                </h3>
                <p style={{ marginTop: '0.7rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', lineHeight: 1.7 }}>
                  {item.texto}
                </p>
                {item.url && (
                  <a
                    href={item.url}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginTop: '1.25rem',
                      fontSize: 'var(--paso--1)',
                      fontWeight: 600,
                      color: 'var(--marca-primario)',
                      textDecoration: 'none',
                    }}
                  >
                    Ver más
                    <ArrowUpRight size={15} strokeWidth={2} />
                  </a>
                )}
              </Tarjeta>
            </ItemStagger>
          );
        })}
      </Revelar>
    </Seccion>
  );
}

/* ------------------------------- GALERÍA ------------------------------- */

/**
 * variante:
 *  - 'mosaico'  primera imagen a doble alto, resto en rejilla
 *  - 'rejilla'  todas iguales, `columnas` del contenido manda
 */
export function BloqueGaleria({ contenido, variante = 'mosaico', fondo = 'gris' }) {
  const { titulo, imagenes = [], columnas = 3 } = contenido;
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };

  return (
    <Seccion fondo={fondo} espaciadoTop="lg" espaciadoBottom="lg">
      {titulo && (
        <Revelar animacion="slide-up">
          <Titular nivel={2} escala="var(--paso-4)" style={{ maxWidth: '18ch', marginBottom: '2.5rem' }}>
            {titulo}
          </Titular>
        </Revelar>
      )}
      <Revelar
        animacion="stagger"
        className={`grid gap-4 ${variante === 'mosaico' ? 'sm:grid-cols-3' : cols[columnas] || cols[3]}`}
      >
        {imagenes.map((img, i) => (
          <ItemStagger
            key={i}
            className={variante === 'mosaico' && i === 0 ? 'sm:col-span-2 sm:row-span-2' : undefined}
          >
            <figure style={{ margin: 0, height: '100%' }}>
              <div
                className="overflow-hidden"
                style={{
                  borderRadius: 'var(--radio-superficie)',
                  aspectRatio: variante === 'mosaico' && i === 0 ? '1 / 1' : '4 / 3',
                  background: 'var(--papel-3)',
                  height: '100%',
                }}
              >
                {urlVariante(img.media_id, 'md', 'sm') && (
                  <img
                    src={urlVariante(img.media_id, 'md', 'sm')}
                    alt={img.caption || img.media_id?.alt_text || ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              {img.caption && (
                <figcaption style={{ marginTop: '0.6rem', fontSize: 'var(--paso--2)', color: 'var(--tinta-500)' }}>
                  {img.caption}
                </figcaption>
              )}
            </figure>
          </ItemStagger>
        ))}
      </Revelar>
    </Seccion>
  );
}

/* --------------------------------- CTA --------------------------------- */

/**
 * variante:
 *  - 'banda'     banda de color de marca a todo el ancho
 *  - 'sobrefoto' foto de fondo con velo profundo
 *  - 'discreta'  sin fondo, filete arriba y abajo. Para páginas de lectura.
 */
export function BloqueCta({ contenido, variante = 'banda' }) {
  const { titulo, texto, boton_texto, boton_url, fondo: imagenFondo } = contenido;

  if (variante === 'discreta') {
    return (
      <Seccion espaciadoTop="md" espaciadoBottom="md">
        <Filete />
        <div className="flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Titular nivel={2} escala="var(--paso-3)" style={{ maxWidth: '18ch' }}>
              {titulo}
            </Titular>
            {texto && (
              <p style={{ marginTop: '0.75rem', color: 'var(--tinta-500)', maxWidth: '44ch' }}>{texto}</p>
            )}
          </div>
          <Boton href={boton_url}>
            {boton_texto}
            <ArrowRight size={16} strokeWidth={2} />
          </Boton>
        </div>
        <Filete />
      </Seccion>
    );
  }

  if (variante === 'sobrefoto') {
    return (
      <section className="relative overflow-hidden">
        <FondoParallax src={urlVariante(imagenFondo, 'lg', 'md')} alt="" overlay="oscuro" />
        <div
          className="relative mx-auto flex flex-col items-start gap-7 py-28"
          style={{ maxWidth: 'var(--ancho-contenido)', paddingInline: 'var(--canal)', color: '#fbfaf8' }}
        >
          <Revelar animacion="slide-up">
            <Titular nivel={2} escala="var(--paso-5)" style={{ color: 'inherit', maxWidth: '16ch', fontWeight: 500 }}>
              {titulo}
            </Titular>
            {texto && (
              <Lead style={{ marginTop: '1.1rem', color: 'inherit', opacity: 0.86, maxWidth: '44ch' }}>{texto}</Lead>
            )}
            <div className="mt-8">
              <Boton href={boton_url} variante="velo">
                {boton_texto}
                <ArrowRight size={16} strokeWidth={2} />
              </Boton>
            </div>
          </Revelar>
        </div>
      </section>
    );
  }

  return (
    <Seccion fondo="primario" espaciadoTop="lg" espaciadoBottom="lg">
      <Revelar animacion="slide-up">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <Titular nivel={2} escala="var(--paso-5)" style={{ color: 'inherit', maxWidth: '16ch', fontWeight: 500 }}>
              {titulo}
            </Titular>
            {texto && (
              <p style={{ marginTop: '1rem', maxWidth: '46ch', opacity: 0.85, fontSize: 'var(--paso-1)' }}>{texto}</p>
            )}
          </div>
          <div className="lg:justify-self-end">
            <Boton
              href={boton_url}
              variante="contorno"
              style={{ borderColor: 'currentColor', color: 'inherit' }}
            >
              {boton_texto}
              <ArrowRight size={16} strokeWidth={2} />
            </Boton>
          </div>
        </div>
      </Revelar>
    </Seccion>
  );
}

/* ----------------------------- TESTIMONIOS ----------------------------- */

/**
 * variante:
 *  - 'citas'    dos columnas, cita como texto grande sin comillas decorativas
 *  - 'retratos' foto redonda arriba, cita corta debajo
 */
export function BloqueTestimonios({ contenido, variante = 'citas', fondo = 'gris', rotulo }) {
  const { titulo, items = [] } = contenido;

  return (
    <Seccion fondo={fondo} espaciadoTop="lg" espaciadoBottom="lg">
      <Revelar animacion="slide-up">
        {rotulo && <div className="mb-4">{<Rotulo>{rotulo}</Rotulo>}</div>}
        {titulo && (
          <Titular nivel={2} escala="var(--paso-4)" style={{ maxWidth: '20ch' }}>
            {titulo}
          </Titular>
        )}
      </Revelar>

      <Revelar
        animacion="stagger"
        className={`mt-12 grid gap-10 ${variante === 'retratos' ? 'sm:grid-cols-3' : 'lg:grid-cols-2 lg:gap-14'}`}
      >
        {items.map((t, i) => (
          <ItemStagger key={i} as="figure" style={{ margin: 0 }}>
            {variante === 'retratos' && urlVariante(t.foto, 'thumb') && (
              <img
                src={urlVariante(t.foto, 'thumb')}
                alt=""
                loading="lazy"
                style={{ width: 64, height: 64, borderRadius: '999px', objectFit: 'cover', marginBottom: '1.25rem' }}
              />
            )}
            <blockquote
              style={{
                margin: 0,
                fontFamily: 'var(--fuente-display)',
                fontSize: variante === 'retratos' ? 'var(--paso-1)' : 'var(--paso-2)',
                lineHeight: 1.45,
                letterSpacing: '-0.012em',
                color: 'var(--tinta)',
                textWrap: 'pretty',
              }}
            >
              {t.texto}
            </blockquote>
            <figcaption
              style={{
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--linea)',
                fontSize: 'var(--paso--1)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{t.nombre}</span>
              {t.cargo && <span style={{ color: 'var(--tinta-500)' }}>{`, ${t.cargo}`}</span>}
            </figcaption>
          </ItemStagger>
        ))}
      </Revelar>
    </Seccion>
  );
}

/* ------------------------------- CARRUSEL ------------------------------- */

/**
 * Embla real. variante: 'ancho' (1 slide grande, 78vw) | 'tarjetas' (varias
 * visibles, 82vw en mobile / ~3 en desktop vía basis). Autoplay manual
 * (sin plugin embla-carousel-autoplay, no está en el stack aprobado):
 * `setInterval` + `scrollNext`, se detiene con hover/drag y se desactiva
 * por completo si `prefers-reduced-motion`.
 */
export function BloqueCarrusel({ contenido, variante = 'ancho', titulo, fondo = 'blanco' }) {
  const { slides = [], autoplay = true, intervalo_ms: intervaloMs = 5000 } = contenido;
  const reducir = useReducedMotion();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: slides.length > 1, align: 'start' });
  const [puedeAnterior, setPuedeAnterior] = useState(false);
  const [puedeSiguiente, setPuedeSiguiente] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;
    const sync = () => {
      setPuedeAnterior(emblaApi.canScrollPrev());
      setPuedeSiguiente(emblaApi.canScrollNext());
    };
    sync();
    emblaApi.on('select', sync);
    emblaApi.on('reInit', sync);
    return () => emblaApi.off('select', sync);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || !autoplay || reducir || slides.length < 2) return;
    const id = setInterval(() => emblaApi.scrollNext(), Math.max(1000, intervaloMs));
    return () => clearInterval(id);
  }, [emblaApi, autoplay, reducir, intervaloMs, slides.length]);

  // Navegación por teclado: con foco en el carrusel, ← / → mueven los slides.
  const manejarTeclado = (e) => {
    if (!emblaApi) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      emblaApi.scrollPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      emblaApi.scrollNext();
    }
  };

  const anchoSlide = variante === 'ancho' ? 'min(78vw, 720px)' : 'min(82vw, 380px)';

  return (
    <Seccion fondo={fondo} ancho="completo" espaciadoTop="lg" espaciadoBottom="lg">
      <div
        className="mx-auto mb-8 flex items-end justify-between gap-4 sm:gap-6"
        style={{ maxWidth: 'var(--ancho-contenido)', paddingInline: 'var(--canal)' }}
      >
        {titulo && (
          <Titular nivel={2} escala="var(--paso-4)" style={{ maxWidth: '16ch' }}>
            {titulo}
          </Titular>
        )}
        <div className="flex shrink-0 gap-2">
          {[
            { dir: 'prev', Icono: ArrowLeft, etiqueta: 'Anterior', habilitado: puedeAnterior },
            { dir: 'next', Icono: ArrowRight, etiqueta: 'Siguiente', habilitado: puedeSiguiente },
          ].map(({ dir, Icono, etiqueta, habilitado }) => (
            <button
              key={etiqueta}
              type="button"
              onClick={() => (dir === 'prev' ? emblaApi?.scrollPrev() : emblaApi?.scrollNext())}
              onKeyDown={manejarTeclado}
              disabled={!habilitado}
              aria-label={`${etiqueta} slide`}
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radio-interactivo)',
                border: '1px solid var(--linea-fuerte)',
                background: 'transparent',
                color: 'var(--tinta)',
                display: 'grid',
                placeItems: 'center',
                cursor: habilitado ? 'pointer' : 'default',
                opacity: habilitado ? 1 : 0.35,
                transition: 'background-color var(--dur-media) var(--curva-estandar), opacity var(--dur-media) var(--curva-estandar)',
              }}
            >
              <Icono size={17} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-hidden"
        ref={emblaRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={titulo || 'Carrusel de imágenes'}
        tabIndex={0}
        onKeyDown={manejarTeclado}
        style={{ paddingInline: 'max(var(--canal), calc((100vw - var(--ancho-contenido)) / 2 + var(--canal)))', outlineOffset: 4 }}
      >
        <div className="flex gap-4">
          {slides.map((s, i) => (
            <motion.figure
              key={i}
              className="shrink-0"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}`}
              style={{ width: anchoSlide, margin: 0 }}
              initial={reducir ? false : { opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: Math.min(i, 3) * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="overflow-hidden"
                style={{ borderRadius: 'var(--radio-superficie)', aspectRatio: '16 / 10', background: 'var(--papel-3)' }}
              >
                {urlVariante(s.imagen, 'md', 'sm') && (
                  <img src={urlVariante(s.imagen, 'md', 'sm')} alt={s.imagen?.alt_text || s.titulo || ''} loading="lazy" className="h-full w-full object-cover" />
                )}
              </div>
              {(s.titulo || s.texto) && (
                <figcaption style={{ marginTop: '1rem', maxWidth: '46ch' }}>
                  {s.titulo && (
                    <h3
                      style={{
                        fontFamily: 'var(--fuente-display)',
                        fontSize: 'var(--paso-2)',
                        fontWeight: 600,
                        letterSpacing: '-0.015em',
                        margin: 0,
                      }}
                    >
                      {s.titulo}
                    </h3>
                  )}
                  {s.texto && (
                    <p style={{ marginTop: '0.4rem', color: 'var(--tinta-500)', fontSize: 'var(--paso--1)' }}>{s.texto}</p>
                  )}
                </figcaption>
              )}
            </motion.figure>
          ))}
        </div>
      </div>
    </Seccion>
  );
}
