import { createContext, useContext } from 'react';

export const DEFAULTS = {
  nombreColegio: '',
  colorPrimario: '#0fa3b1',
  colorSecundario: '#1f3864',
  logoUrl: '',
  tituloWeb: '',
  descripcionWeb: '',
  faviconUrl: '',
  vapidPublicKey: '',
  nombreApp: '',
  iconoAppUrl: '',
};

export const BrandingContext = createContext({ ...DEFAULTS, loading: true, refreshBranding: () => {} });

export const useBranding = () => useContext(BrandingContext);
