import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

// Mapping de rol a primera ruta accesible
const FIRST_ACCESSIBLE_ROUTE = {
  'director': '/dashboard',
  'cobranza': '/dashboard',
  'administrador': '/dashboard',
  'sistemas': '/cobranza/dashboard',
  'secretaria': '/inscripciones',
  'cajero': '/cobranza',
  'directivo_red': '/multisede',
  'docente': '/alumnos',
};

/**
 * Protege rutas del panel administrativo.
 * - Sin allowedRoles: cualquier usuario autenticado puede entrar.
 * - Con allowedRoles: solo los roles listados; el resto ve un redirect a "/".
 */
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div
        className="flex flex-col gap-3 justify-center items-center h-screen"
        style={{ background: 'var(--bg)' }}
      >
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--pb)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>
          Cargando sistema...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const userRole = (user?.rol || '').toLowerCase().trim();
    if (!allowedRoles.includes(userRole)) {
      const fallbackRoute = FIRST_ACCESSIBLE_ROUTE[userRole] || '/dashboard';
      return <Navigate to={fallbackRoute} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
