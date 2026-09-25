import { useMemo } from 'react';
import WhatsAppIcon from '../ui/WhatsAppIcon';

const PARTES = /(\{\{[^}]+\}\}|\*[^*\n]+\*|_[^_\n]+_)/g;

function formatearLinea(linea, indice) {
    return (
        <span key={indice}>
            {linea.split(PARTES).map((parte, i) => {
                const key = `${indice}-${i}`;
                if (/^\{\{[^}]+\}\}$/.test(parte)) {
                    return (
                        <span key={key} className="rounded px-1" style={{ background: '#fde68a', color: '#78350f' }}>
                            {parte}
                        </span>
                    );
                }
                if (/^\*[^*\n]+\*$/.test(parte)) return <strong key={key}>{parte.slice(1, -1)}</strong>;
                if (/^_[^_\n]+_$/.test(parte)) return <em key={key}>{parte.slice(1, -1)}</em>;
                return <span key={key}>{parte}</span>;
            })}
        </span>
    );
}

export default function VistaPreviaWhatsApp({ mensaje = '' }) {
    const lineas = useMemo(() => mensaje.split('\n'), [mensaje]);

    return (
        <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                <WhatsAppIcon size={16} />
                Vista previa
            </div>
            <div className="rounded-xl p-4" style={{ background: '#e5ddd5', minHeight: '14rem' }}>
                <div
                    className="relative ml-auto max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm"
                    style={{ background: '#dcf8c6', color: '#1f2933' }}
                >
                    {mensaje.trim()
                        ? lineas.map((linea, i) => (
                            <span key={i}>
                                {formatearLinea(linea, i)}
                                {i < lineas.length - 1 && <br />}
                            </span>
                        ))
                        : <span style={{ color: 'var(--ash)' }}>Escribe el mensaje de la plantilla.</span>}
                    <div className="mt-1 text-right text-[10px]" style={{ color: 'var(--ash)' }}>Ahora</div>
                </div>
            </div>
        </div>
    );
}
