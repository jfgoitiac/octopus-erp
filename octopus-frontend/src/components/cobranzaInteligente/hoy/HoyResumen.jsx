import { Sparkles } from 'lucide-react';

/** Frase de resumen del día, tal como la arma el backend. */
export function HoyResumen({ resumen }) {
    if (!resumen) return null;
    return (
        <div className="flex items-start gap-3 rounded-2xl p-3 sm:p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="shrink-0 rounded-xl p-2" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                <Sparkles size={18} aria-hidden="true" />
            </span>
            <p className="text-sm sm:text-base font-medium min-w-0" style={{ color: 'var(--jet)' }}>{resumen.frase}</p>
        </div>
    );
}

export default HoyResumen;
