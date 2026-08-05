import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2, GraduationCap } from 'lucide-react';

import { useDocenteEventosCalendario } from '../../hooks/useDocenteEventosCalendario';
import ModalNuevoEvento from '../ModalNuevoEvento';

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const toISODate = (d) => format(d, 'yyyy-MM-dd');

const WidgetCalendario = ({ className = '' }) => {
  const hoy = new Date();
  const [mesActual, setMesActual] = useState(startOfMonth(hoy));
  const [diaSeleccionado, setDiaSeleccionado] = useState(toISODate(hoy));
  const [modalAbierto, setModalAbierto] = useState(false);

  const { eventos, loading, creando, crearEvento, eliminarEvento } = useDocenteEventosCalendario(
    mesActual.getMonth() + 1,
    mesActual.getFullYear(),
  );

  const inicio = startOfWeek(startOfMonth(mesActual), { weekStartsOn: 0 });
  const fin = endOfWeek(endOfMonth(mesActual), { weekStartsOn: 0 });
  const dias = eachDayOfInterval({ start: inicio, end: fin });

  const eventosPorDia = useMemo(() => {
    const mapa = new Map();
    eventos.forEach(ev => {
      if (!mapa.has(ev.fecha)) mapa.set(ev.fecha, []);
      mapa.get(ev.fecha).push(ev);
    });
    return mapa;
  }, [eventos]);

  const eventosDelDia = eventosPorDia.get(diaSeleccionado) || [];

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMesActual(m => subMonths(m, 1))}
            aria-label="Mes anterior"
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-semibold text-gray-900 capitalize w-28 text-center">
            {format(mesActual, 'MMMM yyyy', { locale: es })}
          </p>
          <button
            onClick={() => setMesActual(m => addMonths(m, 1))}
            aria-label="Mes siguiente"
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          aria-label="Agregar evento"
          className="w-7 h-7 rounded-lg bg-[var(--docente-primary)]/10 text-[var(--docente-primary)] flex items-center justify-center hover:bg-[var(--docente-primary)]/20 transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {DIAS_SEMANA.map((d, i) => (
          <span key={i} className="text-[10px] font-medium text-gray-300">{d}</span>
        ))}
        {dias.map((dia) => {
          const iso = toISODate(dia);
          const esHoy = isSameDay(dia, hoy);
          const esSeleccionado = iso === diaSeleccionado;
          const delMes = isSameMonth(dia, mesActual);
          const eventosDia = eventosPorDia.get(iso);
          const tieneEventos = !!eventosDia;
          const tieneEvaluacion = eventosDia?.some(ev => ev.solo_lectura);
          return (
            <button
              key={iso}
              onClick={() => setDiaSeleccionado(iso)}
              className="relative flex flex-col items-center"
            >
              <span
                className={`text-xs h-7 w-7 flex items-center justify-center rounded-full transition-colors ${
                  esSeleccionado
                    ? 'bg-[var(--docente-primary)] text-white font-bold shadow-sm'
                    : esHoy
                    ? 'border border-[var(--docente-primary)] text-[var(--docente-primary)] font-bold'
                    : delMes
                    ? 'text-gray-600 hover:bg-gray-50'
                    : 'text-gray-300'
                }`}
              >
                {format(dia, 'd')}
              </span>
              {tieneEventos && (
                <span
                  className={`w-1 h-1 rounded-full mt-0.5 ${
                    tieneEvaluacion
                      ? (esSeleccionado ? 'bg-amber-500' : 'bg-amber-400/70')
                      : (esSeleccionado ? 'bg-[var(--docente-primary)]' : 'bg-[var(--docente-primary)]/50')
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-50 flex-1">
        <p className="text-xs font-semibold text-gray-500 capitalize mb-2">
          {format(new Date(diaSeleccionado + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        {loading ? (
          <p className="text-xs text-gray-300">Cargando eventos...</p>
        ) : eventosDelDia.length === 0 ? (
          <p className="text-xs text-gray-400">Sin eventos este día.</p>
        ) : (
          <div className="space-y-1.5">
            {eventosDelDia.map(ev => (
              <div
                key={ev.id}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${ev.solo_lectura ? 'bg-amber-50' : 'bg-[var(--docente-primary)]/10'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${ev.solo_lectura ? 'text-amber-900' : 'text-[var(--docente-primary-dark)]'}`}>{ev.titulo}</p>
                  <p className={`text-[10px] ${ev.solo_lectura ? 'text-amber-500' : 'text-[var(--docente-primary)]'}`}>
                    {ev.tipo_label}{ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ''}
                  </p>
                </div>
                {ev.solo_lectura ? (
                  <GraduationCap size={13} className="text-amber-400 flex-shrink-0" aria-label="Evaluación del plan" />
                ) : (
                  <button
                    onClick={() => eliminarEvento(ev.id)}
                    aria-label="Eliminar evento"
                    className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalAbierto && (
        <ModalNuevoEvento
          fechaInicial={diaSeleccionado}
          onClose={() => setModalAbierto(false)}
          onSubmit={crearEvento}
          creando={creando}
        />
      )}
    </div>
  );
};

export default WidgetCalendario;
