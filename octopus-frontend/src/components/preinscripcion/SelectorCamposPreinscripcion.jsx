import { useEffect, useRef, useState } from 'react';
import { FileText, Files, Loader2, X, CheckSquare, Square } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
    SECCIONES_CAMPOS_PREINSCRIPCION,
    TODOS_LOS_CAMPOS_PREINSCRIPCION,
    LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION,
} from '../../constants/preinscripcionCampos';

function cargarSeleccionGuardada() {
    try {
        const raw = localStorage.getItem(LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION);
        if (!raw) return TODOS_LOS_CAMPOS_PREINSCRIPCION;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return TODOS_LOS_CAMPOS_PREINSCRIPCION;
        return parsed.filter((k) => TODOS_LOS_CAMPOS_PREINSCRIPCION.includes(k));
    } catch {
        return TODOS_LOS_CAMPOS_PREINSCRIPCION;
    }
}

const SelectorCamposPreinscripcion = ({ modo, generando, onCerrar, onGenerar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);
    const [seleccion, setSeleccion] = useState(cargarSeleccionGuardada);
    const [formato, setFormato] = useState('individual'); // 'individual' | 'unico'

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCerrar(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onCerrar]);

    const toggleCampo = (key) => {
        setSeleccion((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    };

    const seleccionarTodos = () => setSeleccion(TODOS_LOS_CAMPOS_PREINSCRIPCION);
    const deseleccionarTodos = () => setSeleccion([]);

    const handleGenerar = () => {
        localStorage.setItem(LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION, JSON.stringify(seleccion));
        onGenerar(seleccion, formato);
    };

    return (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
             style={{ background: 'rgba(43,48,58,0.5)' }} onClick={onCerrar}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-preinscripcion-titulo"
                className="rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[90vh]"
                style={{ background: 'var(--porcelain)' }}
                onClick={(e) => e.stopPropagation()}>

                <div className="p-6 flex justify-between items-center flex-shrink-0"
                     style={{ background: 'var(--pb)', color: '#fff' }}>
                    <h3 id="modal-preinscripcion-titulo" className="font-bold flex items-center gap-2">
                        <FileText size={18} />
                        {modo === 'masivo' ? 'Generar Pre-Inscripción (todos)' : 'Generar Pre-Inscripción'}
                    </h3>
                    <button onClick={onCerrar} aria-label="Cerrar" disabled={generando}>
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 pt-4 flex gap-3 flex-shrink-0">
                    <button onClick={seleccionarTodos}
                        className="text-xs font-medium underline" style={{ color: 'var(--pb)' }}>
                        Seleccionar todos
                    </button>
                    <button onClick={deseleccionarTodos}
                        className="text-xs font-medium underline" style={{ color: 'var(--ash)' }}>
                        Deseleccionar todos
                    </button>
                </div>

                {modo === 'masivo' && (
                    <div className="px-6 pt-4 flex-shrink-0">
                        <p className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--ash)' }}>
                            Formato de salida
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setFormato('individual')}
                                className="flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm"
                                style={{
                                    border: `0.5px solid ${formato === 'individual' ? 'var(--pb)' : 'var(--border-md)'}`,
                                    color: formato === 'individual' ? 'var(--jet)' : 'var(--ash)',
                                }}>
                                <FileText size={16} style={{ color: formato === 'individual' ? 'var(--pb)' : 'var(--ash)' }} />
                                <span>
                                    Individuales
                                    <span className="block text-[11px]" style={{ color: 'var(--ash)' }}>.zip, un .docx por alumno</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormato('unico')}
                                className="flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm"
                                style={{
                                    border: `0.5px solid ${formato === 'unico' ? 'var(--pb)' : 'var(--border-md)'}`,
                                    color: formato === 'unico' ? 'var(--jet)' : 'var(--ash)',
                                }}>
                                <Files size={16} style={{ color: formato === 'unico' ? 'var(--pb)' : 'var(--ash)' }} />
                                <span>
                                    Documento único
                                    <span className="block text-[11px]" style={{ color: 'var(--ash)' }}>un .docx con todas</span>
                                </span>
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-6 pt-3 space-y-5 overflow-y-auto">
                    {SECCIONES_CAMPOS_PREINSCRIPCION.map((seccion) => (
                        <div key={seccion.titulo}>
                            <p className="text-[11px] uppercase tracking-widest font-bold mb-2"
                               style={{ color: 'var(--ash)' }}>
                                {seccion.titulo}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {seccion.campos.map((campo) => {
                                    const activo = seleccion.includes(campo.key);
                                    return (
                                        <button
                                            key={campo.key}
                                            type="button"
                                            onClick={() => toggleCampo(campo.key)}
                                            className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-sm"
                                            style={{ color: activo ? 'var(--jet)' : 'var(--ash)' }}>
                                            {activo
                                                ? <CheckSquare size={16} style={{ color: 'var(--pb)' }} />
                                                : <Square size={16} />}
                                            {campo.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 pt-4 flex gap-3 flex-shrink-0" style={{ borderTop: '0.5px solid var(--border)' }}>
                    <button onClick={onCerrar} disabled={generando}
                        className="flex-1 py-3 rounded-xl font-bold disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button onClick={handleGenerar} disabled={generando}
                        className="flex-[2] py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {generando ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                        {generando ? 'Generando...' : 'Generar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SelectorCamposPreinscripcion;
