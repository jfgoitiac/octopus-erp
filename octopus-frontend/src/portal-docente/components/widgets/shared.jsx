import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';

// Avatar — si hay `foto` (URL) se muestra la imagen real recortada en círculo;
// si no, iniciales sobre un degradé de marca con anillo de contraste.
export const Avatar = ({ nombre, foto, className = '' }) => {
  if (foto) {
    return (
      <img
        src={foto}
        alt={nombre || 'Avatar'}
        className={`w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-[var(--docente-primary)]/30 ${className}`}
      />
    );
  }
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white ring-2 ring-[var(--docente-primary)]/30 ${className}`}
      style={{ background: 'linear-gradient(135deg, var(--docente-primary) 0%, var(--docente-primary-dark) 100%)' }}
    >
      {iniciales(nombre)}
    </div>
  );
};

export const SectionCard = ({ title, to, children, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col ${className}`}>
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-xs font-medium text-[var(--docente-primary)] hover:text-[var(--docente-primary-dark)] transition-colors"
        >
          Ver todas <ChevronRight size={14} />
        </Link>
      )}
    </div>
    <div className="divide-y divide-gray-50 flex-1">{children}</div>
  </div>
);

// EmptyRow — estado vacío con más jerarquía: ícono contenido en un círculo suave,
// texto principal + texto secundario opcional más chico.
export const EmptyRow = ({ icon: Icon, text, subtext }) => (
  <div className="px-4 py-8 text-center">
    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
      <Icon size={22} className="text-gray-300" />
    </div>
    <p className="text-sm font-medium text-gray-500">{text}</p>
    {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
  </div>
);
