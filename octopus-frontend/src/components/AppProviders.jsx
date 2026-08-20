import { SedeProvider } from '../context/SedeContext';
import { PortalAuthProvider } from '../portal/context/PortalAuthContext';

// AuthProvider (staff: admin/docente/cajero — login unificado) ya envuelve
// <App /> en main.jsx. PortalAuthProvider sigue separado acá: es el portal
// de representantes, con su propio modelo/JWT, y no se toca.
const AppProviders = ({ children }) => (
  <SedeProvider>
    <PortalAuthProvider>
      {children}
    </PortalAuthProvider>
  </SedeProvider>
);

export default AppProviders;
