import { useState } from 'react';
import { FileText, Files, Loader2, CheckSquare, Square } from 'lucide-react';
import {
    SECCIONES_CAMPOS_PREINSCRIPCION,
    TODOS_LOS_CAMPOS_PREINSCRIPCION,
    LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION,
} from '../../constants/preinscripcionCampos';
import { Modal } from '../ui/Modal';

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
    const [seleccion, setSeleccion] = useState(cargarSeleccionGuardada);
    const [formato, setFormato] = useState('individual'); // 'individual' | 'unico'

    const toggleCampo = (key) => {
        setSeleccion((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    };

    const seleccionarTodos = () => setSeleccion(TODOS_LOS_CAMPOS_PREINSCRIPCION);
    const deseleccionarTodos = () => setSeleccion([]);

    const handleGenerar = () => {
        localStorage.setItem(LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION, JSON.stringify(seleccion));
        onGenerar(seleccion, formato);
    };

    const handleClose = () => { if (!generando) onCerrar(); };

    const footer = (
        <>
            <button onClick={handleClose} disabled={generando}
                className="w-full sm:w-auto py-3 rounded-xl font-bold disabled:opacity-50"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button onClick={handleGenerar} disabled={generando}
                className="w-full sm:w-auto py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {generando ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                {generando ? 'Generando...' : 'Generar'}
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={handleClose}
            className="z-[70]"
            titulo={(
                <>
                    <FileText size={17} />
                    {modo === 'masivo' ? 'Generar Pre-Inscripción (todos)' : 'Generar Pre-Inscripción'}
                </>
            )}
            footer={footer}
            size="md"
        >
            <div className="flex gap-3 -mt-2 mb-4">
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
                <div className="mb-5">
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

            <div className="space-y-5">
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
        </Modal>
    );
};

export default SelectorCamposPreinscripcion;
