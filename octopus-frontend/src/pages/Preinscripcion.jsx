import { useState, useCallback, useEffect } from 'react';
import { Search, FileText, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { parseApiError } from '../utils/apiError';
import { buscarAlumnosPreinscripcion } from '../api/preinscripcion.service';
import { usePreinscripcion } from '../hooks/usePreinscripcion';
import SelectorCamposPreinscripcion from '../components/preinscripcion/SelectorCamposPreinscripcion';

const ESTADO_LABELS = {
    inscrito: { texto: 'Inscrito', bg: '#dcfce7', color: '#16a34a' },
    sin_inscribir: { texto: 'Sin inscribir', bg: '#fef3c7', color: '#b45309' },
    retirado: { texto: 'Retirado', bg: '#fee2e2', color: '#dc2626' },
};

const TablaSkeleton = () => (
    <div className="animate-pulse divide-y" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="h-4 w-40 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-24 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-20 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-24 rounded ml-auto" style={{ background: 'var(--ash-light)' }} />
            </div>
        ))}
    </div>
);

const Preinscripcion = () => {
    const [busqueda, setBusqueda] = useState('');
    const [alumnos, setAlumnos] = useState([]);
    const [loading, setLoading] = useState(false);

    const {
        showSelector, modo, generando,
        abrirParaAlumno, abrirParaTodos, cerrarSelector, generar,
    } = usePreinscripcion();

    const fetchAlumnos = useCallback(async (signal) => {
        if (!busqueda.trim()) { setAlumnos([]); return; }
        setLoading(true);
        try {
            const res = await buscarAlumnosPreinscripcion(busqueda, signal);
            setAlumnos(res?.data?.results ?? res?.data ?? []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            toast.error(parseApiError(err) || 'No se pudo buscar estudiantes.');
        } finally {
            setLoading(false);
        }
    }, [busqueda]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchAlumnos(controller.signal), 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchAlumnos]);

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <FileText size={22} style={{ color: 'var(--pb)' }} />
                        Pre-Inscripción
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Genera la planilla oficial de inscripción rellenada con los datos del estudiante — no
                        necesita estar inscrito todavía.
                    </p>
                </div>

                <button
                    onClick={abrirParaTodos}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px]"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    <Users size={16} />
                    Generar para todos
                </button>
            </div>

            <div className="relative mb-4 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar estudiante por nombre, apellido o cédula..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '0.5px solid var(--border-md)' }}
                />
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {loading ? (
                    <TablaSkeleton />
                ) : !busqueda.trim() ? (
                    <div className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                        Escribe un nombre, apellido o cédula para buscar un estudiante.
                    </div>
                ) : alumnos.length === 0 ? (
                    <div className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                        No se encontraron estudiantes para esa búsqueda.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Estudiante</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Cédula escolar</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Grado/Sección</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
                                    <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alumnos.map((a) => {
                                    const estado = ESTADO_LABELS[a.estado_inscripcion] || ESTADO_LABELS.sin_inscribir;
                                    return (
                                        <tr key={a.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <td className="px-5 py-3 font-medium" style={{ color: 'var(--jet)' }}>
                                                {a.nombre} {a.apellido}
                                            </td>
                                            <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{a.cedula_escolar || '—'}</td>
                                            <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{a.grado_seccion || '—'}</td>
                                            <td className="px-5 py-3">
                                                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                                                      style={{ background: estado.bg, color: estado.color }}>
                                                    {estado.texto}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <button
                                                    onClick={() => abrirParaAlumno(a.id)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                                    style={{ background: 'var(--pb)' }}
                                                >
                                                    <FileText size={13} />
                                                    Generar Pre-Inscripción
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showSelector && (
                <SelectorCamposPreinscripcion
                    modo={modo}
                    generando={generando}
                    onCerrar={cerrarSelector}
                    onGenerar={generar}
                />
            )}
        </div>
    );
};

export default Preinscripcion;
