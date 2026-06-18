import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import { fetchConfiguracionInscripcion } from '../../api/inscripciones.service';
import { SkeletonGrado } from './SkeletonGrado';

export const PasoConfiguracion = ({ datos, setDatos, onContinuar, onVolver }) => {
    const [grados,  setGrados]  = useState([]);
    const [config,  setConfig]  = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const fetchInfo  = async () => {
            try {
                const [resG, resC] = await fetchConfiguracionInscripcion(controller.signal);
                setGrados(resG.data || []);
                setConfig(resC.data);
                setDatos(prev => ({
                    ...prev,
                    periodo_escolar: resC.data?.periodo_escolar_activo || '',
                }));
            } catch (err) {
                if (err.name !== 'CanceledError') toast.error('Error al cargar parámetros');
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
        return () => controller.abort();
    }, [setDatos]);

    const seleccionado  = grados.find(g => g.grado_seccion === datos.grado_seccion);
    const cuposAgotados = (seleccionado?.cupos_disponibles ?? 1) <= 0;

    if (loading) return (
        <div className="max-w-5xl mx-auto space-y-10 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonGrado key={i} />)}
                </div>
                <div
                    className="p-8 rounded-2xl animate-pulse"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', height: '220px' }}
                />
            </div>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-10 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Lista de grados */}
                <div className="lg:col-span-2 space-y-6">
                    <p
                        className="text-[11px] uppercase tracking-widest"
                        style={{ color: 'var(--ash)' }}
                    >
                        Seleccione Grado y Sección
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {grados.map(g => {
                            const lleno = g.cupos_disponibles <= 0;
                            const pct   = (g.cupos_utilizados / g.cupos_maximos) * 100;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    disabled={lleno}
                                    onClick={() => setDatos(prev => ({ ...prev, grado_seccion: g.grado_seccion }))}
                                    aria-pressed={datos.grado_seccion === g.grado_seccion}
                                    className={`p-5 rounded-2xl transition-all relative text-left w-full
                                        ${lleno ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                                    style={{
                                        border:     datos.grado_seccion === g.grado_seccion
                                            ? '2px solid var(--pb)'
                                            : '0.5px solid var(--border-md)',
                                        background: datos.grado_seccion === g.grado_seccion
                                            ? 'var(--pb-light)'
                                            : 'var(--porcelain)',
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <p className="font-medium" style={{ color: 'var(--jet)' }}>
                                            {g.grado_seccion.split(' - ')[0]}
                                        </p>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase
                                            ${lleno ? 'bg-red-50 text-red-600' : 'text-emerald-600 bg-emerald-50'}`}
                                        >
                                            {lleno ? 'Lleno' : `${g.cupos_disponibles} cupos`}
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                        <div
                                            className="h-full transition-all"
                                            style={{
                                                width:      `${pct}%`,
                                                background: lleno ? 'var(--red, #ef4444)' : 'var(--pb)',
                                            }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Panel de detalles */}
                <div className="space-y-6">
                    <div
                        className="p-8 rounded-2xl space-y-6"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
                    >
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            Detalles de inscripción
                        </h3>
                        <div className="space-y-4">
                            {/* Tipo de ingreso */}
                            <div>
                                <p
                                    className="text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}
                                >
                                    Tipo de Ingreso
                                </p>
                                <div className="flex gap-2" role="group" aria-label="Tipo de ingreso">
                                    {['nuevo', 'regular'].map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setDatos(prev => ({ ...prev, tipo_ingreso: t }))}
                                            aria-pressed={datos.tipo_ingreso === t}
                                            className="flex-1 py-2 rounded-lg text-xs font-medium uppercase transition-all"
                                            style={{
                                                background: datos.tipo_ingreso === t ? 'var(--pb)' : 'var(--porcelain)',
                                                color:      datos.tipo_ingreso === t ? '#fff' : 'var(--ash)',
                                                border:     '0.5px solid var(--border-md)',
                                            }}
                                        >
                                            {t === 'nuevo' ? 'Nuevo' : 'Regular'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Período escolar */}
                            <div>
                                <p
                                    className="text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}
                                >
                                    Período Escolar
                                </p>
                                <div
                                    className="px-3 py-2 rounded-lg text-sm font-medium"
                                    style={{ background: 'var(--porcelain)', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
                                >
                                    {config?.periodo_escolar_activo || 'No configurado'}
                                </div>
                            </div>

                            {/* Toggle documentos completos */}
                            <div
                                className="flex items-center justify-between p-4 rounded-xl border"
                                style={{ background: 'var(--porcelain)', borderColor: 'var(--border-md)' }}
                            >
                                <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                    Documentos completos
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={datos.documentos_completos}
                                    aria-label="Documentos completos"
                                    onClick={() => setDatos(prev => ({ ...prev, documentos_completos: !prev.documentos_completos }))}
                                    className="w-12 h-6 rounded-full transition-all relative focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                                    style={{
                                        background: datos.documentos_completos ? 'var(--pb)' : 'var(--border-md)',
                                    }}
                                >
                                    <div
                                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all
                                            ${datos.documentos_completos ? 'right-1' : 'left-1'}`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center pt-10">
                <button
                    type="button"
                    onClick={onVolver}
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: 'var(--ash)' }}
                >
                    <ArrowLeft size={16} aria-hidden="true" /> Volver
                </button>
                <button
                    type="button"
                    disabled={!datos.grado_seccion || cuposAgotados}
                    onClick={onContinuar}
                    className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}
                >
                    Revisar Inscripción <ArrowRight size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};
