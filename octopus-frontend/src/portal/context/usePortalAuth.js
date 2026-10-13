import { createContext, useContext } from 'react';

export const PortalAuthContext = createContext(null);

export const usePortalAuth = () => useContext(PortalAuthContext);
