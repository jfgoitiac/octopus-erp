import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarClock, ChevronRight } from 'lucide-react';

const formatHora = (hora) => (hora ? hora.slice(0, 5) : 'Por confirmar');

/** A stable, task-first header. Critical information must not rotate away. */
const WidgetHero = ({ nombre, proximaClase, pendientes = 0, radar, loadingPendientes = false }) => {
  const navigate = useNavigate();
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const diasCierre = radar?.dias_para_cierre;
  const cierreTexto = diasCierre === 0 ? 'El lapso cierra hoy' : diasCierre > 0 ? `Cierre en ${diasCierre} días` : null;
  const destino = proximaClase?.materia?.id
    ? `/portal-docente/materias/${proximaClase.materia.id}?tab=asistencia`
    : '/portal-docente/materias';

  return (
    <section className="relative overflow-hidden rounded-2xl text-white shadow-lg" style={{ background: 'linear-gradient(135deg, var(--docente-primary) 0%, var(--docente-primary-dark) 100%)' }}>
      <div className="absolute -right-10 -bottom-12 h-48 w-48 rounded-full border border-white/10" />
      <div className="relative p-5 sm:p-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-white/70 capitalize">{hoy}</p>
          <h1 className="mt-1 text-xl font-bold">Hola, {nombre || 'Docente'}</h1>
          <p className="mt-2 text-sm text-white/85">
            {loadingPendientes ? 'Actualizando prioridades…' : pendientes > 0 ? `Tienes ${pendientes} pendiente${pendientes === 1 ? '' : 's'} que requiere${pendientes === 1 ? '' : 'n'} atención.` : 'No tienes pendientes críticos por ahora.'}
          </p>
          {cierreTexto && <span className="mt-3 inline-flex rounded-full bg-[var(--surface)]/15 px-2.5 py-1 text-[11px] font-semibold">{cierreTexto}</span>}
        </div>
        <button onClick={() => navigate(destino)} className="group min-w-[230px] rounded-xl bg-[var(--surface)]/15 p-3 text-left backdrop-blur-sm transition-colors hover:bg-[var(--surface)]/20">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/70"><CalendarClock size={13} /> Siguiente acción</span>
          {proximaClase ? <><strong className="mt-1 block truncate text-sm">{proximaClase.materia?.nombre}</strong><span className="mt-0.5 block text-xs text-white/75">{proximaClase.dia_semana_label} · {formatHora(proximaClase.hora_inicio)}</span></> : <span className="mt-1 block text-sm">Revisar mis materias</span>}
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold">{proximaClase ? 'Marcar asistencia' : 'Abrir materias'} <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
        </button>
      </div>
    </section>
  );
};

export default WidgetHero;
