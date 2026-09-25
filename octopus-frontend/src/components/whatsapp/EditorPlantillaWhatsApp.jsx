import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { obtenerVariablesWhatsApp } from '../../api/notificaciones.service';

const TIPOS = [
    ['recordatorio', 'Recordatorio amable'],
    ['segundo_aviso', 'Segundo aviso'],
    ['aviso_final', 'Aviso final'],
    ['personalizada', 'Personalizada'],
];

const vacia = {
    nombre: '',
    tipo: 'personalizada',
    cuerpo: '',
    predeterminada: false,
    activa: true,
};

const inputStyle = {
    border: '0.5px solid var(--border-md)',
    background: 'var(--porcelain)',
    color: 'var(--jet)',
};

export default function EditorPlantillaWhatsApp({ plantilla, onGuardar, guardando = false, onCambio }) {
    const [formulario, setFormulario] = useState({ ...vacia, ...plantilla });
    const [variables, setVariables] = useState([]);
    const textareaRef = useRef(null);
    const seleccionRef = useRef({ inicio: 0, fin: 0 });

    useEffect(() => setFormulario({ ...vacia, ...plantilla }), [plantilla]);

    useEffect(() => {
        obtenerVariablesWhatsApp()
            .then((res) => setVariables(res.data))
            .catch(() => toast.error('No se pudieron cargar las variables disponibles.'));
    }, []);

    useEffect(() => { onCambio?.(formulario); }, [formulario, onCambio]);

    const cambiar = (campo, valor) => setFormulario((actual) => ({ ...actual, [campo]: valor }));

    const guardarSeleccion = () => {
        const area = textareaRef.current;
        if (area) seleccionRef.current = { inicio: area.selectionStart, fin: area.selectionEnd };
    };

    const reemplazarSeleccion = (antes = '', despues = '') => {
        const area = textareaRef.current;
        const { inicio, fin } = seleccionRef.current;
        const texto = formulario.cuerpo;
        const seleccionado = texto.slice(inicio, fin);
        const nuevo = `${texto.slice(0, inicio)}${antes}${seleccionado}${despues}${texto.slice(fin)}`;
        cambiar('cuerpo', nuevo);
        requestAnimationFrame(() => {
            area?.focus();
            const cursor = inicio + antes.length + seleccionado.length + despues.length;
            area?.setSelectionRange(cursor, cursor);
            seleccionRef.current = { inicio: cursor, fin: cursor };
        });
    };

    const enviar = (event) => {
        event.preventDefault();
        if (!formulario.nombre.trim() || !formulario.cuerpo.trim()) {
            toast.error('Indica un nombre y escribe el mensaje de la plantilla.');
            return;
        }
        onGuardar(formulario);
    };

    const excedido = formulario.cuerpo.length > 1000;

    return (
        <form className="space-y-4" onSubmit={enviar}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Nombre
                    <input
                        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                        style={inputStyle}
                        onChange={(e) => cambiar('nombre', e.target.value)}
                        required
                        value={formulario.nombre}
                    />
                </label>
                <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Tipo de aviso
                    <select
                        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                        style={inputStyle}
                        onChange={(e) => cambiar('tipo', e.target.value)}
                        value={formulario.tipo}
                    >
                        {TIPOS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                    </select>
                </label>
            </div>

            <div>
                <p className="mb-2 text-sm font-medium" style={{ color: 'var(--jet)' }}>Insertar datos reales</p>
                <div className="flex flex-wrap gap-2">
                    {variables.map(({ token, boton }) => (
                        <button
                            key={token}
                            type="button"
                            className="rounded-lg px-3 py-2 text-xs sm:text-sm font-medium min-h-[40px]"
                            style={{ border: '0.5px solid var(--pb)', color: 'var(--pb-mid)', background: 'var(--pb-light)' }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => reemplazarSeleccion(token, '')}
                        >
                            {boton}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--bg)', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => reemplazarSeleccion('*', '*')}
                >
                    <Bold size={16} /> Negrita
                </button>
                <button
                    type="button"
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--bg)', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => reemplazarSeleccion('_', '_')}
                >
                    <Italic size={16} /> Cursiva
                </button>
            </div>

            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                Mensaje
                <textarea
                    ref={textareaRef}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
                    style={inputStyle}
                    onBlur={guardarSeleccion}
                    onKeyUp={guardarSeleccion}
                    onSelect={guardarSeleccion}
                    onChange={(e) => cambiar('cuerpo', e.target.value)}
                    required
                    rows={8}
                    value={formulario.cuerpo}
                />
            </label>
            <p className="text-xs" style={{ color: excedido ? '#b45309' : 'var(--ash)' }}>
                {formulario.cuerpo.length} caracteres{excedido ? '. Conviene mantener el mensaje por debajo de 1000.' : ''}
            </p>

            <label className="flex min-h-[40px] items-center gap-3 text-sm" style={{ color: 'var(--jet)' }}>
                <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={formulario.predeterminada}
                    onChange={(e) => cambiar('predeterminada', e.target.checked)}
                />
                Marcar como predeterminada
            </label>

            <button
                type="submit"
                disabled={guardando}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                style={{ background: 'var(--pb)' }}
            >
                <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar plantilla'}
            </button>
        </form>
    );
}
