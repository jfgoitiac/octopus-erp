import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, User, Search, MessageCircle } from 'lucide-react';
import { buscarAlumnos } from '../../api/secretaria.service';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

export default function ModalNuevaConversacion({ onClose, onSubmit }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [alumno, setAlumno] = useState(null);
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const searchRef = useRef(null);
  const abortRef = useRef(null);

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

  const handleEnviar = async () => {
    if (!alumno) { toast.warning('Selecciona un alumno.'); return; }
    if (!cuerpo.trim()) { toast.warning('Escribe un mensaje.'); return; }

    setEnviando(true);
    const ok = await onSubmit(alumno, cuerpo.trim());
    setEnviando(false);
    if (ok) onClose();
  };

  const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-conversacion-titulo"
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 id="modal-conversacion-titulo" className="font-bold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <MessageCircle size={18} style={{ color: 'var(--pb)' }} />
            Nueva Conversación
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--ash)' }} aria-label="Cerrar modal">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
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
                className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-xl overflow-hidden"
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

          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Mensaje
            </label>
            <textarea
              rows={3}
              placeholder="Escribe el mensaje para el representante..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={FIELD_STYLE}
              value={cuerpo}
              onChange={e => setCuerpo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-sm min-h-[44px]"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando}
            className="flex-1 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            {enviando ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
