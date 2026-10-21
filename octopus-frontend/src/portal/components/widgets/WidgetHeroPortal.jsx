import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, ChevronRight, CircleDollarSign } from 'lucide-react';
import MontoRef from '../MontoRef';
import { textoVencimiento } from '../../utils/fechas';

/** Saludo + estado de cuenta de la familia, con el siguiente paso a la vista. */
const WidgetHeroPortal = ({ nombre, resumen, logoColegio, variosAlumnos = false, loadingResumen = false, onPagar = null }) => {
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const deuda = Number(resumen?.total_deuda_usd || 0);
  const pendiente = resumen?.mensualidades_vencidas?.[0];

  const contenidoDeuda = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-white/80"><CircleDollarSign size={13} aria-hidden="true" /> {variosAlumnos ? 'Deuda de la familia' : 'Tienes pendiente'}</span>
      <MontoRef usd={deuda} tasaBcv={resumen?.tasa_bcv} size="lg" align="left" colorRef="text-white" colorBs="text-white/80" className="mt-1" />
      {pendiente && <span className="mt-1 block text-xs text-white/80">{pendiente.mes_nombre} {pendiente.anio} · {textoVencimiento(pendiente)}</span>}
      {onPagar && <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">Reportar un pago <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>}
    </>
  );

  return (
    <section className="relative overflow-hidden rounded-2xl text-white shadow-lg" style={{ background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-secondary) 100%)' }}>
      {logoColegio && <img src={logoColegio} alt="" aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-8 h-36 w-36 object-contain opacity-15" />}
      <div className="relative flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs capitalize text-white/80">{hoy}</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">Hola, {nombre || 'familia'}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/90">Aquí tienes lo importante de tu familia en el colegio.</p>
        </div>
        {loadingResumen ? (
          <div className="h-24 w-full max-w-xs animate-pulse rounded-xl bg-[var(--surface)]/15" aria-hidden="true" />
        ) : deuda > 0 ? (
          onPagar ? (
            <button type="button" onClick={onPagar} className="group w-full md:w-auto md:min-w-[260px] rounded-xl bg-[var(--surface)]/15 p-4 text-left backdrop-blur-sm transition-colors hover:bg-[var(--surface)]/25">
              {contenidoDeuda}
            </button>
          ) : (
            <div className="w-full md:w-auto md:min-w-[260px] rounded-xl bg-[var(--surface)]/15 p-4 backdrop-blur-sm">
              {contenidoDeuda}
              <span className="mt-2 block text-xs text-white/85">Tus comprobantes están en revisión.</span>
            </div>
          )
        ) : (
          <div className="w-full md:w-auto md:min-w-[260px] rounded-xl bg-[var(--surface)]/15 p-4 backdrop-blur-sm">
            <span className="flex items-center gap-1.5 text-xs font-medium text-white/80"><CheckCircle2 size={13} aria-hidden="true" /> Estado de pagos</span>
            <strong className="mt-1 block text-base">Todo está al día</strong>
            <span className="mt-0.5 block text-xs text-white/85">{variosAlumnos ? 'Tus hijos están solventes.' : 'No tienes pagos pendientes.'}</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default WidgetHeroPortal;
