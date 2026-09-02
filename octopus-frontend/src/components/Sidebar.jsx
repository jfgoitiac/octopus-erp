import { useContext, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AuthContext } from '../context/AuthContext';
import { useSede } from '../context/SedeContext';
import { useConfiguracion } from '../hooks/useConfiguracion';
import { useSidebarPrefs } from '../hooks/useSidebarPrefs';
import SedeSwitcher from './SedeSwitcher';
import logoColegioFallback from '../assets/logo-colegio.png';
import {
  LayoutDashboard, UserPlus, Users, Calculator,
  BarChart3, Wrench, ShieldCheck,
  Loader2, Banknote, CreditCard, Monitor, Contact, AlertTriangle, GraduationCap, ReceiptText, GitCompareArrows, FileText,
  BookOpen, CalendarCheck, Clock, Building2, Bell, X, BadgeCheck, FileSearch, ShieldAlert, Megaphone, Globe,
  Pin, PinOff, ChevronDown
} from 'lucide-react';

const TODOS_LOS_ROLES = ['director', 'sistemas', 'administrador', 'cobranza', 'cajero', 'secretaria', 'directivo_red', 'docente'];

const navSections = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard',     path: '/dashboard',     icon: LayoutDashboard, roles: ['director','cobranza','administrador'] },
      { name: 'Alumnos',        path: '/alumnos',        icon: Users,           roles: ['director','administrador','cobranza'] },
      { name: 'Morosos',        path: '/morosos',        icon: AlertTriangle,   roles: ['director','administrador','secretaria','cajero','cobranza'] },
      { name: 'Representantes', path: '/representantes', icon: Contact,         roles: ['director','administrador','secretaria','cajero','cobranza'] },
      { name: 'Inscripciones', path: '/inscripciones', icon: UserPlus,        roles: ['director','administrador','secretaria'] },
      { name: 'Grados',        path: '/grados',        icon: GraduationCap,   roles: ['director','administrador','secretaria'] },
      { name: 'Consulta de Inscripción', path: '/consulta-inscripcion', icon: FileSearch, roles: TODOS_LOS_ROLES },
      { name: 'Pre-Inscripción', path: '/preinscripcion', icon: FileText, roles: ['director','administrador','secretaria'] },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cobranza',      path: '/cobranza',      icon: Calculator,   roles: ['director','cobranza','administrador','cajero'] },
      { name: 'Comprobantes',  path: '/comprobantes',  icon: ReceiptText,  roles: ['director','cobranza','administrador','cajero'] },
      { name: 'Solvencia',     path: '/cobranza/solvencia', icon: BadgeCheck, roles: TODOS_LOS_ROLES },
      { name: 'Reportes',      path: '/reportes',      icon: BarChart3,    roles: ['director','cobranza','administrador'] },
      { name: 'Nómina',        path: '/nomina',        icon: Banknote,          roles: ['director','administrador'] },
      { name: 'Pagos',         path: '/pagos',         icon: CreditCard,        roles: ['director','administrador'] },
      { name: 'Recibos',       path: '/recibos',       icon: FileText,          roles: ['director','administrador'] },
      { name: 'Conciliador',  path: '/conciliador',   icon: GitCompareArrows,  roles: ['director','administrador','cobranza'] },
    ],
  },
  {
    label: 'Académico',
    items: [
      { name: 'Notas',      path: '/notas',      icon: BookOpen,      roles: ['director', 'secretaria'] },
      { name: 'Boletines',  path: '/boletin',    icon: FileText,      roles: ['director'] },
      { name: 'Asistencia', path: '/asistencia', icon: CalendarCheck, roles: ['director', 'secretaria'] },
      { name: 'Incidentes', path: '/incidentes', icon: ShieldAlert,   roles: ['director', 'secretaria'] },
      { name: 'Horarios',   path: '/horarios',   icon: Clock,         roles: ['director'] },
      { name: 'Materias',   path: '/materias',   icon: BookOpen,       roles: ['director'] },
      { name: 'Docentes',   path: '/docentes',   icon: BadgeCheck,     roles: ['director'] },
      { name: 'Rendimiento', path: '/rendimiento', icon: BarChart3,   roles: ['director', 'administrador'] },
    ],
  },
  {
    label: 'Comunicación',
    items: [
      { name: 'Circulares', path: '/comunicacion', icon: Megaphone, roles: ['director', 'administrador'] },
    ],
  },
  {
    label: 'Multi-Sede',
    items: [
      { name: 'Dashboard Sedes', path: '/multisede',       icon: Building2, roles: ['directivo_red','director'] },
      { name: 'Gestión de Sedes', path: '/multisede/sedes', icon: Building2, roles: ['directivo_red'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Sitio Institucional', path: '/gestion-sitio', icon: Globe, roles: ['director','sistemas'] },
      { name: 'Configuración', path: '/configuracion', icon: Wrench,    roles: ['director','sistemas'] },
      { name: 'Notificaciones', path: '/configuracion/notificaciones', icon: Bell, roles: ['director','sistemas'] },
      { name: 'Sistemas',  path: '/sistemas',  icon: Monitor,   roles: ['director','sistemas'] },
      { name: 'Auditoría', path: '/auditoria', icon: ShieldCheck, roles: ['director'] },
    ],
  },
];

const SIDEBAR_POS = 'top-[var(--topbar-h)] lg:top-[var(--topbar-h-lg)] h-[calc(100dvh-var(--topbar-h))] lg:h-[calc(100dvh-var(--topbar-h-lg))]';

const ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' };
const slugify = (label) =>
  label
    .toLowerCase()
    .replace(/[áéíóúñ]/g, (c) => ACENTOS[c])
    .replace(/[^a-z0-9]+/g, '-');

// Ítem de navegación único — usado tanto en los grupos como en la sección de Favoritos.
// El botón de fijar es hermano del Link (no anidado) para no meter un <button>
// interactivo dentro de un <a> interactivo.
const SidebarNavItem = ({ item, isActive, animationDelay, isFavorito, onToggleFavorito }) => {
  const Icon = item.icon;

  const handlePinClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorito(item);
  };

  return (
    <div className="group relative anim-fade-up" style={{ animationDelay }}>
      <Link
        to={item.path}
        className={`flex items-center gap-2.5 pl-3 pr-10 py-2.5 text-sm relative overflow-hidden transition-colors ${isActive ? '' : 'hover:bg-[var(--ash-light)]'}`}
        style={{
          borderRadius: 'var(--radius-card)',
          ...(isActive
            ? {
                background: 'var(--surface)',
                color: 'var(--jet)',
                fontWeight: 500,
                boxShadow: 'var(--shadow-sm)',
              }
            : { color: 'var(--jet-mid)' })
        }}
      >
        <Icon size={15} style={{ color: isActive ? 'var(--pb)' : 'var(--ash)', flexShrink: 0 }} />
        <span className="truncate">{item.name}</span>
      </Link>
      <button
        type="button"
        onClick={handlePinClick}
        aria-label={isFavorito ? `Quitar ${item.name} de favoritos` : `Fijar ${item.name} en favoritos`}
        className={`absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isFavorito ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
        }`}
        style={{ color: isFavorito ? 'var(--pb)' : 'var(--ash)', outlineColor: 'var(--pb)' }}
      >
        {isFavorito ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </div>
  );
};

const Sidebar = ({ open = false, onClose = () => {} }) => {
  const { user, loading } = useContext(AuthContext);
  const { sedes, sedeActiva, cambiarSede } = useSede();
  const { config } = useConfiguracion();
  const location = useLocation();
  const { favoritos, gruposColapsados, toggleFavorito, toggleGrupo, esFavorito } = useSidebarPrefs(user?.username);

  const userRole = (user?.rol || '').toLowerCase().trim();

  const handleToggleFavorito = (item) => {
    const yaEraFavorito = esFavorito(item.path);
    toggleFavorito(item.path);
    toast.success(yaEraFavorito ? `${item.name} quitado de favoritos` : `${item.name} fijado en favoritos`);
  };

  // Si el usuario navega hacia una ruta que vive dentro de un grupo colapsado,
  // se expande automáticamente para que vea dónde está parado. Esto NO pisa
  // un colapso manual mientras el usuario ya está dentro de ese grupo — solo
  // actúa al entrar a la ruta, así el botón de contraer siempre responde al click.
  useEffect(() => {
    const seccionActiva = navSections.find(section =>
      section.items.some(item =>
        item.roles.includes(userRole) &&
        (location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/'))
      )
    );
    if (seccionActiva && gruposColapsados.includes(seccionActiva.label)) {
      toggleGrupo(seccionActiva.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, userRole]);

  if (loading) return (
    <div
      className={`w-[var(--sidebar-w)] fixed left-0 z-40 flex items-center justify-center rounded-tl-[calc(var(--shell-radius)/2)] md:rounded-tl-[var(--shell-radius)] rounded-bl-[calc(var(--shell-radius)/2)] md:rounded-bl-[var(--shell-radius)] ${SIDEBAR_POS}`}
      style={{ background: 'var(--bg)' }}
    >
      <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
    </div>
  );

  if (!user) return null;

  return (
    <>
      {/* Overlay móvil */}
      <div
        className={`fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

    <div
      className={`w-[var(--sidebar-w)] flex flex-col fixed left-0 z-40 transition-transform duration-300 ease-in-out rounded-tl-[calc(var(--shell-radius)/2)] md:rounded-tl-[var(--shell-radius)] rounded-bl-[calc(var(--shell-radius)/2)] md:rounded-bl-[var(--shell-radius)] ${SIDEBAR_POS} ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-[18px] relative overflow-hidden flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {/* Fondo decorativo sutil */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 120% 100% at -10% 50%, var(--pb) 0%, transparent 65%)' }}
        />
        <img
          src={config.logo_colegio || config.logo_url || logoColegioFallback}
          alt="Logo del colegio"
          className="w-11 h-11 object-contain flex-shrink-0"
          onError={e => { e.target.src = logoColegioFallback; }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight break-words" style={{ color: 'var(--jet)' }}>
            {config.nombre_colegio || sedeActiva?.nombre || 'ERP v2'}
          </p>
        </div>
        {/* Botón cerrar — solo móvil */}
        <button
          className="md:hidden flex-shrink-0 p-1 rounded-lg"
          onClick={onClose}
          style={{ color: 'var(--ash)' }}
          aria-label="Cerrar menú"
        >
          <X size={16} />
        </button>
      </div>

      {/* Selector de sede (solo si hay más de 1) */}
      {sedes.length > 1 && (
        <div className="flex-shrink-0">
          <SedeSwitcher sedes={sedes} sedeActiva={sedeActiva} onCambiar={cambiarSede} />
        </div>
      )}

      {/* Navegación — única zona que scrollea */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2 custom-scrollbar">
        {(() => {
          const itemsVisiblesPorRol = navSections.flatMap(s => s.items.filter(item => item.roles.includes(userRole)));
          const favoritosVisibles = favoritos
            .map(path => itemsVisiblesPorRol.find(item => item.path === path))
            .filter(Boolean);
          const hayFavoritos = favoritosVisibles.length > 0;

          return (
            <>
              {hayFavoritos && (
                <div className="anim-slide-in mt-2">
                  <label
                    className="block text-xs uppercase tracking-widest px-3 py-2 font-medium"
                    style={{ color: 'var(--ash)' }}
                  >
                    Favoritos
                  </label>
                  <div className="space-y-0.5">
                    {favoritosVisibles.map((item, iIdx) => {
                      const isActive =
                        location.pathname === item.path ||
                        (item.path === '/dashboard' && location.pathname === '/');
                      return (
                        <SidebarNavItem
                          key={`fav-${item.path}`}
                          item={item}
                          isActive={isActive}
                          animationDelay={`${iIdx * 35}ms`}
                          isFavorito
                          onToggleFavorito={handleToggleFavorito}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {navSections.map((section, sIdx) => {
                const visible = section.items.filter(item => item.roles.includes(userRole));
                if (!visible.length) return null;
                const groupId = `sidebar-group-${slugify(section.label)}`;
                const colapsado = gruposColapsados.includes(section.label);
                return (
                  <div
                    key={section.label}
                    className={`anim-slide-in ${sIdx === 0 && !hayFavoritos ? 'mt-2' : 'mt-5'}`}
                    style={{ animationDelay: `${sIdx * 60}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGrupo(section.label)}
                      aria-expanded={!colapsado}
                      aria-controls={groupId}
                      className="w-full flex items-center justify-between gap-2 text-xs uppercase tracking-widest px-3 py-2 font-medium rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: 'var(--ash)', outlineColor: 'var(--pb)' }}
                    >
                      <span>{section.label}</span>
                      <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${colapsado ? '-rotate-90' : ''}`} />
                    </button>
                    <div id={groupId} className="space-y-0.5">
                      {!colapsado && visible.map((item, iIdx) => {
                        const isActive =
                          location.pathname === item.path ||
                          (item.path === '/dashboard' && location.pathname === '/');
                        return (
                          <SidebarNavItem
                            key={item.name}
                            item={item}
                            isActive={isActive}
                            animationDelay={`${sIdx * 60 + iIdx * 35}ms`}
                            isFavorito={esFavorito(item.path)}
                            onToggleFavorito={handleToggleFavorito}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
      </nav>

    </div>
    </>
  );
};

export default Sidebar;
