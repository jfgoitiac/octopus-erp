import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight, CalendarDays, ListChecks, UserCheck, Users } from 'lucide-react';

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const Dato = ({ icon: Icon, label, valor, detalle }) => (
  <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--ash-light)' }}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white" style={{ color: 'var(--pb-mid)' }}>
      <Icon size={18} aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{label}</p>
      <p className="truncate text-sm font-semibold" style={{ color: 'var(--jet)' }}>{valor}</p>
      {detalle && <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>{detalle}</p>}
    </div>
  </div>
);

/** Pantalla previa al pase: qué clase, qué día y cuántos alumnos. */
const InicioPaseLista = ({ materia, fecha, total, marcados, onComenzar, onRapido, onResumen }) => {
  const yaHayAsistencia = marcados > 0;
  const completa = total > 0 && marcados === total;
  const pct = total ? Math.round((marcados / total) * 100) : 0;

  return (
    <section className="mx-auto w-full max-w-md anim-scale-in" aria-labelledby="pl-inicio-titulo">
      <div
        className="relative overflow-hidden rounded-2xl bg-white p-5 sm:p-6"
        style={{ border: '0.5px solid var(--border-md)', boxShadow: '0 12px 32px -8px rgba(43,48,58,0.14)' }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-32" style={{ background: 'linear-gradient(180deg, var(--pb-light) 0%, transparent 100%)' }} />

        <div className="relative flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white" style={{ color: 'var(--pb)', boxShadow: '0 6px 16px -6px rgba(15,163,177,0.45)' }}>
            <ListChecks size={26} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--pb-mid)' }}>Pase de lista</p>
          <h2 id="pl-inicio-titulo" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: 'var(--jet)' }}>
            {materia?.nombre || 'Materia'}
          </h2>
          {materia?.grado_seccion && <p className="mt-0.5 text-sm" style={{ color: 'var(--jet-mid)' }}>{materia.grado_seccion}</p>}
        </div>

        <div className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Dato icon={CalendarDays} label="Fecha" valor={capitalizar(format(fecha, "EEEE, d 'de' MMMM", { locale: es }))} />
          <Dato
            icon={Users}
            label="Alumnos"
            valor={`${total} en la sección`}
            detalle={yaHayAsistencia ? `${marcados} ya marcado${marcados === 1 ? '' : 's'}` : null}
          />
        </div>

        {yaHayAsistencia && (
          <div className="relative mt-4" aria-hidden="true">
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--ash-light)' }}>
              <div
                className="h-full w-full origin-left rounded-full transition-transform duration-500 ease-out"
                style={{ background: 'var(--pb)', transform: `scaleX(${pct / 100})` }}
              />
            </div>
          </div>
        )}

        <div className="relative mt-6 flex flex-col items-stretch gap-2 sm:items-center">
          <button
            type="button"
            onClick={onComenzar}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-white transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-2 sm:w-auto"
            style={{ background: 'var(--docente-primary)', boxShadow: '0 10px 24px -10px rgba(15,163,177,0.7)' }}
          >
            {yaHayAsistencia ? 'Revisar asistencia' : 'Comenzar a pasar lista'}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRapido}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-[transform,background-color] active:scale-[0.97] hover:bg-[#f0fdf4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 sm:w-auto"
            style={{ color: '#15803d', boxShadow: 'inset 0 0 0 1px #bbf7d0' }}
          >
            <UserCheck size={17} aria-hidden="true" />
            Todos presentes, marco solo a quienes faltan
          </button>
          {completa && (
            <button
              type="button"
              onClick={onResumen}
              className="min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={{ color: 'var(--pb-mid)' }}
            >
              Ver resumen
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default InicioPaseLista;
