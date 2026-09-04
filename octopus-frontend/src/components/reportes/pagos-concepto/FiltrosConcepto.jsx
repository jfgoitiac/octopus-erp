import { ClipboardCopy } from 'lucide-react';

const SelectStyle = {
    background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    borderRadius: '8px', color: 'var(--jet)', fontSize: '14px',
    padding: '8px 10px', outline: 'none',
};

/**
 * Barra de filtros de la pestaña "Pagos por concepto": selector de concepto
 * (poblado 100% por el backend), selector de vista, checkbox de "al día" y
 * botón de copiar resumen.
 */
const FiltrosConcepto = ({
    conceptos, concepto, onConceptoChange,
    vista, onVistaChange,
    mostrarAlDia, onMostrarAlDiaChange,
    onCopiarResumen, copiarDisabled,
}) => (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <select
            aria-label="Concepto"
            value={concepto ?? ''}
            onChange={e => onConceptoChange(e.target.value)}
            style={SelectStyle}
            className="w-full sm:w-auto sm:min-w-[220px]"
        >
            {conceptos.map(c => (
                <option key={c.clave} value={c.clave}>{c.nombre}</option>
            ))}
        </select>

        <select
            aria-label="Vista"
            value={vista}
            onChange={e => onVistaChange(e.target.value)}
            style={SelectStyle}
            className="w-full sm:w-auto"
        >
            <option value="global">Global</option>
            <option value="grado">Por grado</option>
        </select>

        <label className="flex items-center gap-2 text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>
            <input
                type="checkbox"
                checked={mostrarAlDia}
                onChange={e => onMostrarAlDiaChange(e.target.checked)}
                className="w-4 h-4"
            />
            Mostrar también lo que está al día
        </label>

        <button
            onClick={onCopiarResumen}
            disabled={copiarDisabled}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 w-full sm:w-auto sm:ml-auto min-h-[40px]"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
        >
            <ClipboardCopy size={13} />
            Copiar resumen
        </button>
    </div>
);

export default FiltrosConcepto;
