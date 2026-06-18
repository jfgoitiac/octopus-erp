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
export const ROLE_GROUPS = {
  // Solo administración central
  ADMIN_CENTRAL: [ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR],

  // Admin + roles operativos que necesitan ver finanzas
  FINANZAS: [ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR, ROLES.COBRANZA],

  // Finanzas + cajero (acceso a caja pero no a configuración)
  CAJA: [ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR, ROLES.COBRANZA, ROLES.CAJERO],

  // Secretaría + administración (gestión de alumnos/inscripciones)
  SECRETARIA_ADMIN: [ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR, ROLES.SECRETARIA],

  // Todos los roles operativos (cualquier staff de la sede)
  STAFF_SEDE: [
    ROLES.DIRECTOR, ROLES.SISTEMAS, ROLES.ADMINISTRADOR,
    ROLES.SECRETARIA, ROLES.COBRANZA, ROLES.CAJERO,
  ],

  // Gestión multi-sede
  RED_DIRECTIVA: [ROLES.DIRECTIVO_RED, ROLES.DIRECTOR],
  SOLO_RED: [ROLES.DIRECTIVO_RED],

  // Acceso a representantes (secretaría + caja)
  ATENCION_FAMILIAS: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SECRETARIA, ROLES.CAJERO],

  // Morosos: todos excepto directivo_red (gestión local de sede)
  MORA: [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SECRETARIA, ROLES.CAJERO, ROLES.SISTEMAS],

  // Docente: solo banco de estudiantes, representantes e inscripciones
  DOCENTE: [ROLES.DOCENTE],
};
