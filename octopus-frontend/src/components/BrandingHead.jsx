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

const BrandingHead = () => {
  const { pathname } = useLocation();
  const { nombreColegio, tituloWeb, descripcionWeb, faviconUrl, loading } = useBranding();

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
