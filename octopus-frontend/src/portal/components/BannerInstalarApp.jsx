import { Smartphone, Download, X } from 'lucide-react';
import useAccionInstalar from '../hooks/useAccionInstalar';

// Banner solo para celular (en tablet/escritorio el navegador ya muestra su
// propio ícono de instalar en la barra de direcciones).
const BannerInstalarApp = ({ className = '' }) => {
  const { mostrarBanner, esIOS, accionar, descartar, modal } = useAccionInstalar();

  if (!mostrarBanner) return modal;

  return (
    <>
      <div className={`sm:hidden portal-card p-3 flex items-center gap-3 ${className}`} role="region" aria-label="Instalar app">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white"
          style={{ background: 'var(--portal-primary, #0fa3b1)' }}
        >
          <Smartphone size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-tight">Ten el portal a la mano</p>
          <p className="text-xs text-slate-500 leading-snug">Instálalo como app en tu celular.</p>
        </div>
        <button
          type="button"
          onClick={accionar}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'var(--portal-primary, #0fa3b1)' }}
        >
          <Download size={14} />
          {esIOS ? 'Cómo' : 'Instalar'}
        </button>
        <button
          type="button"
          onClick={descartar}
          className="shrink-0 p-1.5 -mr-1 text-slate-400 hover:text-slate-600"
          aria-label="Ocultar aviso de instalación"
        >
          <X size={16} />
        </button>
      </div>
      {modal}
    </>
  );
};

export default BannerInstalarApp;
