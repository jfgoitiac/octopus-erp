import { MessageCircle } from 'lucide-react';
import { reemplazarVariables, VARIABLES } from './automatizacionesUtils';

/** Burbuja de WhatsApp con el texto y las variables reemplazadas por datos de ejemplo. */
export function VistaPreviaMensaje({ texto, titulo = 'Vista previa', mostrarVariables = false }) {
    const renderizado = reemplazarVariables(texto);
    return (
        <div className="rounded-xl p-3 sm:p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
                <MessageCircle size={14} />{titulo} <span className="font-normal normal-case">(datos de ejemplo)</span>
            </p>
            <div className="rounded-xl rounded-tl-sm p-3 text-sm whitespace-pre-wrap break-words max-w-full"
                style={{ background: '#dcf8c6', color: '#1b1b1b' }} data-testid="vista-previa-texto">
                {renderizado || <span style={{ color: 'var(--ash)' }}>Escribe el mensaje para ver cómo se verá.</span>}
            </div>
            {mostrarVariables && (
                <p className="text-xs break-words" style={{ color: 'var(--ash)' }}>
                    Variables disponibles: {VARIABLES.join(' ')}
                </p>
            )}
        </div>
    );
}

export default VistaPreviaMensaje;
