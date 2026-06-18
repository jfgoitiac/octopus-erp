import React, { useState } from 'react';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';

export const PantallaExito = ({ alumno, grado, onReiniciar, onDescargar }) => {
    const [descargando, setDescargando] = useState(false);

    const handleDescargar = async () => {
        setDescargando(true);
        try {
            await onDescargar();
        } finally {
            setDescargando(false);
        }
    };

    return (
        <div
            className="max-w-md mx-auto py-16 text-center space-y-6 animate-fadeIn"
            role="status"
            aria-live="polite"
        >
            <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
            >
                <CheckCircle2 size={48} aria-hidden="true" />
            </div>

            <div>
                <h2 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--jet)' }}>
                    ¡Inscripción Exitosa!
                </h2>
                <p className="mt-2 text-sm" style={{ color: 'var(--ash)' }}>
                    El estudiante{' '}
                    <span className="font-medium" style={{ color: 'var(--jet)' }}>{alumno}</span>{' '}
                    ha sido registrado correctamente en{' '}
                    <span className="font-medium" style={{ color: 'var(--jet)' }}>
                        {grado?.split(' - ')[0]}
                    </span>.
                </p>
            </div>

            <div className="flex flex-col gap-2 pt-4">
                <button
                    type="button"
                    disabled={descargando}
                    onClick={handleDescargar}
                    className="w-full py-3 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                    style={{ background: 'var(--pb)' }}
                >
                    {descargando
                        ? <><Loader2 className="animate-spin" size={16} aria-hidden="true" /> Generando comprobante…</>
                        : <><FileText size={16} aria-hidden="true" /> Ver Comprobante PDF</>
                    }
                </button>
                <button
                    type="button"
                    onClick={onReiniciar}
                    className="w-full py-3 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    Nueva Inscripción
                </button>
            </div>
        </div>
    );
};
