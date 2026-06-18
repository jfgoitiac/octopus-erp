import React from 'react';
import { Info, Check, Loader2, ArrowLeft } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const formatFecha = (fecha) => {
    if (!fecha) return '—';
    const parsed = parseISO(fecha);
    return isValid(parsed) ? format(parsed, "d 'de' MMMM 'de' yyyy", { locale: es }) : fecha;
};

export const PasoConfirmacion = ({ datos, onContinuar, onVolver, cargando }) => (
    <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
        <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ background: 'var(--porcelain)', borderColor: 'var(--border-md)' }}
        >
            <div
                className="p-8 text-white flex justify-between items-center"
                style={{ background: 'var(--pb)' }}
            >
                <div>
                    <h2 className="text-xl font-medium tracking-tight">Confirmar Registro</h2>
                    <p className="text-xs mt-1 opacity-90">
                        Verifique los datos antes de proceder con la matrícula
                    </p>
                </div>
                <Info size={32} className="opacity-40" aria-hidden="true" />
            </div>

            <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-3">
                        <h4
                            className="text-[11px] uppercase tracking-widest pb-1.5 border-b"
                            style={{ color: 'var(--ash)', borderColor: 'var(--border-md)' }}
                        >
                            Representante
                        </h4>
                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            {datos.representante?.nombre} {datos.representante?.apellido}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            Cédula: {datos.representante?.cedula}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            Teléfono: {datos.representante?.telefono}
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h4
                            className="text-[11px] uppercase tracking-widest pb-1.5 border-b"
                            style={{ color: 'var(--ash)', borderColor: 'var(--border-md)' }}
                        >
                            Estudiante
                        </h4>
                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            {datos.alumno?.nombre} {datos.alumno?.apellido}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            F. Nacimiento: {formatFecha(datos.alumno?.fecha_nacimiento)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            Género: {datos.alumno?.genero}
                        </p>
                    </section>

                    <section
                        className="md:col-span-2 p-5 rounded-xl flex items-center justify-between"
                        style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)' }}
                    >
                        <div>
                            <h4
                                className="text-[10px] font-black uppercase tracking-widest mb-1"
                                style={{ color: 'var(--pb)' }}
                            >
                                Cupo Asignado
                            </h4>
                            <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                                {datos.grado_seccion?.split(' - ')[0]}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase" style={{ color: 'var(--ash)' }}>
                                Periodo
                            </p>
                            <p className="text-sm font-medium" style={{ color: 'var(--pb)' }}>
                                {datos.periodo_escolar}
                            </p>
                        </div>
                    </section>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                    <button
                        type="button"
                        disabled={cargando}
                        onClick={onContinuar}
                        className="w-full py-3.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}
                    >
                        {cargando
                            ? <><Loader2 className="animate-spin" size={16} aria-hidden="true" /> Procesando…</>
                            : <><Check size={16} aria-hidden="true" /> Confirmar e Inscribir</>
                        }
                    </button>
                    <button
                        type="button"
                        onClick={onVolver}
                        className="w-full py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        style={{ color: 'var(--ash)' }}
                    >
                        <ArrowLeft size={14} aria-hidden="true" /> Volver a editar datos
                    </button>
                </div>
            </div>
        </div>
    </div>
);
