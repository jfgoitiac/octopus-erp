import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import { ROLE_GROUPS } from './constants/roles';
import AppProviders from './components/AppProviders';
import ProtectedRoute from './components/ProtectedRoute';
import PortalProtectedRoute from './portal/components/PortalProtectedRoute';
import PortalLayout from './portal/components/PortalLayout';
import MainLayout from './components/MainLayout';

// ── Portal de Representantes ──────────────────────────────────────────────────
const PortalLogin              = lazy(() => import('./portal/pages/PortalLogin'));
const PortalDashboard          = lazy(() => import('./portal/pages/PortalDashboard'));
const PortalHistorialPagos     = lazy(() => import('./portal/pages/PortalHistorialPagos'));
const PortalCambiarContrasena  = lazy(() => import('./portal/pages/PortalCambiarContrasena'));

// ── Panel administrativo ──────────────────────────────────────────────────────
const Login                    = lazy(() => import('./pages/Login'));
const Dashboard                = lazy(() => import('./pages/Dashboard'));
const Inscripciones            = lazy(() => import('./pages/Inscripciones'));
const CobranzaDashboard        = lazy(() => import('./pages/CobranzaDashboard'));
const Cobranza                 = lazy(() => import('./pages/Cobranza'));
const Comprobantes             = lazy(() => import('./pages/Comprobantes'));
const ListaAlumnos             = lazy(() => import('./pages/ListaAlumnos'));
const Grados                   = lazy(() => import('./pages/Grados'));
const Morosos                  = lazy(() => import('./pages/Morosos'));
const Representantes           = lazy(() => import('./pages/Representantes'));
const Reportes                 = lazy(() => import('./pages/Reportes'));
const Sistemas                 = lazy(() => import('./pages/Sistemas'));
const Nomina                   = lazy(() => import('./pages/Nomina'));
const Pagos                    = lazy(() => import('./pages/Pagos'));
const Recibos                  = lazy(() => import('./pages/Recibos'));
const Conciliador              = lazy(() => import('./pages/Conciliador'));
const Auditoria                = lazy(() => import('./pages/Auditoria'));
const Configuracion            = lazy(() => import('./pages/Configuracion'));
const ConfiguracionNotificaciones = lazy(() => import('./pages/ConfiguracionNotificaciones'));

// ── Módulo Académico ──────────────────────────────────────────────────────────
const Notas                    = lazy(() => import('./pages/Notas'));
const Boletin                  = lazy(() => import('./pages/Boletin'));
const Asistencia               = lazy(() => import('./pages/Asistencia'));
const Horarios                 = lazy(() => import('./pages/Horarios'));

// ── Módulo Multi-Sede ─────────────────────────────────────────────────────────
const MultiSedeDashboard       = lazy(() => import('./pages/MultiSedeDashboard'));
const SedeDetalle              = lazy(() => import('./pages/SedeDetalle'));
const GestionSedes             = lazy(() => import('./pages/GestionSedes'));

// ── 404 ───────────────────────────────────────────────────────────────────────
const NotFound                 = lazy(() => import('./pages/NotFound'));

const SuspenseFallback = () => (
  <div
    className="flex flex-col gap-3 justify-center items-center h-screen"
    style={{ background: 'var(--bg)' }}
  >
    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--pb)' }} />
    <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>
      Cargando...
    </span>
  </div>
);

function App() {
  return (
    <AppProviders>
      <Router>
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>

            {/* ── Portal de Representantes ── */}
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

            {/* ── Autenticación admin ── */}
            <Route path="/login" element={<Login />} />

            {/* ── Panel administrativo (requiere auth) ── */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />

              {/* Gestión de alumnos */}
              <Route path="inscripciones" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Inscripciones />
                </ProtectedRoute>
              } />
              <Route path="alumnos" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.STAFF_SEDE}>
                  <ListaAlumnos />
                </ProtectedRoute>
              } />
              <Route path="grados" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Grados />
                </ProtectedRoute>
              } />
              <Route path="representantes" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ATENCION_FAMILIAS}>
                  <Representantes />
                </ProtectedRoute>
              } />
              <Route path="morosos" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.MORA}>
                  <Morosos />
                </ProtectedRoute>
              } />

              {/* Cobranza */}
              <Route path="cobranza/dashboard" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.FINANZAS}>
                  <CobranzaDashboard />
                </ProtectedRoute>
              } />
              <Route path="cobranza" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.CAJA}>
                  <Cobranza />
                </ProtectedRoute>
              } />
              <Route path="comprobantes" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.CAJA}>
                  <Comprobantes />
                </ProtectedRoute>
              } />
              <Route path="conciliador" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.FINANZAS}>
                  <Conciliador />
                </ProtectedRoute>
              } />
              <Route path="recibos" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Recibos />
                </ProtectedRoute>
              } />

              {/* Reportes y nómina */}
              <Route path="reportes" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Reportes />
                </ProtectedRoute>
              } />
              <Route path="nomina" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Nomina />
                </ProtectedRoute>
              } />
              <Route path="pagos" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Pagos />
                </ProtectedRoute>
              } />

              {/* Administración del sistema */}
              <Route path="sistemas" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Sistemas />
                </ProtectedRoute>
              } />
              <Route path="auditoria" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Auditoria />
                </ProtectedRoute>
              } />
              <Route path="configuracion" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Configuracion />
                </ProtectedRoute>
              } />
              <Route path="configuracion/notificaciones" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <ConfiguracionNotificaciones />
                </ProtectedRoute>
              } />

              {/* Módulo Académico */}
              <Route path="notas" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Notas />
                </ProtectedRoute>
              } />
              <Route path="boletin" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Boletin />
                </ProtectedRoute>
              } />
              <Route path="asistencia" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Asistencia />
                </ProtectedRoute>
              } />
              <Route path="horarios" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Horarios />
                </ProtectedRoute>
              } />

              {/* Módulo Multi-Sede */}
              <Route path="multisede" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.RED_DIRECTIVA}>
                  <MultiSedeDashboard />
                </ProtectedRoute>
              } />
              <Route path="multisede/sedes" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SOLO_RED}>
                  <GestionSedes />
                </ProtectedRoute>
              } />
              <Route path="multisede/:sedeId" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.RED_DIRECTIVA}>
                  <SedeDetalle />
                </ProtectedRoute>
              } />

              {/* 404 dentro del panel */}
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* 404 global (rutas fuera del panel) */}
            <Route path="*" element={<Navigate to="/login" replace />} />

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
    </AppProviders>
  );
}

export default App;
