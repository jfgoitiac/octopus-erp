import { useState, useEffect } from 'react';
import { getConfigColegio } from '../api/colegio.service';
import { API_BASE } from '../../api/apiClient';

// El logo puede venir como URL externa absoluta (ConfiguracionSistema.logo_url)
// o como ruta relativa de Django media (ConfiguracionSistema.logo_colegio,
// ej. "/media/configuracion/logos/x.png") — en ese segundo caso hay que
// anteponerle el host de la API, porque el frontend corre en otro origen en
// desarrollo (Vite en :5173 vs Django en :8000) y una ruta relativa se
// resolvería contra el origen equivocado.
const resolverUrlLogo = (logoUrl) => {
  if (!logoUrl) return '';
  return /^https?:\/\//i.test(logoUrl) ? logoUrl : `${API_BASE}${logoUrl}`;
};

// Nombre/logo del colegio para reemplazar el ícono genérico (birrete) por la
// identidad visual real cuando el colegio tiene un logo configurado. Mismo
// patrón que src/portal/components/PortalLayout.jsx (fallback silencioso a
// los valores por defecto si el request falla — no es información crítica).
export function useConfigColegio() {
  const [configColegio, setConfigColegio] = useState({
    nombre_colegio: '',
    logo_url: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    getConfigColegio(controller.signal)
      .then(res => setConfigColegio({
        ...res.data,
        logo_url: resolverUrlLogo(res.data?.logo_url),
      }))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return configColegio;
}
