import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef, { NotaTasaBcv } from '../MontoRef';

// Formatea fecha como "12 de mayo"
const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM", { locale: es });
  } catch {
    return fechaStr;
  }
};

const WidgetProximosVencimientos = ({ resumen, loading, variosAlumnos = false }) => {
  if (loading) {
    return <SkeletonCard lines={2} />;
  }

  if (!resumen?.proximos_vencimientos?.length) return null;

  const vencimientos = resumen.proximos_vencimientos;
  const totalProximo = vencimientos.reduce((total, mensualidad) => total + Number(mensualidad.monto_total ?? mensualidad.monto_usd ?? 0), 0);
  const siguienteFecha = vencimientos.map(m => m.fecha_vencimiento).filter(Boolean).sort()[0];

  return (
    <section className="portal-card portal-card--soft p-5 h-full">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[var(--portal-primary)]" />
        <h2 className="text-sm font-semibold text-[var(--jet-mid)]">Próximos vencimientos</h2>
      </div>
      {variosAlumnos ? (
        <div className="rounded-xl bg-[var(--surface)] px-3 py-3">
          <p className="text-sm font-medium text-[var(--jet-mid)]">Próximas mensualidades de toda la familia</p>
          <p className="mt-1 text-xs text-[var(--ash)]">Un monto único para {vencimientos.length} mensualidad{vencimientos.length === 1 ? '' : 'es'} de tus hijos.</p>
          <MontoRef usd={totalProximo} tasaBcv={resumen.tasa_bcv} className="mt-2" />
          {siguienteFecha && <p className="mt-1 text-xs text-[var(--ash)]">Próximo vencimiento: {formatFecha(siguienteFecha)}</p>}
        </div>
      ) : <div className="space-y-2">
        {vencimientos.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--jet-mid)]">{m.mes_nombre} {m.anio}</p>
              {variosAlumnos && m.alumno_nombre && (
                <p className="text-xs text-[var(--ash)] truncate">{m.alumno_nombre}</p>
              )}
              {m.fecha_vencimiento && (
                <p className="text-xs text-[var(--ash)]">Vence: {formatFecha(m.fecha_vencimiento)}</p>
              )}
            </div>
            <MontoRef usd={m.monto_usd} tasaBcv={resumen.tasa_bcv} className="flex-shrink-0" />
          </div>
        ))}
      </div>}
      <NotaTasaBcv tasaBcv={resumen.tasa_bcv} className="mt-3" />
    </section>
  );
};

export default WidgetProximosVencimientos;
