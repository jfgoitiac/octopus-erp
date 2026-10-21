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
      <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--portal-muted)]"><CircleDollarSign size={15} aria-hidden="true" /> {variosAlumnos ? 'Deuda de la familia' : 'Tienes pendiente'}</span>
      <MontoRef usd={deuda} tasaBcv={resumen?.tasa_bcv} size="lg" align="left" colorRef="text-[var(--portal-ink)] sm:!text-3xl" colorBs="text-[var(--portal-muted)]" className="mt-2" />
      {pendiente && <span className="mt-2 block text-sm text-[var(--red)]">{pendiente.mes_nombre} {pendiente.anio} · {textoVencimiento(pendiente)}</span>}
      {onPagar && <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-[var(--portal-hero)] px-4 py-2 text-sm font-semibold text-white">Reportar un pago <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>}
    </>
  );

  const tarjeta = 'portal-hero-card w-full p-5 sm:p-6 lg:max-w-sm';

  return (
    <section className="portal-hero">
      {logoColegio && <img src={logoColegio} alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 object-contain opacity-10" />}
      <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
        <div>
          <p className="text-sm capitalize text-white/80 lg:hidden">{hoy}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl lg:mt-0 lg:text-4xl">Hola, {nombre || 'familia'}</h1>
          <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">Aquí tienes lo importante de tu familia en el colegio.</p>
        </div>
        {loadingResumen ? (
          <div className="h-36 w-full animate-pulse rounded-[20px] bg-white/15 lg:max-w-sm" aria-hidden="true" />
        ) : deuda > 0 ? (
          onPagar ? (
            <button type="button" onClick={onPagar} className={`group text-left transition-transform hover:-translate-y-0.5 ${tarjeta}`}>
              {contenidoDeuda}
            </button>
          ) : (
            <div className={tarjeta}>
              {contenidoDeuda}
              <span className="mt-3 block text-sm text-[var(--portal-muted)]">Tus comprobantes están en revisión.</span>
            </div>
          )
        ) : (
          <div className={tarjeta}>
            <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--green)]"><CheckCircle2 size={15} aria-hidden="true" /> Estado de pagos</span>
            <strong className="mt-2 block text-xl font-semibold text-[var(--portal-ink)]">Todo está al día</strong>
            <span className="mt-1 block text-sm text-[var(--portal-muted)]">{variosAlumnos ? 'Tus hijos están solventes.' : 'No tienes pagos pendientes.'}</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default WidgetHeroPortal;
