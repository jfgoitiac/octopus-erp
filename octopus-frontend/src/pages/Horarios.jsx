import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Edit3, Printer, X, GraduationCap, Loader2, Save, Wand2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { getMaterias, getHorarios, saveHorario, updateHorario, deleteHorario, generarHorario } from '../api/academico.service';

const GRADOS = [
  '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
  '1er Año', '2do Año', '3er Año', '4to Año', '5to Año',
];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const DIA_MAP = { Lunes: 1, Martes: 2, 'Miércoles': 3, Jueves: 4, Viernes: 5 };
const DIA_VALUE = { Lunes: 'lunes', Martes: 'martes', 'Miércoles': 'miercoles', Jueves: 'jueves', Viernes: 'viernes' };

// Bloques de 1 hora, 7:00 a 17:00
const HORAS = [];
for (let h = 7; h < 17; h++) {
  HORAS.push(`${String(h).padStart(2, '0')}:00`);
}

const inputStyle = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
};

const COLORS = [
  '#e0f2fe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe',
  '#ffedd5', '#f0fdf4', '#e0e7ff', '#fef3c7', '#ecfeff',
];
const getColor = (materiaId) => COLORS[(materiaId || 0) % COLORS.length];

// ─────────────────────────────────────────────
// MODAL CLASE (manual)
// ─────────────────────────────────────────────
const ModalClase = ({ grado, materias, claseInicial, onClose, onSave, saving }) => {
  const [form, setForm] = useState(
    claseInicial
      ? {
          id: claseInicial.id,
          materia_id: claseInicial.materia?.id || '',
          dia_semana: claseInicial.dia_semana,
          hora_inicio: claseInicial.hora_inicio,
          hora_fin: claseInicial.hora_fin,
          aula: claseInicial.aula || '',
        }
      : {
          id: null,
          materia_id: '',
          dia_semana: '',
          hora_inicio: '',
          hora_fin: '',
          aula: '',
        }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.materia_id || !form.dia_semana || !form.hora_inicio || !form.hora_fin) {
      toast.warning('Completa todos los campos obligatorios.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
      <div className="rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn" style={{ background: 'var(--porcelain)' }}>
        <div className="p-5 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
          <h3 className="font-bold text-base">{form.id ? 'Editar Clase' : 'Nueva Clase'}</h3>
          <button onClick={onClose} style={{ color: '#fff' }}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Materia</label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
              value={form.materia_id}
              onChange={e => setForm({ ...form, materia_id: e.target.value })}
              required
            >
              <option value="">Seleccionar...</option>
              {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Día</label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
              value={form.dia_semana}
              onChange={e => setForm({ ...form, dia_semana: e.target.value })}
              required
            >
              <option value="">Seleccionar...</option>
              {DIAS.map(d => <option key={d} value={DIA_MAP[d]}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Hora inicio</label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.hora_inicio}
                onChange={e => setForm({ ...form, hora_inicio: e.target.value })}
                required
              >
                <option value="">—</option>
                {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Hora fin</label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.hora_fin}
                onChange={e => setForm({ ...form, hora_fin: e.target.value })}
                required
              >
                <option value="">—</option>
                {HORAS.map(h => <option key={h} value={`${String(parseInt(h) + 1).padStart(2, '0')}:00`}>{`${String(parseInt(h) + 1).padStart(2, '0')}:00`}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Aula</label>
            <input
              type="text"
              placeholder="Ej: Aula 3, Lab. Ciencias..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
              value={form.aula}
              onChange={e => setForm({ ...form, aula: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {form.id ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL GENERADOR AUTOMÁTICO
// ─────────────────────────────────────────────
const DIAS_CONFIG = [
  { label: 'Lunes',     value: 'lunes' },
  { label: 'Martes',    value: 'martes' },
  { label: 'Miércoles', value: 'miercoles' },
  { label: 'Jueves',    value: 'jueves' },
  { label: 'Viernes',   value: 'viernes' },
];

const ModalGenerador = ({ grado, onClose, onGenerado }) => {
  const [config, setConfig] = useState({
    horas_por_dia: 6,
    hora_inicio: '07:00',
    hora_fin: '13:00',
    duracion_clase_min: 60,
    recreo_hora: '09:00',
    recreo_duracion_min: 20,
    dias: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    reemplazar_existente: false,
  });
  const [generando, setGenerando] = useState(false);
  const [advertencias, setAdvertencias] = useState([]);

  const toggleDia = (val) => {
    setConfig(prev => ({
      ...prev,
      dias: prev.dias.includes(val)
        ? prev.dias.filter(d => d !== val)
        : [...prev.dias, val],
    }));
  };

  const handleGenerar = async () => {
    if (!config.dias.length) {
      toast.warning('Selecciona al menos un día de clases.');
      return;
    }
    setGenerando(true);
    setAdvertencias([]);
    try {
      const payload = {
        grado_seccion:        grado,
        horas_por_dia:        config.horas_por_dia,
        hora_inicio:          config.hora_inicio,
        hora_fin:             config.hora_fin,
        duracion_clase_min:   config.duracion_clase_min,
        dias:                 config.dias,
        recreo_hora:          config.recreo_hora,
        recreo_duracion_min:  config.recreo_duracion_min,
        reemplazar_existente: config.reemplazar_existente,
      };
      const res = await generarHorario(payload);
      const data = res.data;

      if (data.advertencias && data.advertencias.length > 0) {
        setAdvertencias(data.advertencias);
        toast.success(`${data.clases_creadas} clases generadas con advertencias.`);
      } else {
        toast.success(`${data.clases_creadas} clases generadas correctamente.`);
        onClose();
        onGenerado();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al generar el horario.';
      toast.error(msg);
    } finally {
      setGenerando(false);
    }
  };

  const handleCerrarConAdvertencias = () => {
    onClose();
    onGenerado();
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
      <div className="rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn" style={{ background: 'var(--porcelain)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="p-5 flex justify-between items-center sticky top-0 z-10" style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Wand2 size={18} />
            Generar horario automático
          </h3>
          <button onClick={onClose} style={{ color: '#fff' }}><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Advertencias del backend */}
          {advertencias.length > 0 && (
            <div className="rounded-xl p-4 space-y-1" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#92400e' }}>
                <AlertTriangle size={14} />
                El horario se generó con las siguientes advertencias:
              </p>
              <ul className="mt-2 space-y-1">
                {advertencias.map((a, i) => (
                  <li key={i} className="text-xs" style={{ color: '#78350f' }}>• {a}</li>
                ))}
              </ul>
              <button
                onClick={handleCerrarConAdvertencias}
                className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: '#d97706' }}
              >
                Entendido — ver horario generado
              </button>
            </div>
          )}

          {/* Fila: horas por día, duración */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Horas por día
              </label>
              <input
                type="number" min={1} max={12}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.horas_por_dia}
                onChange={e => setConfig({ ...config, horas_por_dia: parseInt(e.target.value) || 6 })}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Duración clase (min)
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.duracion_clase_min}
                onChange={e => setConfig({ ...config, duracion_clase_min: parseInt(e.target.value) })}
              >
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>

          {/* Fila: hora inicio / fin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora de inicio
              </label>
              <input
                type="time"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.hora_inicio}
                onChange={e => setConfig({ ...config, hora_inicio: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora de fin
              </label>
              <input
                type="time"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.hora_fin}
                onChange={e => setConfig({ ...config, hora_fin: e.target.value })}
              />
            </div>
          </div>

          {/* Fila: recreo hora / duración */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora del recreo
              </label>
              <input
                type="time"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.recreo_hora}
                onChange={e => setConfig({ ...config, recreo_hora: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Duración recreo (min)
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                value={config.recreo_duracion_min}
                onChange={e => setConfig({ ...config, recreo_duracion_min: parseInt(e.target.value) })}
              >
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          </div>

          {/* Días de clases */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
              Días de clases
            </label>
            <div className="flex flex-wrap gap-2">
              {DIAS_CONFIG.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDia(d.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={
                    config.dias.includes(d.value)
                      ? { background: 'var(--pb)', color: '#fff', border: '1px solid var(--pb)' }
                      : { background: 'var(--porcelain)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reemplazar existente */}
          <div className="rounded-xl p-4" style={{ background: config.reemplazar_existente ? '#fef2f2' : 'var(--porcelain)', border: `0.5px solid ${config.reemplazar_existente ? '#fca5a5' : 'var(--border-md)'}` }}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded"
                checked={config.reemplazar_existente}
                onChange={e => setConfig({ ...config, reemplazar_existente: e.target.checked })}
              />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                  Reemplazar horario existente
                </span>
                {config.reemplazar_existente && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                    Advertencia: esto eliminará todas las clases actuales de este grado y las reemplazará con las nuevas generadas.
                  </p>
                )}
              </div>
            </label>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGenerar}
              disabled={generando || !config.dias.length}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}
            >
              {generando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {generando ? 'Generando...' : 'Generar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────
const Horarios = () => {
  const [grado, setGrado] = useState('');
  const [horarios, setHorarios] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showModalGenerador, setShowModalGenerador] = useState(false);
  const [claseSeleccionada, setClaseSeleccionada] = useState(null);
  const [celda, setCelda] = useState(null); // { dia, hora } para nueva clase
  const [saving, setSaving] = useState(false);

  const fetchHorarios = useCallback(async () => {
    if (!grado) { setHorarios([]); return; }
    setLoading(true);
    try {
      const [resH, resM] = await Promise.all([
        getHorarios(grado),
        getMaterias(grado),
      ]);
      setHorarios(resH.data || []);
      setMaterias(resM.data || []);
    } catch {
      toast.error('No se pudo cargar el horario.');
    } finally {
      setLoading(false);
    }
  }, [grado]);

  useEffect(() => { fetchHorarios(); }, [fetchHorarios]);

  // Buscar clase en celda (dia, hora)
  const getClaseEnCelda = (dia, hora) => {
    const diaNum = DIA_MAP[dia];
    return horarios.find(h => h.dia_semana === diaNum && h.hora_inicio === hora) || null;
  };

  const handleCeldaClick = (dia, hora) => {
    const clase = getClaseEnCelda(dia, hora);
    if (clase) {
      setClaseSeleccionada(clase);
    } else {
      setClaseSeleccionada(null);
      setCelda({ dia: DIA_MAP[dia], hora });
    }
    setShowModal(true);
  };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const payload = {
        grado_seccion: grado,
        materia_id: form.materia_id,
        dia_semana: parseInt(form.dia_semana),
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        aula: form.aula,
      };
      if (form.id) {
        await updateHorario(form.id, payload);
        toast.success('Clase actualizada.');
      } else {
        await saveHorario(payload);
        toast.success('Clase agregada al horario.');
      }
      setShowModal(false);
      fetchHorarios();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar la clase.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta clase del horario?')) return;
    setSaving(true);
    try {
      await deleteHorario(id);
      toast.success('Clase eliminada.');
      setShowModal(false);
      fetchHorarios();
    } catch {
      toast.error('Error al eliminar la clase.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  // Merge celda preseleccionada en el modal de nueva clase
  const claseParaModal = claseSeleccionada || (celda ? {
    id: null,
    materia: null,
    dia_semana: celda.dia,
    hora_inicio: celda.hora,
    hora_fin: `${String(parseInt(celda.hora) + 1).padStart(2, '0')}:00`,
    aula: '',
  } : null);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Clock size={20} style={{ color: 'var(--pb)' }} />
            Horarios de Clases
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Visualiza y edita la grilla horaria por grado
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón generar automático */}
          <button
            onClick={() => setShowModalGenerador(true)}
            disabled={!grado}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-white disabled:opacity-40"
            style={{ background: 'var(--pb)' }}
            title={!grado ? 'Selecciona un grado primero' : 'Generar horario automáticamente'}
          >
            <Wand2 size={16} />
            Generar automático
          </button>
          <button
            onClick={handlePrint}
            disabled={!grado || !horarios.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            <Printer size={16} />
            Vista imprimible
          </button>
        </div>
      </div>

      {/* Selector grado */}
      <div className="mb-6 max-w-xs">
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

      {!grado ? (
        <div className="rounded-xl p-16 text-center" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona un grado para ver el horario.</p>
        </div>
      ) : loading ? (
        <div className="rounded-xl p-10 text-center animate-pulse" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <Loader2 className="animate-spin mx-auto mb-2" size={24} style={{ color: 'var(--pb)' }} />
          <p className="text-sm">Cargando horario...</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden print:shadow-none" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th className="px-3 py-3 text-[11px] uppercase tracking-widest text-left w-20"
                    style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                    Hora
                  </th>
                  {DIAS.map(d => (
                    <th key={d} className="px-3 py-3 text-[11px] uppercase tracking-widest text-center"
                      style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)', borderLeft: '0.5px solid var(--border)' }}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS.map(hora => (
                  <tr key={hora} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                      {hora}
                    </td>
                    {DIAS.map(dia => {
                      const clase = getClaseEnCelda(dia, hora);
                      return (
                        <td key={dia} className="px-2 py-1.5 text-center"
                          style={{ borderLeft: '0.5px solid var(--border)', background: 'var(--porcelain)', verticalAlign: 'middle', minWidth: 110 }}>
                          {clase ? (
                            <button
                              onClick={() => handleCeldaClick(dia, hora)}
                              className="w-full rounded-lg px-2 py-2 text-left transition-all hover:opacity-80 group relative"
                              style={{ background: getColor(clase.materia?.id), border: '1px solid rgba(0,0,0,0.07)' }}
                            >
                              <p className="text-[11px] font-bold leading-tight" style={{ color: 'var(--jet)' }}>
                                {clase.materia?.nombre || 'Materia'}
                              </p>
                              {clase.aula && (
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>{clase.aula}</p>
                              )}
                              <p className="text-[9px] mt-0.5 opacity-60" style={{ color: 'var(--jet)' }}>
                                {clase.hora_inicio} - {clase.hora_fin}
                              </p>
                              {/* Overlay editar/eliminar */}
                              <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                                <span className="p-0.5 rounded" style={{ background: 'rgba(255,255,255,0.8)' }}>
                                  <Edit3 size={10} style={{ color: 'var(--pb)' }} />
                                </span>
                              </div>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCeldaClick(dia, hora)}
                              className="w-full h-12 rounded-lg flex items-center justify-center transition-all opacity-0 hover:opacity-100"
                              style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
                              title="Agregar clase"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leyenda */}
      {grado && !loading && (
        <p className="mt-3 text-xs" style={{ color: 'var(--ash)' }}>
          Haz clic en una celda vacía para agregar clase, o en una existente para editarla.
        </p>
      )}

      {/* Modal clase manual */}
      {showModal && claseParaModal && (
        <ModalClase
          grado={grado}
          materias={materias}
          claseInicial={claseParaModal}
          onClose={() => { setShowModal(false); setClaseSeleccionada(null); setCelda(null); }}
          onSave={handleSave}
          saving={saving}
          onDelete={claseSeleccionada?.id ? () => handleDelete(claseSeleccionada.id) : null}
        />
      )}

      {/* Botón eliminar si hay clase seleccionada */}
      {showModal && claseSeleccionada?.id && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
          <button
            onClick={() => handleDelete(claseSeleccionada.id)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white shadow-xl"
            style={{ background: 'var(--red)' }}
          >
            <Trash2 size={14} />
            Eliminar clase
          </button>
        </div>
      )}

      {/* Modal generador automático */}
      {showModalGenerador && (
        <ModalGenerador
          grado={grado}
          onClose={() => setShowModalGenerador(false)}
          onGenerado={() => {
            setShowModalGenerador(false);
            fetchHorarios();
          }}
        />
      )}
    </div>
  );
};

export default Horarios;
