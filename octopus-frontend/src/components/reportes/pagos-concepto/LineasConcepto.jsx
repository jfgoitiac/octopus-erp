import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '../../ui/Card';

const colorPorcentaje = (pct) => {
    if (pct >= 80) return '#16a34a';
    if (pct >= 50) return '#d97706';
    return '#dc2626';
};

const GradoSubfila = ({ grado, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors hover:bg-[var(--surface-sunken)]"
        style={{ color: 'var(--ash)' }}
    >
        <span className="truncate">{grado.grado_seccion}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
            <span style={{ color: 'var(--jet)' }}>{grado.pagados}/{grado.total}</span>
            <span className="font-semibold" style={{ color: colorPorcentaje(grado.porcentaje) }}>
                {grado.porcentaje.toFixed(1)}%
            </span>
        </span>
    </button>
);

const LineaFila = ({ linea, vista, onClickLinea, onClickGrado }) => {
    const [abierta, setAbierta] = useState(false);
    const etiqueta = linea.etiqueta || 'Total';
    const tieneGrados = vista === 'grado' && Array.isArray(linea.grados) && linea.grados.length > 0;

    return (
        <div className="rounded-lg" style={{ border: '0.5px solid var(--border)' }}>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onClickLinea(linea)}
                    className="flex-1 flex items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>
                        {etiqueta}
                    </span>
                    <span className="text-xs sm:text-sm flex-shrink-0" style={{ color: 'var(--ash)' }}>
                        {linea.pendientes} pendientes de {linea.total}
                        {' '}
                        <span className="font-semibold" style={{ color: colorPorcentaje(linea.porcentaje) }}>
                            ({linea.porcentaje.toFixed(1)}% cobrado)
                        </span>
                    </span>
                </button>
                {tieneGrados && (
                    <button
                        type="button"
                        onClick={() => setAbierta(v => !v)}
                        aria-expanded={abierta}
                        aria-label={`Ver grados de ${etiqueta}`}
                        className="p-2 mr-1 flex-shrink-0"
                        style={{ color: 'var(--ash)' }}
                    >
                        <ChevronDown size={16} style={{ transform: abierta ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                    </button>
                )}
            </div>
            {tieneGrados && abierta && (
                <div className="px-2 pb-2 flex flex-col gap-0.5" style={{ borderTop: '0.5px solid var(--border)' }}>
                    {linea.grados.map(g => (
                        <GradoSubfila key={g.grado_seccion} grado={g} onClick={() => onClickGrado(linea, g)} />
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Listado de líneas del concepto seleccionado. Líneas 100% cobradas
 * (pendientes===0 && parciales===0) ya vienen filtradas por el padre salvo
 * que el usuario pida verlas también.
 */
const LineasConcepto = ({ lineas, vista, onClickLinea, onClickGrado, vacioMensaje }) => {
    if (lineas.length === 0) {
        return (
            <Card>
                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
                    {vacioMensaje}
                </p>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {lineas.map((l, idx) => (
                <LineaFila
                    key={`${l.mes ?? 'x'}-${l.anio ?? 'x'}-${l.numero_cuota ?? idx}`}
                    linea={l}
                    vista={vista}
                    onClickLinea={onClickLinea}
                    onClickGrado={onClickGrado}
                />
            ))}
        </div>
    );
};

export default LineasConcepto;
