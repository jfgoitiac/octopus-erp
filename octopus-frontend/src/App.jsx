import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import { ROLE_GROUPS, ROLES } from './constants/roles';
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
const PortalComunicaciones     = lazy(() => import('./portal/pages/PortalComunicaciones'));
const PortalMensajes           = lazy(() => import('./portal/pages/PortalMensajes'));
const PortalRendimiento        = lazy(() => import('./portal/pages/PortalRendimiento'));

// ── Panel administrativo ──────────────────────────────────────────────────────
const Login                    = lazy(() => import('./pages/Login'));
const Dashboard                = lazy(() => import('./pages/Dashboard'));
const Inscripciones            = lazy(() => import('./pages/Inscripciones'));
const CobranzaDashboard        = lazy(() => import('./pages/CobranzaDashboard'));
const Cobranza                 = lazy(() => import('./pages/Cobranza'));
const Comprobantes             = lazy(() => import('./pages/Comprobantes'));
const ConsultaSolvencia        = lazy(() => import('./pages/ConsultaSolvencia'));
const ListaAlumnos             = lazy(() => import('./pages/ListaAlumnos'));
const ConsultaInscripcion      = lazy(() => import('./pages/ConsultaInscripcion'));
const Preinscripcion           = lazy(() => import('./pages/Preinscripcion'));
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
const Incidentes               = lazy(() => import('./pages/Incidentes'));
const Rendimiento              = lazy(() => import('./pages/Rendimiento'));

// ── Módulo Comunicación ────────────────────────────────────────────────────────
const Comunicacion             = lazy(() => import('./pages/Comunicacion'));
const Mensajes                 = lazy(() => import('./pages/Mensajes'));

// ── Portal Docente (Fase 3) ─────────────────────────────────────────────────────
const MisMaterias              = lazy(() => import('./pages/MisMaterias'));
const GestionMateria           = lazy(() => import('./pages/GestionMateria'));

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
              <Route path="comunicaciones" element={<PortalComunicaciones />} />
              <Route path="mensajes" element={<PortalMensajes />} />
              <Route path="rendimiento" element={<PortalRendimiento />} />
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
              <Route path="dashboard" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.COBRANZA]}>
                  <Dashboard />
                </ProtectedRoute>
              } />

              {/* Gestión de alumnos */}
              <Route path="inscripciones" element={
                <ProtectedRoute allowedRoles={[...ROLE_GROUPS.SECRETARIA_ADMIN, ROLES.DOCENTE]}>
                  <Inscripciones />
                </ProtectedRoute>
              } />
              <Route path="alumnos" element={
                <ProtectedRoute allowedRoles={[...ROLE_GROUPS.STAFF_SEDE, ROLES.DOCENTE]}>
                  <ListaAlumnos />
                </ProtectedRoute>
              } />
              <Route path="grados" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Grados />
                </ProtectedRoute>
              } />
              <Route path="consulta-inscripcion" element={
                <ProtectedRoute>
                  <ConsultaInscripcion />
                </ProtectedRoute>
              } />
              <Route path="preinscripcion" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.SECRETARIA_ADMIN}>
                  <Preinscripcion />
                </ProtectedRoute>
              } />
              <Route path="representantes" element={
                <ProtectedRoute allowedRoles={[...ROLE_GROUPS.ATENCION_FAMILIAS, ROLES.DOCENTE]}>
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
              <Route path="cobranza/solvencia" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.TODOS}>
                  <ConsultaSolvencia />
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
                <ProtectedRoute allowedRoles={ROLE_GROUPS.FINANZAS}>
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
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Sistemas />
                </ProtectedRoute>
              } />
              <Route path="auditoria" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR]}>
                  <Auditoria />
                </ProtectedRoute>
              } />
              <Route path="configuracion" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Configuracion />
                </ProtectedRoute>
              } />
              <Route path="configuracion/notificaciones" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <ConfiguracionNotificaciones />
                </ProtectedRoute>
              } />

              {/* Módulo Académico */}
              <Route path="notas" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA, ROLES.DOCENTE]}>
                  <Notas />
                </ProtectedRoute>
              } />
              <Route path="mis-materias" element={
                <ProtectedRoute allowedRoles={[ROLES.DOCENTE]}>
                  <MisMaterias />
                </ProtectedRoute>
              } />
              <Route path="mis-materias/:materiaId" element={
                <ProtectedRoute allowedRoles={[ROLES.DOCENTE]}>
                  <GestionMateria />
                </ProtectedRoute>
              } />
              <Route path="boletin" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR]}>
                  <Boletin />
                </ProtectedRoute>
              } />
              <Route path="asistencia" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA, ROLES.DOCENTE]}>
                  <Asistencia />
                </ProtectedRoute>
              } />
              <Route path="horarios" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Horarios />
                </ProtectedRoute>
              } />
              <Route path="incidentes" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA, ROLES.DOCENTE]}>
                  <Incidentes />
                </ProtectedRoute>
              } />
              <Route path="rendimiento" element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN_CENTRAL}>
                  <Rendimiento />
                </ProtectedRoute>
              } />

              {/* Módulo Comunicación */}
              <Route path="comunicacion" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR]}>
                  <Comunicacion />
                </ProtectedRoute>
              } />
              <Route path="mensajes" element={
                <ProtectedRoute allowedRoles={[ROLES.DOCENTE]}>
                  <Mensajes />
                </ProtectedRoute>
              } />

              {/* Módulo Multi-Sede */}
              <Route path="multisede" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTIVO_RED, ROLES.DIRECTOR]}>
                  <MultiSedeDashboard />
                </ProtectedRoute>
              } />
              <Route path="multisede/sedes" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTIVO_RED]}>
                  <GestionSedes />
                </ProtectedRoute>
              } />
              <Route path="multisede/:sedeId" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTIVO_RED, ROLES.DIRECTOR]}>
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
