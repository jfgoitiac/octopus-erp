import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import { ROLE_GROUPS, ROLES } from './constants/roles';
import AppProviders from './components/AppProviders';
import ProtectedRoute from './components/ProtectedRoute';
import PortalProtectedRoute from './portal/components/PortalProtectedRoute';
import PortalLayout from './portal/components/PortalLayout';
import DocenteLayout from './portal-docente/components/DocenteLayout';
import CantinaLayout from './cantina/components/CantinaLayout';
import MainLayout from './components/MainLayout';
import BrandingHead from './components/BrandingHead';

// ── Portal de Representantes ──────────────────────────────────────────────────
const PortalLogin              = lazy(() => import('./portal/pages/PortalLogin'));
const PortalOlvideContrasena   = lazy(() => import('./portal/pages/PortalOlvideContrasena'));
const PortalRestablecerContrasena = lazy(() => import('./portal/pages/PortalRestablecerContrasena'));
const PortalDashboard          = lazy(() => import('./portal/pages/PortalDashboard'));
const PortalHistorialPagos     = lazy(() => import('./portal/pages/PortalHistorialPagos'));
const PortalCambiarContrasena  = lazy(() => import('./portal/pages/PortalCambiarContrasena'));
const PortalComunicaciones     = lazy(() => import('./portal/pages/PortalComunicaciones'));
const PortalMensajes           = lazy(() => import('./portal/pages/PortalMensajes'));
const PortalRendimiento        = lazy(() => import('./portal/pages/PortalRendimiento'));
const PortalPerfil             = lazy(() => import('./portal/pages/PortalPerfil'));
const PortalCantina            = lazy(() => import('./portal/pages/PortalCantina'));

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
const Materias                 = lazy(() => import('./pages/Materias'));
const Docentes                 = lazy(() => import('./pages/Docentes'));
const Incidentes               = lazy(() => import('./pages/Incidentes'));
const Rendimiento              = lazy(() => import('./pages/Rendimiento'));

// ── Módulo Comunicación ────────────────────────────────────────────────────────
const Comunicacion             = lazy(() => import('./pages/Comunicacion'));

// ── Módulo Sitio Institucional (CMS) ───────────────────────────────────────────
const GestionSitio             = lazy(() => import('./pages/GestionSitio'));

// ── Portal Docente (login unificado con el resto del staff — ver /login) ──────
const DocenteDashboard         = lazy(() => import('./portal-docente/pages/DocenteDashboard'));
const DocenteMaterias          = lazy(() => import('./portal-docente/pages/DocenteMaterias'));
const DocenteMateriaDetalle    = lazy(() => import('./portal-docente/pages/DocenteMateriaDetalle'));
const DocenteMensajes          = lazy(() => import('./portal-docente/pages/DocenteMensajes'));
const DocenteIncidentes        = lazy(() => import('./portal-docente/pages/DocenteIncidentes'));
const DocenteCambiarContrasena = lazy(() => import('./portal-docente/pages/DocenteCambiarContrasena'));
const DocentePerfil            = lazy(() => import('./portal-docente/pages/DocentePerfil'));

// ── Módulo Cantina (login unificado con el resto del staff — ver /login) ──────
const CantinaPOS               = lazy(() => import('./cantina/pages/CantinaPOS'));
const CantinaInventario        = lazy(() => import('./cantina/pages/CantinaInventario'));
const CantinaTarjetas          = lazy(() => import('./cantina/pages/CantinaTarjetas'));
const CantinaCierreCaja        = lazy(() => import('./cantina/pages/CantinaCierreCaja'));
const CantinaReportes          = lazy(() => import('./cantina/pages/CantinaReportes'));
const CantinaMorosos           = lazy(() => import('./cantina/pages/CantinaMorosos'));

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
        <BrandingHead />
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>

            {/* ── Portal de Representantes ── */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/olvide-contrasena" element={<PortalOlvideContrasena />} />
            <Route path="/portal/restablecer-password" element={<PortalRestablecerContrasena />} />
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
              <Route path="perfil" element={<PortalPerfil />} />
              <Route path="cantina" element={<PortalCantina />} />
            </Route>

            {/* ── Portal Docente (login unificado — ver /login) ── */}
            <Route
              path="/portal-docente"
              element={
                <ProtectedRoute allowedRoles={[ROLES.DOCENTE]}>
                  <DocenteLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DocenteDashboard />} />
              <Route path="materias" element={<DocenteMaterias />} />
              <Route path="materias/:materiaId" element={<DocenteMateriaDetalle />} />
              <Route path="mensajes" element={<DocenteMensajes />} />
              <Route path="incidentes" element={<DocenteIncidentes />} />
              <Route path="cambiar-contrasena" element={<DocenteCambiarContrasena />} />
              <Route path="perfil" element={<DocentePerfil />} />
            </Route>

            {/* ── Cantina (login unificado — ver /login) ── */}
            <Route
              path="/cantina"
              element={
                <ProtectedRoute allowedRoles={['cajero', 'administrador', 'director']}>
                  <CantinaLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="inventario" replace />} />
              {/* Decisión explícita del cliente: el Cajero opera la cantina de
                  punta a punta (inventario, tarjetas, reportes incluidos), no
                  solo POS/Cierre como asumía el borrador original de
                  cantina.md §2/§6.1 — todas las rutas usan el mismo set de
                  roles. */}
              <Route path="inventario" element={<CantinaInventario />} />
              <Route path="pos" element={<CantinaPOS />} />
              <Route path="tarjetas" element={<CantinaTarjetas />} />
              <Route path="cierre" element={<CantinaCierreCaja />} />
              <Route path="reportes" element={<CantinaReportes />} />
              <Route path="morosos" element={<CantinaMorosos />} />
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
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA]}>
                  <Notas />
                </ProtectedRoute>
              } />
              <Route path="boletin" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR]}>
                  <Boletin />
                </ProtectedRoute>
              } />
              <Route path="asistencia" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA]}>
                  <Asistencia />
                </ProtectedRoute>
              } />
              <Route path="horarios" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Horarios />
                </ProtectedRoute>
              } />
              <Route path="materias" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Materias />
                </ProtectedRoute>
              } />
              <Route path="docentes" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <Docentes />
                </ProtectedRoute>
              } />
              <Route path="incidentes" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.SECRETARIA]}>
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
              {/* Módulo Sitio Institucional (CMS) */}
              <Route path="gestion-sitio" element={
                <ProtectedRoute allowedRoles={[ROLES.DIRECTOR, ROLES.SISTEMAS]}>
                  <GestionSitio />
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
