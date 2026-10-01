import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

// index.html trae un <title>/<link rel="icon"> estáticos como fallback visual
// mientras carga el JS — este componente los sobreescribe en runtime con los
// valores reales del colegio, una vez que BrandingProvider resuelve el fetch.
const prefijoPorRuta = (pathname) => {
  if (pathname.startsWith('/portal-docente')) return 'Docentes';
  if (pathname.startsWith('/portal')) return 'Portal';
  return 'Panel';
};

// Devuelve la etiqueta <tag attr="valor"> del <head>, creándola si no existe.
const asegurarEtiqueta = (tag, attr, valor) => {
  let el = document.head.querySelector(`${tag}[${attr}="${valor}"]`);
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(attr, valor);
    document.head.appendChild(el);
  }
  return el;
};

const BrandingHead = () => {
  const { pathname } = useLocation();
  const {
    nombreColegio, tituloWeb, descripcionWeb, faviconUrl, nombreApp, iconoAppUrl, colorPrimario, loading,
  } = useBranding();

  useEffect(() => {
    if (loading) return;
    const base = tituloWeb || nombreColegio;
    if (base) document.title = `${prefijoPorRuta(pathname)} — ${base}`;
  }, [pathname, tituloWeb, nombreColegio, loading]);

  useEffect(() => {
    if (loading || !faviconUrl) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl, loading]);

  // iOS no lee el manifest: el ícono y el nombre del acceso directo salen de
  // estas etiquetas al momento de "Agregar a pantalla de inicio".
  useEffect(() => {
    if (loading) return;
    if (iconoAppUrl) asegurarEtiqueta('link', 'rel', 'apple-touch-icon').href = iconoAppUrl;
    if (nombreApp) asegurarEtiqueta('meta', 'name', 'apple-mobile-web-app-title').content = nombreApp;
    if (colorPrimario) asegurarEtiqueta('meta', 'name', 'theme-color').content = colorPrimario;
  }, [iconoAppUrl, nombreApp, colorPrimario, loading]);

  useEffect(() => {
    if (loading || !descripcionWeb) return;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = descripcionWeb;
  }, [descripcionWeb, loading]);

  return null;
};

export default BrandingHead;
