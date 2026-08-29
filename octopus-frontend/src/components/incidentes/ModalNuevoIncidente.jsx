import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Loader2, User, Search, Paperclip, AlertTriangle } from 'lucide-react';
import { buscarAlumnos } from '../../api/secretaria.service';
import { Modal } from '../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const TAMANO_MAX_MB = 5;
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

const SEVERIDADES = [
  { value: 'L', label: 'Leve',     activeStyle: { background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '1.5px solid var(--pb)' } },
  { value: 'M', label: 'Moderado', activeStyle: { background: '#fef3c7', color: '#b45309', border: '1.5px solid #f59e0b' } },
  { value: 'G', label: 'Grave',    activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' } },
];
const IDLE_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };

export default function ModalNuevoIncidente({ onClose, onSubmit }) {
  const [busqueda, setBusqueda]           = useState('');
  const [resultados, setResultados]       = useState([]);
  const [buscando, setBuscando]           = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [alumno, setAlumno]               = useState(null);
  const [descripcion, setDescripcion]     = useState('');
  const [severidad, setSeveridad]         = useState('L');
  const [adjunto, setAdjunto]             = useState(null);
  const [preview, setPreview]             = useState(null);
  const [guardando, setGuardando]         = useState(false);

  const searchRef = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (busqueda.length < 2 || alumno) { setResultados([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBuscando(true);
      try {
        const res = await buscarAlumnos(busqueda, controller.signal);
        setResultados(res.data?.results ?? res.data ?? []);
        setShowDropdown(true);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al buscar alumnos.');
      } finally {
        setBuscando(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [busqueda, alumno]);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleSelectAlumno = (a) => {
    setAlumno(a);
    setBusqueda(`${a.nombre} ${a.apellido}`);
    setShowDropdown(false);
  };

  const handleChangeBusqueda = (valor) => {
    setBusqueda(valor);
    setAlumno(null);
  };

  const handleArchivo = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      toast.error('Solo se permiten imágenes JPEG, PNG o WEBP.');
      e.target.value = '';
      return;
    }
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`El adjunto no puede superar ${TAMANO_MAX_MB}MB.`);
      e.target.value = '';
      return;
    }
    setAdjunto(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  const quitarAdjunto = () => {
    setAdjunto(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const handleGuardar = async () => {
    if (!alumno) { toast.warning('Selecciona un alumno.'); return; }
    if (!descripcion.trim()) { toast.warning('Describe el incidente.'); return; }

    setGuardando(true);
    const ok = await onSubmit({ alumno_id: alumno.id, descripcion: descripcion.trim(), severidad, adjunto });
    setGuardando(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando}
        className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Registrando...</> : 'Registrar Incidente'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <AlertTriangle size={17} />
          Nuevo Incidente
        </>
      )}
      footer={footer}
      size="md"
    >
      <div className="space-y-4">
        {/* Buscador de alumno */}
        <div className="relative" ref={searchRef}>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Alumno
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5" size={16} style={{ color: 'var(--ash)' }} />
            <input
              type="text"
              placeholder="Nombre o cédula escolar..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={busqueda}
              onChange={e => handleChangeBusqueda(e.target.value)}
            />
            {buscando && <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin" style={{ color: 'var(--pb)' }} />}
          </div>

          {showDropdown && (
            <div
              className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl shadow-xl overflow-hidden"
              style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
            >
              {resultados.length > 0 ? (
                resultados.slice(0, 8).map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors"
                    style={{ color: 'var(--jet)', borderBottom: '0.5px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--pb-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => handleSelectAlumno(a)}
                  >
                    <User size={15} style={{ color: 'var(--ash)' }} />
                    <span>{a.nombre} {a.apellido}</span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>
                      {a.grado_seccion || 'Sin grado'}
                    </span>
                  </button>
                ))
              ) : (
                !buscando && (
                  <p className="px-4 py-3 text-sm" style={{ color: 'var(--ash)' }}>
                    Sin resultados para &quot;{busqueda}&quot;
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Descripción
          </label>
          <textarea
            rows={3}
            placeholder="¿Qué ocurrió?"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={FIELD_STYLE}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        {/* Severidad */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Severidad
          </label>
          <div className="flex gap-2">
            {SEVERIDADES.map(s => (
              <button
                key={s.value}
                type="button"
                aria-pressed={severidad === s.value}
                onClick={() => setSeveridad(s.value)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]"
                style={severidad === s.value ? s.activeStyle : IDLE_STYLE}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Adjunto opcional */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Foto (opcional, máx. {TAMANO_MAX_MB}MB)
          </label>
          {preview ? (
            <div className="flex items-center gap-3">
              <img src={preview} alt="Vista previa del adjunto" className="w-16 h-16 rounded-lg object-cover" style={{ border: '0.5px solid var(--border-md)' }} />
              <button
                type="button"
                onClick={quitarAdjunto}
                className="text-xs font-medium"
                style={{ color: 'var(--red)' }}
              >
                Quitar foto
              </button>
            </div>
          ) : (
            <label
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm cursor-pointer min-h-[44px]"
              style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
            >
              <Paperclip size={15} />
              Adjuntar foto
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleArchivo} />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
