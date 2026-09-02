import { useBranding } from '../../context/BrandingContext';

// Adaptador delgado sobre el BrandingContext compartido (antes pegaba a su
// propio endpoint, duplicando el fetch que ya hacen PortalLayout y
// useWebPush). Se conserva el shape { nombre_colegio, logo_url } para no
// tocar a los consumidores existentes (DesktopRail.jsx, DocenteLayout.jsx).
export function useConfigColegio() {
  const { nombreColegio, logoUrl } = useBranding();
  return { nombre_colegio: nombreColegio, logo_url: logoUrl };
}
