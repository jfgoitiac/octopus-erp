import { useContext, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import { PortalAuthProvider } from './portal/context/PortalAuthContext';
import { SedeProvider } from './context/SedeContext';
import PortalProtectedRoute from './portal/components/PortalProtectedRoute';
import PortalLayout from './portal/components/PortalLayout';
import Cobranza from './pages/Cobranza';
import CobranzaDashboard from './pages/CobranzaDashboard';
import Comprobantes from './pages/Comprobantes';
import Inscripciones from './pages/Inscripciones';
import ListaAlumnos from './pages/ListaAlumnos';
import Nomina from './pages/Nomina';
import Auditoria from './pages/Auditoria';
import Reportes from './pages/Reportes';
import Sistemas from './pages/Sistemas';
import { AuthContext } from './context/AuthContext';
import MainLayout from './components/MainLayout';
import Configuracion from './pages/Configuracion';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Representantes from './pages/Representantes';
import Morosos from './pages/Morosos';
import Grados from './pages/Grados';
import Conciliador from './pages/Conciliador';
import Recibos from './pages/Recibos';
import Notas from './pages/Notas';
import Boletin from './pages/Boletin';
import Asistencia from './pages/Asistencia';
import Horarios from './pages/Horarios';

// Portal de Representantes — lazy loaded
const PortalLogin = lazy(() => import('./portal/pages/PortalLogin'));
const PortalDashboard = lazy(() => import('./portal/pages/PortalDashboard'));
const PortalHistorialPagos = lazy(() => import('./portal/pages/PortalHistorialPagos'));
const PortalCambiarContrasena = lazy(() => import('./portal/pages/PortalCambiarContrasena'));

// Multi-Sede — lazy loaded
const MultiSedeDashboard = lazy(() => import('./pages/MultiSedeDashboard'));
const SedeDetalle = lazy(() => import('./pages/SedeDetalle'));
const GestionSedes = lazy(() => import('./pages/GestionSedes'));

// Configuración de Notificaciones — lazy loaded
const ConfiguracionNotificaciones = lazy(() => import('./pages/ConfiguracionNotificaciones'));

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 justify-center items-center h-screen" style={{ background: 'var(--bg)' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--pb)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Cargando sistema...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles) {
    return children;
  }

  const userRole = (user?.rol || '').toLowerCase().trim();

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <SedeProvider>
    <PortalAuthProvider>
    <Router>
      <Suspense fallback={
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="animate-spin" size={28} style={{ color: '#0fa3b1' }} />
        </div>
      }>
      <Routes>
        {/* ── Rutas del Portal de Representantes ── */}
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route
          path="/portal"
          element={
            <PortalProtectedRoute>
              <PortalLayout />
            </PortalProtectedRoute>
          }
        >
          <Route index element={<PortalDashboard />} />
          <Route path="historial" element={<PortalHistorialPagos />} />
          <Route path="cambiar-contrasena" element={<PortalCambiarContrasena />} />
        </Route>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />

          <Route path="inscripciones" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'secretaria']}>
              <Inscripciones />
            </ProtectedRoute>
          } />

          <Route path="cobranza/dashboard" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'cobranza']}>
              <CobranzaDashboard />
            </ProtectedRoute>
          } />

          <Route path="cobranza" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'cobranza', 'cajero']}>
              <Cobranza />
            </ProtectedRoute>
          } />

          <Route path="comprobantes" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'cobranza', 'cajero']}>
              <Comprobantes />
            </ProtectedRoute>
          } />

          <Route path="alumnos" element={<ListaAlumnos />} />

          <Route path="grados" element={<Grados />} />

          <Route path="morosos" element={
            <ProtectedRoute allowedRoles={['director', 'administrador', 'secretaria', 'cajero', 'sistemas']}>
              <Morosos />
            </ProtectedRoute>
          } />

          <Route path="representantes" element={
            <ProtectedRoute allowedRoles={['director', 'administrador', 'secretaria', 'cajero']}>
              <Representantes />
            </ProtectedRoute>
          } />
          <Route path="reportes" element={<Reportes />} />

          <Route path="sistemas" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <Sistemas />
            </ProtectedRoute>
          } />

          <Route path="nomina" element={<Nomina />} />

          <Route path="recibos" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <Recibos />
            </ProtectedRoute>
          } />


          <Route path="conciliador" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'cobranza']}>
              <Conciliador />
            </ProtectedRoute>
          } />

          <Route path="auditoria" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <Auditoria />
            </ProtectedRoute>
          } />

          <Route path="configuracion" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <Configuracion />
            </ProtectedRoute>
          } />

          <Route path="configuracion/notificaciones" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <ConfiguracionNotificaciones />
            </ProtectedRoute>
          } />

          {/* ── Módulo Académico ── */}
          <Route path="notas" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'secretaria']}>
              <Notas />
            </ProtectedRoute>
          } />
          <Route path="boletin" element={
            <ProtectedRoute allowedRoles={['director', 'administrador']}>
              <Boletin />
            </ProtectedRoute>
          } />
          <Route path="asistencia" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador', 'secretaria']}>
              <Asistencia />
            </ProtectedRoute>
          } />
          <Route path="horarios" element={
            <ProtectedRoute allowedRoles={['director', 'sistemas', 'administrador']}>
              <Horarios />
            </ProtectedRoute>
          } />

          {/* ── Módulo Multi-Sede ── */}
          <Route path="multisede" element={
            <ProtectedRoute allowedRoles={['directivo_red','director']}>
              <MultiSedeDashboard />
            </ProtectedRoute>
          } />
          <Route path="multisede/sedes" element={
            <ProtectedRoute allowedRoles={['directivo_red']}>
              <GestionSedes />
            </ProtectedRoute>
          } />
          <Route path="multisede/:sedeId" element={
            <ProtectedRoute allowedRoles={['directivo_red','director']}>
              <SedeDetalle />
            </ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>

      <ToastContainer
        position="bottom-right"
        autoClose={5500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </Router>
    </PortalAuthProvider>
    </SedeProvider>
  );
}

export default App;
