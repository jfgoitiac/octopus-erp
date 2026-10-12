import { Inbox, Search } from 'lucide-react';
import { ItemConversacion } from './ItemConversacion';
import { FILTROS } from './conversacionesUtils';

/** Lista de conversaciones con búsqueda y filtros. En móvil ocupa toda la pantalla. */
export function BandejaConversaciones({ conversaciones, loading, filtro, onFiltro, busqueda, onBusqueda, activaId, onSeleccionar }) {
    return (
        <>
            <div className="shrink-0 p-3 space-y-2" style={{ borderBottom: '0.5px solid var(--border)' }}>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--ash)' }} />
                    <input type="search" value={busqueda} onChange={e => onBusqueda(e.target.value)}
                        placeholder="Buscar por nombre, cédula o teléfono" aria-label="Buscar conversaciones"
                        className="w-full rounded-xl pl-9 pr-3 py-2 text-sm min-h-11"
                        style={{ border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--jet)' }} />
                </div>
                <div role="group" aria-label="Filtrar conversaciones" className="flex gap-1.5 overflow-x-auto pb-1">
                    {FILTROS.map(f => (
                        <button key={f.valor} type="button" onClick={() => onFiltro(f.valor)} aria-pressed={filtro === f.valor}
                            className="shrink-0 min-h-9 px-3 rounded-full text-xs font-medium"
                            style={filtro === f.valor
                                ? { background: 'var(--pb)', color: '#fff' }
                                : { background: 'var(--ash-light)', color: 'var(--jet-mid)' }}>
                            {f.etiqueta}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto" role="list" aria-label="Conversaciones">
                {loading && (
                    <div className="p-3 space-y-3 animate-pulse" aria-hidden="true">
                        {Array.from({ length: 6 }, (_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full shrink-0" style={{ background: 'var(--ash-light)' }} />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 w-2/3 rounded" style={{ background: 'var(--ash-light)' }} />
                                    <div className="h-3 w-full rounded" style={{ background: 'var(--ash-light)' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!loading && conversaciones.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-12 px-6 text-center" style={{ color: 'var(--ash)' }}>
                        <Inbox size={28} aria-hidden="true" />
                        <p className="text-sm">{busqueda || filtro !== 'todas' ? 'No hay conversaciones con ese filtro.' : 'Aún no hay conversaciones.'}</p>
                    </div>
                )}
                {!loading && conversaciones.map(c => (
                    <div key={c.id} role="listitem">
                        <ItemConversacion conversacion={c} activa={c.id === activaId} onSeleccionar={onSeleccionar} />
                    </div>
                ))}
            </div>
        </>
    );
}

export default BandejaConversaciones;
