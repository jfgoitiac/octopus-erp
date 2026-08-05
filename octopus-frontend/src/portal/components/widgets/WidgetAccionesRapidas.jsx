import { Link } from 'react-router-dom';
import { Banknote, Receipt, TrendingUp, Megaphone } from 'lucide-react';

const WidgetAccionesRapidas = ({ onPagar, className = '' }) => (
  <div className={`grid grid-cols-4 gap-3 ${className}`}>
    <button
      onClick={onPagar}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
    >
      <div className="w-9 h-9 rounded-xl bg-[var(--portal-primary,#0fa3b1)] text-white flex items-center justify-center">
        <Banknote size={17} />
      </div>
      <p className="text-[11px] font-medium text-gray-600 leading-tight">Pagar por transferencia</p>
    </button>

    <Link
      to="/portal/historial"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
    >
      <div className="w-9 h-9 rounded-xl bg-[var(--portal-primary,#0fa3b1)] text-white flex items-center justify-center">
        <Receipt size={17} />
      </div>
      <p className="text-[11px] font-medium text-gray-600 leading-tight">Ver historial</p>
    </Link>

    <Link
      to="/portal/rendimiento"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
    >
      <div className="w-9 h-9 rounded-xl bg-[var(--portal-primary,#0fa3b1)] text-white flex items-center justify-center">
        <TrendingUp size={17} />
      </div>
      <p className="text-[11px] font-medium text-gray-600 leading-tight">Rendimiento</p>
    </Link>

    <Link
      to="/portal/comunicaciones"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
    >
      <div className="w-9 h-9 rounded-xl bg-[var(--portal-primary,#0fa3b1)] text-white flex items-center justify-center">
        <Megaphone size={17} />
      </div>
      <p className="text-[11px] font-medium text-gray-600 leading-tight">Comunicaciones</p>
    </Link>
  </div>
);

export default WidgetAccionesRapidas;
