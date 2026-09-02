import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

// Cliente dedicado y sin interceptores: este endpoint es público y lo golpean
// las tres zonas (panel admin, portal de representantes, portal docente),
// incluidas sus pantallas de login SIN autenticar. Si usáramos apiClient o
// portalClient aquí, sus interceptores de 401/refresh podrían disparar una
// redirección a /login o /portal/login ante un fallo transitorio de este
// endpoint — un efecto secundario que no tiene nada que ver con la sesión
// del usuario. Por eso este cliente no adjunta Authorization ni maneja 401.
const brandingClient = axios.create({
  baseURL: `${API_BASE}/api/portal/`,
  timeout: 10000,
});

// El logo/favicon pueden venir como URL externa absoluta o como ruta relativa
// de Django media (ej. "/media/configuracion/logos/x.png") — en ese segundo
// caso hay que anteponerle el host de la API porque el frontend corre en otro
// origen en desarrollo (Vite en :5173 vs Django en :8000).
const resolverUrl = (url) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;
};

const DEFAULTS = {
  nombreColegio: '',
  colorPrimario: '#0fa3b1',
  colorSecundario: '#1f3864',
  logoUrl: '',
  tituloWeb: '',
  descripcionWeb: '',
  faviconUrl: '',
  vapidPublicKey: '',
};

const BrandingContext = createContext({ ...DEFAULTS, loading: true, refreshBranding: () => {} });

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async (signal) => {
    setLoading(true);
    try {
      const { data } = await brandingClient.get('config-colegio/', signal ? { signal } : undefined);
      const next = {
        nombreColegio: data.nombre_colegio || '',
        colorPrimario: data.color_primario || DEFAULTS.colorPrimario,
        colorSecundario: data.color_secundario || DEFAULTS.colorSecundario,
        logoUrl: resolverUrl(data.logo_url),
        tituloWeb: data.titulo_web || '',
        descripcionWeb: data.descripcion_web || '',
        faviconUrl: resolverUrl(data.favicon_url),
        vapidPublicKey: data.vapid_public_key || '',
      };
      setBranding(next);

      const root = document.documentElement;
      root.style.setProperty('--portal-primary', next.colorPrimario);
      root.style.setProperty('--portal-secondary', next.colorSecundario);
    } catch {
      // Si falla, se mantienen los valores/colores por defecto.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchBranding(controller.signal);
    return () => controller.abort();
  }, [fetchBranding]);

  const value = useMemo(
    () => ({ ...branding, loading, refreshBranding: () => fetchBranding() }),
    [branding, loading, fetchBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

export const useBranding = () => useContext(BrandingContext);
