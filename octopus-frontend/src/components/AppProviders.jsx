import { SedeProvider } from '../context/SedeContext';
import { PortalAuthProvider } from '../portal/context/PortalAuthContext';

const AppProviders = ({ children }) => (
  <SedeProvider>
    <PortalAuthProvider>
      {children}
    </PortalAuthProvider>
  </SedeProvider>
);

export default AppProviders;
