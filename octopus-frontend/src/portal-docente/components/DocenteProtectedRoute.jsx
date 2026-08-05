import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { DocenteAuthContext } from '../context/DocenteAuthContext';

// Skeleton fullscreen mientras carga
const FullscreenSkeleton = () => (
  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
    <div className="w-full max-w-[480px] space-y-4 animate-pulse">
      <div className="h-10 bg-gray-200 rounded-xl w-3/4 mx-auto" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
      <div className="mt-8 space-y-3">
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-16 bg-gray-200 rounded-2xl" />
      </div>
    </div>
  </div>
);

const isTokenValid = (token) => {
  if (!token) return false;
  try {
    const decoded = jwtDecode(token);
    return decoded.exp && decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const DocenteProtectedRoute = ({ children }) => {
  const { loading } = useContext(DocenteAuthContext);

  if (loading) {
    return <FullscreenSkeleton />;
  }

  const token = localStorage.getItem('docente_token');
  if (!isTokenValid(token)) {
    return <Navigate to="/portal-docente/login" replace />;
  }

  return children;
};

export default DocenteProtectedRoute;
