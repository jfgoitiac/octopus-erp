import { Link } from 'react-router-dom';
import { AlertTriangle, MessageCirclePlus, ClipboardPenLine } from 'lucide-react';

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
    icon: ClipboardPenLine,
    label: 'Cargar notas',
  },
];

const WidgetAccionesRapidas = ({ className = '' }) => (
  <div className={`grid grid-cols-3 gap-2 sm:gap-3 ${className}`}>
    {ACCIONES.map(({ to, state, icon: Icon, label }) => (
      <Link
        key={label}
        to={to}
        state={state}
        className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-3 flex flex-col items-center gap-1.5 text-center hover:border-[var(--docente-primary)]/40 transition-colors min-h-[44px]"
      >
        <div className="w-9 h-9 rounded-xl bg-[var(--docente-primary)] text-white flex items-center justify-center">
          <Icon size={17} />
        </div>
        <p className="text-xs font-medium text-[var(--jet-mid)] leading-tight">{label}</p>
      </Link>
    ))}
  </div>
);

export default WidgetAccionesRapidas;
