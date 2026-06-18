import React from 'react';
import { User, GraduationCap, FileText, CheckCircle2, Check } from 'lucide-react';

const PASOS = [
    { num: 1, label: 'Representante', icon: User },
    { num: 2, label: 'Alumno',        icon: GraduationCap },
    { num: 3, label: 'Inscripción',   icon: FileText },
    { num: 4, label: 'Confirmar',     icon: CheckCircle2 },
];

export const BarraProgreso = ({ pasoActual }) => (
    <nav aria-label="Progreso de inscripción" className="w-full max-w-4xl mx-auto mb-12">
        <div className="flex items-center justify-between relative">
            <div
                className="absolute top-1/2 left-0 w-full h-0.5 -translate-y-1/2 z-0"
                style={{ background: 'var(--border-md)' }}
            />
            <div
                className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 z-0 transition-all duration-500"
                style={{
                    background: 'var(--pb)',
                    width: `${((pasoActual - 1) / (PASOS.length - 1)) * 100}%`,
                }}
            />

            {PASOS.map((p) => {
                const isActivo     = pasoActual === p.num;
                const isCompletado = pasoActual > p.num;
                return (
                    <div
                        key={p.num}
                        className="relative z-10 flex flex-col items-center"
                        aria-current={isActivo ? 'step' : undefined}
                    >
                        <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isActivo ? 'scale-110 shadow-lg' : ''}`}
                            style={{
                                background: isCompletado ? 'var(--pb-light)' : (isActivo ? 'var(--pb)' : 'var(--porcelain)'),
                                border: isActivo ? 'none' : '2px solid var(--border-md)',
                                color: isCompletado || isActivo ? (isActivo ? 'var(--pb)' : '#fff') : 'var(--ash)',
                            }}
                            aria-label={`Paso ${p.num}: ${p.label}${isCompletado ? ' (completado)' : isActivo ? ' (actual)' : ''}`}
                        >
                            {isCompletado
                                ? <Check size={18} aria-hidden="true" />
                                : <p.icon size={18} aria-hidden="true" />
                            }
                        </div>
                        <span
                            className="hidden sm:block absolute -bottom-7 text-[10px] uppercase tracking-widest whitespace-nowrap font-black"
                            style={{ color: isActivo ? 'var(--jet)' : 'var(--ash)' }}
                            aria-hidden="true"
                        >
                            {p.label}
                        </span>
                    </div>
                );
            })}
        </div>
    </nav>
);
