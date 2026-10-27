import { Printer } from 'lucide-react';
import { lineasReporteCierre } from '../../../utils/reporteCierreCaja';
import { imprimirCierreCantina } from '../../../utils/imprimirCierreCantina';

// Reporte de cierre de caja visible en pantalla, con el mismo contenido que el
// ticket térmico (ver utils/reporteCierreCaja.js). Imprimir es una acción
// opcional del usuario: el reporte se ve siempre, no se imprime solo.
const LOGO = '/cantina-logo-termico.png';

function Linea({ l }) {
  switch (l.tipo) {
    case 'logo':
      return <img src={LOGO} alt="" className="block mx-auto w-14 h-auto mb-1" />;
    case 'centro':
      return (
        <div className={`text-center ${l.negrita ? 'font-bold' : ''} ${l.grande ? 'text-base' : ''}`}>
          {l.txt}
        </div>
      );
    case 'fila':
      return (
        <div className={`flex justify-between gap-3 ${l.negrita ? 'font-bold' : ''} ${l.grande ? 'text-base' : ''}`}>
          <span className="min-w-0 break-words">{l.izq}</span>
          <span className="whitespace-nowrap text-right">{l.der}</span>
        </div>
      );
    case 'sep':
      return <hr className="my-2 border-0 border-t border-dashed border-black" />;
    case 'titulo':
      return <div className="font-bold">{l.txt}</div>;
    case 'texto':
      return <div className="whitespace-pre-wrap break-words">{l.txt}</div>;
    case 'firma':
      return <div className="mt-8 border-t border-black pt-0.5 text-center">{l.txt}</div>;
    default:
      return null;
  }
}

export default function ReporteCierreTicket({ cierre }) {
  const lineas = lineasReporteCierre(cierre);

  return (
    <section
      className="rounded-2xl p-3 sm:p-5 flex flex-col gap-3"
      style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
      aria-label="Reporte de cierre de caja"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Reporte de cierre</h2>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Así queda el papel si decides imprimirlo.</p>
        </div>
        <button
          type="button"
          onClick={() => imprimirCierreCantina(cierre)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] w-full sm:w-auto"
          style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}
        >
          <Printer size={16} aria-hidden="true" />
          Imprimir cierre
        </button>
      </div>

      <div
        className="w-full max-w-[340px] mx-auto rounded-lg p-4 font-mono text-xs sm:text-[13px] leading-snug overflow-x-auto"
        style={{ background: '#fff', color: '#111', border: '0.5px solid var(--border-md)' }}
      >
        {lineas.map((l, i) => <Linea key={i} l={l} />)}
      </div>
    </section>
  );
}
