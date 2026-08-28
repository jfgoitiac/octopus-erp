import { Link } from 'react-router-dom';
import { AlertTriangle, MessageCirclePlus, BookOpen } from 'lucide-react';

const ACCIONES = [
  {
    to: '/portal-docente/incidentes',
    state: { nuevo: true },
    icon: AlertTriangle,
    label: 'Registrar incidente',
  },
  {
    to: '/portal-docente/mensajes',
    state: { nuevo: true },
    icon: MessageCirclePlus,
    label: 'Enviar mensaje',
  },
  {
    to: '/portal-docente/materias',
    icon: BookOpen,
    label: 'Cargar material',
  },
];

const WidgetAccionesRapidas = ({ className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}>
    {ACCIONES.map(({ to, state, icon: Icon, label }) => (
      <Link
        key={label}
        to={to}
        state={state}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
      >
        <div className="w-9 h-9 rounded-xl bg-[var(--docente-primary)] text-white flex items-center justify-center">
          <Icon size={17} />
        </div>
        <p className="text-[11px] font-medium text-gray-600 leading-tight">{label}</p>
      </Link>
    ))}
  </div>
);

export default WidgetAccionesRapidas;
