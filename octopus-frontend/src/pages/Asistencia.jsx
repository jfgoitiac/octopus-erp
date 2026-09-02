import { useEffect, useMemo, useCallback } from 'react';
import { Users, Save, Loader2, GraduationCap, ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../utils/datepickerPortal';
import { es } from 'date-fns/locale';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useAsistencia } from '../hooks/useAsistencia';
import GradoSelect from '../components/GradoSelect';
import FilaAlumno from '../components/asistencia/FilaAlumno';
import SkeletonFila from '../components/asistencia/SkeletonFila';
import { PageHeader } from '../components/ui/PageHeader';

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
// Sin `background` inline (a diferencia de INPUT_STYLE): así la clase
// Tailwind `hover:bg-*` puede sobrescribirlo — un `style` inline con
// background siempre gana sobre cualquier variante de Tailwind.
const NAV_BTN_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--jet)' };

// Nota: los colores de texto sobre fondo se eligieron para cumplir contraste
// >= 4.5:1 en texto pequeño (WCAG AA). #16a34a/var(--ash) originales no
// pasaban sobre sus fondos claros — se oscurecieron a #15803d y var(--jet).
const CONTEO_ITEMS = [
  { key: 'presentes',   label: 'Presentes',   color: '#15803d',     bg: '#dcfce7' },
  { key: 'ausentes',    label: 'Ausentes',    color: 'var(--red)',  bg: 'var(--red-light)' },
  { key: 'justificados',label: 'Justificados',color: '#854d0e',     bg: '#fef9c3' },
  { key: 'retardados',  label: 'Retardados',  color: '#b45309',     bg: '#fef3c7' },
  { key: 'sinMarcar',   label: 'Sin marcar',  color: 'var(--jet)',  bg: 'var(--ash-light)' },
];

const Asistencia = () => {
  const {
    fecha, setFecha,
    grado, setGrado,
    registros,
    loading,
    saving,
    dirty,
    conteos,
    marcar,
    marcarTodosPresentes,
    actualizarObservacion,
    guardar,
  } = useAsistencia();

  const hoy = useMemo(() => startOfDay(new Date()), []);
  const esHoy = isSameDay(fecha, hoy);

  const irADiaAnterior = useCallback(() => {
    setFecha(prev => addDays(prev, -1));
  }, [setFecha]);

  const irADiaSiguiente = useCallback(() => {
    setFecha(prev => (isSameDay(prev, hoy) ? prev : addDays(prev, 1)));
  }, [setFecha, hoy]);

  // Bloquear cierre/recarga de pestaña con cambios sin guardar
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  return (
    <div className="animate-fadeIn pb-24 sm:pb-0">
      <PageHeader
        titulo="Control de Asistencia"
        descripcion="Registro diario de presencia por grado"
        acciones={
          <button
            onClick={guardar}
            disabled={saving || !dirty || !registros.length}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        }
      />

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label
            htmlFor="filtro-fecha"
            className="block text-[11px] uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--ash)' }}
          >
            Fecha
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={irADiaAnterior}
              aria-label="Día anterior"
              className="flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg bg-white transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={NAV_BTN_STYLE}
            >
              <ChevronLeft size={16} />
            </button>

            <DatePicker
              id="filtro-fecha"
              selected={fecha}
              onChange={setFecha}
              locale={es}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              wrapperClassName="w-full"
              popperContainer={datepickerPopperContainer}
              customInput={
                <input
                  className="w-full px-3 py-2.5 sm:py-2 rounded-lg text-sm outline-none cursor-pointer text-center focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                  style={INPUT_STYLE}
                />
              }
            />

            <button
              type="button"
              onClick={irADiaSiguiente}
              disabled={esHoy}
              aria-label="Día siguiente"
              className="flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg bg-white transition-colors hover:enabled:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
              style={NAV_BTN_STYLE}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="filtro-grado"
            className="block text-[11px] uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--ash)' }}
          >
            Grado / Año
          </label>
          <GradoSelect
            id="filtro-grado"
            value={grado}
            onChange={e => setGrado(e.target.value)}
            incluirVacio
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Contadores */}
      {grado && !loading && registros.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {CONTEO_ITEMS.map(({ key, label, color, bg }) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: bg }}>
              <Users size={18} style={{ color }} />
              <div>
                <p className="text-xl font-bold leading-none" style={{ color }}>{conteos[key]}</p>
                <p className="text-xs" style={{ color }}>{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Marcar todos presentes */}
      {grado && !loading && registros.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={marcarTodosPresentes}
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-1"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
          >
            <CheckCheck size={14} />
            Marcar todos presentes
          </button>
        </div>
      )}

      {/* Lista */}
      {!grado ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
        >
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona grado y fecha para cargar la lista.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {loading ? (
            [...Array(8)].map((_, i) => <SkeletonFila key={i} />)
          ) : registros.length === 0 ? (
            <div
              className="rounded-xl p-16 text-center"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              <p className="text-sm">No hay alumnos registrados en este grado.</p>
            </div>
          ) : (
            registros.map((r, i) => (
              <FilaAlumno
                key={`${r.alumno_id}-${r.estado || i}`}
                registro={r}
                onMarcar={marcar}
                onObservacion={actualizarObservacion}
              />
            ))
          )}
        </div>
      )}

      {/* Botón guardar sticky — solo mobile, visible cuando hay cambios */}
      {dirty && registros.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 sm:hidden z-40"
          style={{ background: 'var(--porcelain)', borderTop: '1px solid var(--border-md)' }}
        >
          <button
            onClick={guardar}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Asistencia;
