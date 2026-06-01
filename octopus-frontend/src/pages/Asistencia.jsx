import { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle, XCircle, AlertCircle, Users, Save, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'react-toastify';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale';
import { format } from 'date-fns';
import { getAsistencia, saveAsistencia } from '../api/academico.service';

const GRADOS = [
  '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
  '1er Año', '2do Año', '3er Año', '4to Año', '5to Año',
];

const ESTADO = { PRESENTE: 'presente', AUSENTE: 'ausente', JUSTIFICADO: 'justificado', SIN_MARCAR: null };

const SkeletonFila = () => (
  <div className="p-4 rounded-xl animate-pulse flex items-center justify-between" style={{ background: 'var(--ash-light)' }}>
    <div className="h-4 w-40 rounded" style={{ background: 'var(--border-md)' }} />
    <div className="flex gap-2">
      {[...Array(3)].map((_, i) => <div key={i} className="h-8 w-24 rounded-lg" style={{ background: 'var(--border-md)' }} />)}
    </div>
  </div>
);

const Asistencia = () => {
  const [fecha, setFecha] = useState(new Date());
  const [grado, setGrado] = useState('');
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchAsistencia = useCallback(async () => {
    if (!grado || !fecha) { setRegistros([]); return; }
    setLoading(true);
    setDirty(false);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const res = await getAsistencia(grado, fechaStr);
      // Asegurar que cada registro tenga campo estado derivado
      const data = (res.data || []).map(r => ({
        ...r,
        _estado: r.presente === true && !r.justificada ? ESTADO.PRESENTE
          : r.justificada ? ESTADO.JUSTIFICADO
          : r.presente === false ? ESTADO.AUSENTE
          : ESTADO.SIN_MARCAR,
      }));
      setRegistros(data);
    } catch {
      toast.error('No se pudo cargar la asistencia.');
    } finally {
      setLoading(false);
    }
  }, [grado, fecha]);

  useEffect(() => { fetchAsistencia(); }, [fetchAsistencia]);

  const marcar = (alumnoId, estado) => {
    setDirty(true);
    setRegistros(prev => prev.map(r => {
      if (r.alumno_id !== alumnoId) return r;
      return {
        ...r,
        _estado: estado,
        presente: estado === ESTADO.PRESENTE,
        justificada: estado === ESTADO.JUSTIFICADO,
        // limpiar observación si pasa a presente
        observacion: estado === ESTADO.PRESENTE ? '' : r.observacion,
      };
    }));
  };

  const setObservacion = (alumnoId, valor) => {
    setDirty(true);
    setRegistros(prev => prev.map(r => r.alumno_id !== alumnoId ? r : { ...r, observacion: valor }));
  };

  const handleSave = async () => {
    if (!grado || !fecha) { toast.warning('Selecciona grado y fecha.'); return; }
    setSaving(true);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const payload = registros.map(r => ({
        alumno_id: r.alumno_id,
        presente: r._estado === ESTADO.PRESENTE,
        justificada: r._estado === ESTADO.JUSTIFICADO,
        observacion: r.observacion || '',
      }));
      await saveAsistencia(grado, fechaStr, payload);
      toast.success('Asistencia guardada correctamente.');
      setDirty(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar asistencia.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const counts = registros.reduce(
    (acc, r) => {
      if (r._estado === ESTADO.PRESENTE) acc.presentes++;
      else if (r._estado === ESTADO.AUSENTE) acc.ausentes++;
      else if (r._estado === ESTADO.JUSTIFICADO) acc.justificados++;
      else acc.sinMarcar++;
      return acc;
    },
    { presentes: 0, ausentes: 0, justificados: 0, sinMarcar: 0 }
  );

  const btnEstado = (alumnoId, estado, currentEstado) => {
    const configs = {
      [ESTADO.PRESENTE]: {
        label: 'Presente',
        icon: <CheckCircle size={14} />,
        activeStyle: { background: '#dcfce7', color: '#16a34a', border: '1.5px solid #16a34a' },
        idleStyle: { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' },
      },
      [ESTADO.AUSENTE]: {
        label: 'Ausente',
        icon: <XCircle size={14} />,
        activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' },
        idleStyle: { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' },
      },
      [ESTADO.JUSTIFICADO]: {
        label: 'Justificado',
        icon: <AlertCircle size={14} />,
        activeStyle: { background: '#fef9c3', color: '#854d0e', border: '1.5px solid #ca8a04' },
        idleStyle: { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' },
      },
    };
    const cfg = configs[estado];
    const isActive = currentEstado === estado;
    return (
      <button
        key={estado}
        onClick={() => marcar(alumnoId, isActive ? ESTADO.SIN_MARCAR : estado)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={isActive ? cfg.activeStyle : cfg.idleStyle}
      >
        {cfg.icon}
        <span className="hidden sm:inline">{cfg.label}</span>
      </button>
    );
  };

  const inputStyle = {
    border: '0.5px solid var(--border-md)',
    background: '#fff',
    color: 'var(--jet)',
  };

  return (
    <div className="animate-fadeIn">
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
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !registros.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Guardando...' : 'Guardar asistencia'}
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Fecha
          </label>
          <DatePicker
            selected={fecha}
            onChange={setFecha}
            locale={es}
            dateFormat="dd/MM/yyyy"
            maxDate={new Date()}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            wrapperClassName="w-full"
            customInput={
              <input
                className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={inputStyle}
              />
            }
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Grado / Año
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
            value={grado}
            onChange={e => setGrado(e.target.value)}
          >
            <option value="">Seleccionar grado...</option>
            <optgroup label="Primaria">
              {GRADOS.slice(0, 6).map(g => <option key={g} value={g}>{g}</option>)}
            </optgroup>
            <optgroup label="Media General">
              {GRADOS.slice(6).map(g => <option key={g} value={g}>{g}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Contador */}
      {grado && !loading && registros.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Presentes', val: counts.presentes, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Ausentes', val: counts.ausentes, color: 'var(--red)', bg: 'var(--red-light)' },
            { label: 'Justificados', val: counts.justificados, color: '#854d0e', bg: '#fef9c3' },
            { label: 'Sin marcar', val: counts.sinMarcar, color: 'var(--ash)', bg: 'var(--ash-light)' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: item.bg }}>
              <Users size={18} style={{ color: item.color }} />
              <div>
                <p className="text-xl font-bold leading-none" style={{ color: item.color }}>{item.val}</p>
                <p className="text-xs" style={{ color: item.color }}>{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {(!grado) ? (
        <div className="rounded-xl p-16 text-center" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona grado y fecha para cargar la lista.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {loading
            ? [...Array(8)].map((_, i) => <SkeletonFila key={i} />)
            : registros.length === 0
              ? (
                <div className="rounded-xl p-16 text-center" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                  <p className="text-sm">No hay alumnos registrados en este grado.</p>
                </div>
              )
              : registros.map(r => (
                <div key={r.alumno_id} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase"
                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
                      >
                        {(r.alumno_nombre || '?').charAt(0)}
                      </div>
                      <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{r.alumno_nombre}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {btnEstado(r.alumno_id, ESTADO.PRESENTE, r._estado)}
                      {btnEstado(r.alumno_id, ESTADO.AUSENTE, r._estado)}
                      {btnEstado(r.alumno_id, ESTADO.JUSTIFICADO, r._estado)}
                    </div>
                  </div>
                  {/* Campo observación visible si ausente o justificado */}
                  {(r._estado === ESTADO.AUSENTE || r._estado === ESTADO.JUSTIFICADO) && (
                    <div className="px-4 pb-3">
                      <input
                        type="text"
                        placeholder="Observación (opcional)..."
                        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--ash-light)', color: 'var(--jet)' }}
                        value={r.observacion || ''}
                        onChange={e => setObservacion(r.alumno_id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
};

export default Asistencia;
