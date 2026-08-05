import { SedeProvider } from '../context/SedeContext';
import { PortalAuthProvider } from '../portal/context/PortalAuthContext';
import { DocenteAuthProvider } from '../portal-docente/context/DocenteAuthContext';

const AppProviders = ({ children }) => (
  <SedeProvider>
    <PortalAuthProvider>
      <DocenteAuthProvider>
        {children}
      </DocenteAuthProvider>
    </PortalAuthProvider>
  </SedeProvider>
);

export default AppProviders;
