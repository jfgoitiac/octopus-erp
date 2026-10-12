import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { haceTiempo } from '../hoy/hoyUtils';
import { formatoRestante, nombreConversacion, segundosRestantes } from './conversacionesUtils';

const Dato = ({ etiqueta, children }) => (
    <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{etiqueta}</dt>
        <dd className="text-sm break-words" style={{ color: 'var(--jet)' }}>{children}</dd>
    </div>
);

/** Datos del contacto y de la conversación (tercera columna en xl; modal en pantallas menores). */
export function FichaConversacion({ conversacion: c, onVincular }) {
    if (!c) return null;
    const restante = segundosRestantes(c);
    return (
        <div className="p-4 space-y-4">
            <div>
                <h3 className="text-base font-semibold break-words" style={{ color: 'var(--jet)' }}>{nombreConversacion(c)}</h3>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{c.telefono}</p>
            </div>
            <dl className="space-y-3">
                <Dato etiqueta="Representante">
                    {c.representante
                        ? <>{c.representante.nombre}<span className="block text-xs" style={{ color: 'var(--ash)' }}>C.I. {c.representante.cedula}</span></>
                        : 'Sin vincular'}
                </Dato>
                <Dato etiqueta="Estado">
                    {c.estado === 'humano' ? `Atendida por ${c.tomada_por?.nombre || 'un cobrador'}` : 'Automático'}
                </Dato>
                <Dato etiqueta="Ventana de 24 h">
                    {restante > 0 ? `Abierta · quedan ${formatoRestante(restante)}` : 'Cerrada: solo plantillas'}
                </Dato>
                {c.ultimo_entrante_en && <Dato etiqueta="Última respuesta de la familia">{haceTiempo(c.ultimo_entrante_en)}</Dato>}
            </dl>
            <div className="flex flex-col gap-2">
                {!c.representante && (
                    <button type="button" onClick={onVincular}
                        className="w-full min-h-11 px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                        style={{ background: 'var(--pb)', color: '#fff' }}>
                        <Link2 size={16} aria-hidden="true" /> Vincular representante
                    </button>
                )}
                {c.representante && (
                    <Link to="/cobranza/inteligente/cartera"
                        className="w-full min-h-11 px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center"
                        style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                        Ver en Cartera
                    </Link>
                )}
            </div>
        </div>
    );
}

export default FichaConversacion;
