import { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
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
    <Router>
      <Routes>
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
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      <ToastContainer
        position="bottom-right"
        autoClose={5500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        toastStyle={{
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          fontSize: '13px',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(43,48,58,0.13)',
          border: '0.5px solid rgba(43,48,58,0.10)',
          color: '#2b303a',
          background: '#fffffa',
          minWidth: '280px',
        }}
        progressStyle={{ background: '#0fa3b1' }}
      />
    </Router>
  );
}

export default App;