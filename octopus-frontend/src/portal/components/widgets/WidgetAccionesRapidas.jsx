import { Link } from 'react-router-dom';
import { Banknote, Receipt, TrendingUp, Megaphone } from 'lucide-react';

const WidgetAccionesRapidas = ({ onPagar, className = '' }) => (
  <section className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 ${className}`} aria-label="Acciones rápidas">
    <button
      onClick={onPagar}
      className="portal-action rounded-2xl p-4 flex flex-col items-start gap-2 text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-[var(--portal-primary,#0fa3b1)] text-white flex items-center justify-center shadow-sm">
        <Banknote size={17} />
      </div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">Pagar por transferencia</p>
    </button>

    <Link
      to="/portal/historial"
      className="portal-action rounded-2xl p-4 flex flex-col items-start gap-2 text-left"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: 'var(--portal-primary,#0fa3b1)', background: 'color-mix(in srgb, var(--portal-primary,#0fa3b1) 12%, white)' }}>
        <Receipt size={17} />
      </div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">Ver historial</p>
    </Link>

    <Link
      to="/portal/rendimiento"
      className="portal-action rounded-2xl p-4 flex flex-col items-start gap-2 text-left"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: 'var(--portal-primary,#0fa3b1)', background: 'color-mix(in srgb, var(--portal-primary,#0fa3b1) 12%, white)' }}>
        <TrendingUp size={17} />
      </div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">Rendimiento</p>
    </Link>

    <Link
      to="/portal/comunicaciones"
      className="portal-action rounded-2xl p-4 flex flex-col items-start gap-2 text-left"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color: 'var(--portal-primary,#0fa3b1)', background: 'color-mix(in srgb, var(--portal-primary,#0fa3b1) 12%, white)' }}>
        <Megaphone size={17} />
      </div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">Comunicaciones</p>
    </Link>
  </section>
);

export default WidgetAccionesRapidas;
