import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, ChevronRight, CircleDollarSign } from 'lucide-react';
import MontoRef from '../MontoRef';

/** A calm summary that keeps the next family action visible at all times. */
const WidgetHeroPortal = ({ nombre, resumen, logoColegio, variosAlumnos = false, loadingResumen = false }) => {
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const deuda = Number(resumen?.total_deuda_usd || 0);
  const pendiente = resumen?.mensualidades_vencidas?.[0];

  return (
    <section className="relative overflow-hidden rounded-2xl text-white shadow-lg" style={{ background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-secondary) 100%)' }}>
      {logoColegio && <img src={logoColegio} alt="" aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-8 h-36 w-36 object-contain opacity-15" />}
      <div className="relative flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs capitalize text-white/70">{hoy}</p>
          <h1 className="mt-1 text-xl font-bold">Hola, {nombre || 'familia'}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/85">Aquí tienes lo importante para acompañar el día escolar de tu familia.</p>
        </div>
        {loadingResumen ? <div className="h-20 w-full max-w-xs animate-pulse rounded-xl bg-white/15" /> : deuda > 0 ? (
          <Link to="/portal/historial" className="group min-w-[240px] rounded-xl bg-white/15 p-3 backdrop-blur-sm transition-colors hover:bg-white/20">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/70"><CircleDollarSign size={13} /> Próximo paso</span>
            <span className="mt-1 block text-sm font-semibold">{pendiente ? `${pendiente.mes_nombre} ${pendiente.anio} está pendiente` : 'Revisa tus pagos pendientes'}</span>
            <MontoRef usd={deuda} tasaBcv={resumen?.tasa_bcv} colorRef="text-white" colorBs="text-white/75" className="mt-1" />
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold">Ver opciones de pago <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ) : <div className="min-w-[240px] rounded-xl bg-white/15 p-3 backdrop-blur-sm"><span className="flex items-center gap-1.5 text-[11px] font-medium text-white/70"><CheckCircle2 size={13} /> Estado de pagos</span><strong className="mt-1 block text-sm">Todo está al día</strong><span className="mt-0.5 block text-xs text-white/75">{variosAlumnos ? 'Tus hijos están solventes.' : 'No tienes pagos pendientes.'}</span></div>}
      </div>
    </section>
  );
};

export default WidgetHeroPortal;
