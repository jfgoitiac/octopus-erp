import { useEffect } from 'react';
import { Calendar, Users, Save, Loader2, GraduationCap } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale';
import { useAsistencia } from '../hooks/useAsistencia';
import { GradoSelect } from '../constants/grados';
import FilaAlumno from '../components/asistencia/FilaAlumno';
import SkeletonFila from '../components/asistencia/SkeletonFila';

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };

const CONTEO_ITEMS = [
  { key: 'presentes',   label: 'Presentes',   color: '#16a34a',     bg: '#dcfce7' },
  { key: 'ausentes',    label: 'Ausentes',    color: 'var(--red)',  bg: 'var(--red-light)' },
  { key: 'justificados',label: 'Justificados',color: '#854d0e',     bg: '#fef9c3' },
  { key: 'sinMarcar',   label: 'Sin marcar',  color: 'var(--ash)',  bg: 'var(--ash-light)' },
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
    actualizarObservacion,
    guardar,
  } = useAsistencia();

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
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Calendar size={20} style={{ color: 'var(--pb)' }} />
            Control de Asistencia
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Registro diario de presencia por grado
          </p>
        </div>

        {/* Botón guardar — visible en desktop */}
        <button
          onClick={guardar}
          disabled={saving || !dirty || !registros.length}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Guardando...' : 'Guardar asistencia'}
        </button>
      </div>

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
          <DatePicker
            selected={fecha}
            onChange={setFecha}
            locale={es}
            dateFormat="dd/MM/yyyy"
            maxDate={new Date()}
            wrapperClassName="w-full"
            customInput={
              <input
                id="filtro-fecha"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={INPUT_STYLE}
              />
            }
          />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
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
