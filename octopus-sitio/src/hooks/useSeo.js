import { useEffect } from 'react';
import { useConfiguracion } from './useConfiguracion';

/**
 * Setea document.title y meta description con fallback a
 * ConfiguracionSitio.seo_titulo_default / seo_descripcion_default.
 * Sin librería nueva — manipulación directa del DOM (liviano, suficiente
 * para el alcance de este scaffold).
 */
export const useSeo = ({ titulo, descripcion } = {}) => {
  const { configuracion } = useConfiguracion() ?? {};

  useEffect(() => {
    const tituloFinal = titulo || configuracion?.seo_titulo_default || 'Sitio Institucional';
    const descripcionFinal = descripcion || configuracion?.seo_descripcion_default || '';

    document.title = tituloFinal;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', descripcionFinal);
  }, [titulo, descripcion, configuracion]);
};
