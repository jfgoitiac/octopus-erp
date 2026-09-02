export const ROLES = {
  DIRECTOR:      'director',
  SISTEMAS:      'sistemas',
  ADMINISTRADOR: 'administrador',
  COBRANZA:      'cobranza',
  CAJERO:        'cajero',
  SECRETARIA:    'secretaria',
  DIRECTIVO_RED: 'directivo_red',
  DOCENTE:       'docente',
};

export const ROL_OPTIONS = [
  { value: 'director',      label: 'Director' },
  { value: 'sistemas',      label: 'Sistemas' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'cobranza',      label: 'Cobranza' },
  { value: 'cajero',        label: 'Cajero' },
  { value: 'secretaria',    label: 'Secretaria' },
  { value: 'directivo_red', label: 'Directivo de Red' },
  { value: 'docente',       label: 'Docente' },
];

// Roles con acceso al panel de Sistemas
export const ROLES_SISTEMAS = ['director', 'sistemas'];

// Ruta de aterrizaje dentro del panel administrativo cuando ProtectedRoute
// deniega el acceso a una ruta específica por rol (fallback "in-panel").
// 'docente' apunta fuera del panel porque, con el login unificado, un
// docente ya no tiene ninguna ruta propia dentro de MainLayout — antes
// apuntaba a '/alumnos', una ruta que STAFF_SEDE tampoco le permitía ver
// (fallback roto que nunca se ejercitó porque el docente ni siquiera podía
// loguearse aquí).
export const FIRST_ACCESSIBLE_ROUTE = {
  'director': '/dashboard',
  'cobranza': '/dashboard',
  'administrador': '/dashboard',
  // 'sistemas' quedó restringido a los módulos de administración del
  // sistema (Sistemas, Configuración, Sitio Institucional, Notificaciones)
  // — ya no tiene acceso a /cobranza/dashboard.
  'sistemas': '/sistemas',
  'secretaria': '/inscripciones',
  'cajero': '/cobranza',
  'directivo_red': '/multisede',
  'docente': '/portal-docente',
};

// Ruta de aterrizaje justo después del login — antes de esto cada portal
// (docente/cantina) redirigía manualmente dentro de su propia página de
// login; ahora que el login es único, el destino se decide acá según el
// rol embebido en el JWT.
export const ROLE_REDIRECT_MAP = {
  docente: '/portal-docente',
  cajero: '/cantina',
};

export const getLandingRoute = (rol) => ROLE_REDIRECT_MAP[rol] || FIRST_ACCESSIBLE_ROUTE[rol] || '/dashboard';

// Clases Tailwind para el badge de rol en tablas
export const getRolStyle = (rol) => {
  switch (rol) {
    case 'director':      return 'bg-slate-800 text-white';
    case 'sistemas':      return 'bg-blue-100 text-blue-700';
    case 'administrador': return 'bg-purple-100 text-purple-700';
    case 'cobranza':      return 'bg-orange-100 text-orange-700';
    case 'cajero':        return 'bg-green-100 text-green-700';
    case 'secretaria':    return 'bg-teal-100 text-teal-700';
    case 'directivo_red': return 'bg-indigo-100 text-indigo-700';
    case 'docente':       return 'bg-yellow-100 text-yellow-700';
    default:              return 'bg-gray-100 text-gray-500';
  }
};

// Grupos semánticos — usar estos en las rutas, no strings sueltos
//
// 'sistemas' NO participa de estos grupos: quedó restringido a los 4
// módulos de administración del sistema (Sistemas, Configuración, Sitio
// Institucional, Notificaciones — ver la sección 'Sistema' de Sidebar.jsx
// y las rutas explícitas en App.jsx). Antes estaba mezclado en casi todos
// los grupos y terminaba viendo alumnos, pagos, nómina, etc. — tanto en el
// menú como al navegar directo a la ruta.
export const ROLE_GROUPS = {
  // Solo administración central
  ADMIN_CENTRAL: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR],

  // Admin + roles operativos que necesitan ver finanzas
  FINANZAS: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.COBRANZA],

  // Finanzas + cajero (acceso a caja pero no a configuración)
  CAJA: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.COBRANZA, ROLES.CAJERO],

  // Secretaría + administración (gestión de alumnos/inscripciones)
  SECRETARIA_ADMIN: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SECRETARIA],

  // Todos los roles operativos (cualquier staff de la sede)
  STAFF_SEDE: [
    ROLES.DIRECTOR, ROLES.ADMINISTRADOR,
    ROLES.SECRETARIA, ROLES.COBRANZA, ROLES.CAJERO,
  ],

  // Gestión multi-sede
  RED_DIRECTIVA: [ROLES.DIRECTIVO_RED, ROLES.DIRECTOR],
  SOLO_RED: [ROLES.DIRECTIVO_RED],

  // Acceso a representantes (secretaría + caja + cobranza)
  ATENCION_FAMILIAS: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SECRETARIA, ROLES.CAJERO, ROLES.COBRANZA],

  // Morosos: todos excepto directivo_red y sistemas (gestión local de sede)
  MORA: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SECRETARIA, ROLES.CAJERO, ROLES.COBRANZA],

  // Docente: solo banco de estudiantes, representantes e inscripciones
  DOCENTE: [ROLES.DOCENTE],

  // Todos los roles del sistema
  TODOS: Object.values(ROLES),
};
