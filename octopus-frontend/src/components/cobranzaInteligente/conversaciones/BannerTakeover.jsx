import { Bot, Loader2, UserCheck } from 'lucide-react';
import { haceTiempo } from '../hoy/hoyUtils';

const btn = 'w-full sm:w-auto min-h-11 px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50';

/** Estado de la conversación: "Automático" (responde el sistema) o "Atendido por…" (la tomó una persona). */
export function BannerTakeover({ conversacion, onTomar, onDevolver, ocupado = false }) {
    const humano = conversacion?.estado === 'humano';
    const Icono = humano ? UserCheck : Bot;
    const hace = humano ? haceTiempo(conversacion?.tomada_en) : '';

    return (
        <div className="shrink-0 space-y-2">
            <div role="status"
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 sm:px-4"
                style={{ background: humano ? 'var(--pb-light)' : 'var(--ash-light)', borderBottom: '0.5px solid var(--border)' }}>
                <div className="flex items-start gap-2 min-w-0">
                    <Icono size={18} className="shrink-0 mt-0.5" aria-hidden="true" style={{ color: humano ? 'var(--pb-mid)' : 'var(--jet-mid)' }} />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                            {humano ? `Atendido por ${conversacion?.tomada_por?.nombre || 'un cobrador'}` : 'Automático'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
                            {humano
                                ? `El sistema no le escribe a esta familia mientras la atiendes${hace ? ` · tomada ${hace}` : ''}.`
                                : 'El sistema envía los recordatorios y responde a los botones. Escribe para tomarla.'}
                        </p>
                    </div>
                </div>
                {humano ? (
                    <button type="button" onClick={onDevolver} disabled={ocupado} className={btn}
                        style={{ border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--jet)' }}>
                        {ocupado && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                        Devolver al automático
                    </button>
                ) : (
                    <button type="button" onClick={onTomar} disabled={ocupado} className={btn}
                        style={{ background: 'var(--pb)', color: '#fff' }}>
                        {ocupado && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                        Tomar conversación
                    </button>
                )}
            </div>
            {conversacion?.requiere_humano && (
                <p role="alert" className="mx-3 sm:mx-4 text-xs rounded-xl px-3 py-2"
                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                    La familia pidió hablar con una persona o escribió algo que el sistema no reconoce.
                </p>
            )}
        </div>
    );
}

export default BannerTakeover;
