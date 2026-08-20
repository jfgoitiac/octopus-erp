import { useEffect, useState } from 'react';
import { getConfiguracion } from '../api/sitio.service';
import { resolverUrlMedia } from '../lib/media';
import { aplicarTemaColegio } from '../templates/_kit/tema';
import { ConfiguracionContext } from './ConfiguracionContextValue';

/**
 * Carga `ConfiguracionSitio` una sola vez (logo, colores, redes, SEO default)
 * y la expone a toda la app. Los colores se aplican como variables CSS en
 * :root para que tanto Tailwind (`var(--color-primario)`) como CSS plano los
 * lean de la misma fuente.
 */
export const ConfiguracionProvider = ({ children }) => {
  const [configuracion, setConfiguracion] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    getConfiguracion()
      .then((res) => {
        if (!activo) return;
        setConfiguracion(res.data);
        const root = document.documentElement.style;
        if (res.data.color_primario) root.setProperty('--color-primario', res.data.color_primario);
        if (res.data.color_secundario) root.setProperty('--color-secundario', res.data.color_secundario);
        if (res.data.color_acento) root.setProperty('--color-acento', res.data.color_acento);
        // Recalcula --marca-primario-texto/-acento-texto por contraste WCAG
        // real (ver templates/_kit/tema.js) — sin esto, un colegio con color
        // de marca claro tendría texto ilegible sobre CTA/hero de marca.
        aplicarTemaColegio(res.data);
        if (res.data.favicon) {
          const link = document.getElementById('site-favicon');
          if (link) link.href = resolverUrlMedia(res.data.favicon);
        }
      })
      .catch(() => {
        // Fallback silencioso: se usan los tokens por defecto de index.css.
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <ConfiguracionContext.Provider value={{ configuracion, cargando }}>
      {children}
    </ConfiguracionContext.Provider>
  );
};
