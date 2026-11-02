import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Printer, Store, TriangleAlert } from 'lucide-react';
import { imprimirCierreCantina } from '../../../utils/imprimirCierreCantina';
import { DineroRecibido, OrigenCierre } from './DesgloseCierre';
import ReporteCierreTicket from './ReporteCierreTicket';
import { ESTILOS_DIFERENCIA, fechaHoraCierre, resultadoCierre } from './calculosCierre';

// Estado "caja cerrada": primero el resultado y qué hacer; después, el detalle.
export default function ResultadoCierre({ cierre, enfocar = false }) {
  const bandaRef = useRef(null);
  const resultado = resultadoCierre(cierre);
  const { tinta, fondo } = ESTILOS_DIFERENCIA[resultado.tipo];
  const Icono = resultado.tipo === 'faltante' || resultado.tipo === 'sobrante' ? TriangleAlert : CheckCircle2;

  const fecha = fechaHoraCierre(cierre.cerrado_en);
  const cajero = cierre.cajero_nombre || cierre.cajero_username;
  const detalle = [fecha && `Cerrada el ${fecha}`, cajero && `por ${cajero}`].filter(Boolean).join(' ');

  useEffect(() => {
    if (enfocar) bandaRef.current?.focus();
  }, [enfocar]);

  return (
    <div className="flex flex-col gap-6">
      <section
        ref={bandaRef}
        tabIndex={-1}
        aria-label="Resultado del cierre"
        className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between outline-none"
        style={{ background: fondo }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Icono size={28} aria-hidden="true" className="shrink-0" style={{ color: tinta }} />
          <div className="min-w-0">
            <p className="text-lg sm:text-xl font-semibold tabular-nums break-words" style={{ color: tinta }}>{resultado.titulo}</p>
            {detalle && <p className="text-sm mt-0.5" style={{ color: 'var(--jet)' }}>{detalle}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 md:shrink-0">
          <button
            type="button"
            onClick={() => imprimirCierreCantina(cierre)}
            className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--pb-mid)' }}
          >
            <Printer size={16} aria-hidden="true" />
            Imprimir cierre
          </button>
          <Link
            to="/cantina/pos"
            className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{ background: '#fff', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
          >
            <Store size={16} aria-hidden="true" />
            Abrir nueva caja
          </Link>
        </div>
      </section>

      <OrigenCierre cierre={cierre} />
      <DineroRecibido totales={cierre.totales_por_metodo} />
      <ReporteCierreTicket cierre={cierre} plano />
    </div>
  );
}
