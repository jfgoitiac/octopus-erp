import { Search } from 'lucide-react';
import { OPCIONES_ETAPA } from './carteraUtils';

const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const Casilla = ({ id, etiqueta, checked, onChange }) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer min-h-11 sm:min-h-0" style={{ color: 'var(--jet)' }}>
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4" />
        {etiqueta}
    </label>
);

/** Barra de filtros de la cartera. Controlada: el estado vive en Cartera. */
export function FiltrosCartera({ filtros, onChange }) {
    const set = (k, v) => onChange({ ...filtros, [k]: v });
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="relative w-full sm:w-72">
                <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input
                    type="search" aria-label="Buscar representante, cédula o alumno" placeholder="Buscar representante, cédula o alumno"
                    value={filtros.buscar} onChange={e => set('buscar', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl" style={campo}
                />
            </div>
            <select
                aria-label="Filtrar por etapa" value={filtros.etapa} onChange={e => set('etapa', e.target.value)}
                className="w-full sm:w-auto px-3 py-2 rounded-xl" style={campo}
            >
                {OPCIONES_ETAPA.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Casilla id="f-convenio" etiqueta="Con convenio" checked={filtros.conConvenio} onChange={v => set('conConvenio', v)} />
            <Casilla id="f-revision" etiqueta="Con pago en revisión" checked={filtros.conPagoRevision} onChange={v => set('conPagoRevision', v)} />
        </div>
    );
}

export default FiltrosCartera;
