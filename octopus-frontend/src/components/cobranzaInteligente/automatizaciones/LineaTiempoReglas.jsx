import { Pencil, Plus } from 'lucide-react';
import { aplicaAB, CANALES, DESTINATARIOS, etiqueta, etiquetaDia, descripcionDia } from './automatizacionesUtils';

const Chip = ({ children }) => (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>{children}</span>
);

const COLOR_ETAPA = {
    preventiva: 'var(--pb)',
    temprana: '#d99a00',
    prioritaria: 'var(--red)',
};

/** Reglas por día relativo al vencimiento como línea de tiempo vertical (mobile-first). */
export function LineaTiempoReglas({ reglas, soloLectura, onEditar, onNueva }) {
    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    Qué se envía y cuándo, respecto del vencimiento de cada deuda.
                </p>
                {!soloLectura && (
                    <button type="button" onClick={onNueva}
                        className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--pb)', color: '#fff' }}>
                        <Plus size={16} />Nueva regla
                    </button>
                )}
            </div>
            <ol className="relative space-y-3 pl-6 sm:pl-8" aria-label="Línea de tiempo de reglas">
                <span aria-hidden="true" className="absolute left-2 sm:left-3 top-2 bottom-2 w-0.5" style={{ background: 'var(--border-md)' }} />
                {reglas.map(r => (
                    <li key={r.id} className="relative" data-testid="regla-item">
                        <span aria-hidden="true" className="absolute -left-[22px] sm:-left-[26px] top-3 h-3 w-3 rounded-full"
                            style={{ background: r.activa ? COLOR_ETAPA[r.etapa] : 'var(--ash-light)', boxShadow: '0 0 0 3px #fff' }} />
                        <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: r.activa ? 1 : 0.6 }}>
                            <div className="min-w-0 space-y-1">
                                <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>
                                    <span className="mr-2 px-2 py-0.5 rounded-md text-xs" style={{ background: 'var(--ash-light)' }}>{etiquetaDia(r.dia_relativo)}</span>
                                    {r.nombre}{!r.activa && ' · inactiva'}
                                </p>
                                <p className="text-xs break-words" style={{ color: 'var(--ash)' }}>
                                    {descripcionDia(r.dia_relativo)} · {etiqueta(CANALES, r.canal)} · a {etiqueta(DESTINATARIOS, r.destinatario).toLowerCase()}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {r.heredada && <Chip>Heredada de las globales</Chip>}
                                    {(r.ab_activo ?? (r.plantilla_meta && r.plantilla_meta_b && aplicaAB(r))) && <Chip>A/B</Chip>}
                                    {r.recordatorio_extra_paga_tarde && <Chip>Extra −3 · paga tarde</Chip>}
                                </div>
                            </div>
                            {!soloLectura && (
                                <button type="button" onClick={() => onEditar(r)} aria-label={`Editar regla ${r.nombre}`}
                                    className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                                    <Pencil size={14} />Editar
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export default LineaTiempoReglas;
