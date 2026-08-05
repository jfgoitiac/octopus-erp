import { useMemo } from 'react';
import { startOfWeek, addDays, isSameDay, format } from 'date-fns';
import { es } from 'date-fns/locale';

const WidgetActividadSemana = ({ mensajes, incidentes }) => {
  const dias = useMemo(() => {
    const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const dia = addDays(inicio, i);
      const cantMensajes = mensajes.filter(m => isSameDay(new Date(m.fecha), dia)).length;
      const cantIncidentes = incidentes.filter(inc => isSameDay(new Date(inc.fecha), dia)).length;
      return { dia, total: cantMensajes + cantIncidentes };
    });
  }, [mensajes, incidentes]);

  const maximo = Math.max(1, ...dias.map(d => d.total));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 h-full flex flex-col">
      <p className="text-sm font-semibold text-gray-900 mb-4">Actividad de la semana</p>
      <div className="flex items-end justify-between gap-2 h-28 flex-1">
        {dias.map(({ dia, total }) => {
          const esHoy = isSameDay(dia, new Date());
          const alturaPct = total === 0 ? 4 : Math.max(10, (total / maximo) * 100);
          return (
            <div key={dia.toISOString()} className="flex flex-col items-center gap-1.5 flex-1">
              <div className="w-full flex items-end justify-center h-20">
                <div
                  className={`w-4/5 rounded-md transition-all ${esHoy ? 'bg-[var(--docente-primary)]' : 'bg-[var(--docente-primary)]/20'}`}
                  style={{ height: `${alturaPct}%` }}
                  title={`${total} actividad${total === 1 ? '' : 'es'}`}
                />
              </div>
              <span className={`text-[10px] capitalize ${esHoy ? 'font-bold text-[var(--docente-primary)]' : 'text-gray-400'}`}>
                {format(dia, 'EEEEE', { locale: es })}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-3">Mensajes enviados e incidentes registrados por día.</p>
    </div>
  );
};

export default WidgetActividadSemana;
