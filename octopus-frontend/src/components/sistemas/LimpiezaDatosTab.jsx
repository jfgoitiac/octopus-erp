import { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { buscarAlumnos, secretariaService } from '../../api/secretaria.service';
import ModalEliminarDefinitivo from '../shared/ModalEliminarDefinitivo';
import ModalEliminarTodosAlumnos from './ModalEliminarTodosAlumnos';

// TODO-TEMPORAL: quitar este tab (y su entrada en Sistemas.jsx) tras la
// limpieza de datos de prueba. Hace borrado físico real, distinto del
// flujo normal de Retirar/Eliminar (que es soft-delete).
const LimpiezaDatosTab = () => {
    const [tipo, setTipo] = useState('alumnos');
    const [busqueda, setBusqueda] = useState('');
    const [resultados, setResultados] = useState([]);
    const [loading, setLoading] = useState(false);
    const [seleccionado, setSeleccionado] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [mostrarEliminarTodos, setMostrarEliminarTodos] = useState(false);
    const [eliminandoTodos, setEliminandoTodos] = useState(false);
    const abortRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(async () => {
            abortRef.current?.abort();

            if (!busqueda.trim()) {
                setResultados([]);
                return;
            }

            const controller = new AbortController();
            abortRef.current = controller;

            setLoading(true);
            try {
                if (tipo === 'alumnos') {
                    const res = await buscarAlumnos(busqueda, controller.signal);
                    setResultados(res.data?.results ?? res.data ?? []);
                } else {
                    const res = await axiosInstance.get(
                        `secretaria/representantes/?buscar=${encodeURIComponent(busqueda)}`,
                        { signal: controller.signal }
                    );
                    setResultados(res.data?.results ?? res.data ?? []);
                }
            } catch (err) {
                if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                toast.error('Error al buscar registros.');
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [busqueda, tipo]);

    const handleConfirmar = async () => {
        if (!seleccionado) return;
        setDeleting(true);
        try {
            if (tipo === 'alumnos') {
                await secretariaService.eliminarAlumnoDefinitivo(seleccionado.id);
            } else {
                await secretariaService.eliminarRepresentanteDefinitivo(seleccionado.id);
            }
            toast.success(`${tipo === 'alumnos' ? 'Alumno' : 'Representante'} eliminado definitivamente.`);
            setResultados(prev => prev.filter(r => r.id !== seleccionado.id));
            setSeleccionado(null);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'No se pudo eliminar el registro.');
        } finally {
            setDeleting(false);
        }
    };

    const handleConfirmarEliminarTodos = async () => {
        setEliminandoTodos(true);
        try {
            const res = await secretariaService.eliminarTodosLosAlumnos();
            toast.success(`Se eliminaron ${res?.eliminados ?? 'todos los'} alumnos definitivamente.`);
            setResultados([]);
            setMostrarEliminarTodos(false);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'No se pudo eliminar a los alumnos.');
        } finally {
            setEliminandoTodos(false);
        }
    };

    return (
        <>
            <div className="p-4 rounded-xl mb-4 flex items-start gap-3"
                 style={{ background: 'var(--red-light)', border: '0.5px solid var(--red)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--red)' }} className="shrink-0 mt-0.5" />
                <p className="text-sm" style={{ color: 'var(--red)' }}>
                    Herramienta temporal de limpieza de datos de prueba. Borra registros de forma
                    permanente (no es soft-delete): no usar para bajas normales de alumnos o
                    representantes, para eso usa "Retirar" / "Eliminar" en sus módulos.
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-1 p-1 rounded-xl w-fit"
                     style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    {[
                        { id: 'alumnos', label: 'Alumnos' },
                        { id: 'representantes', label: 'Representantes' },
                    ].map(({ id, label }) => {
                        const active = tipo === id;
                        return (
                            <button key={id} onClick={() => { setTipo(id); setBusqueda(''); setResultados([]); }}
                                aria-current={active ? 'page' : undefined}
                                className="px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px]"
                                style={active
                                    ? { background: 'var(--pb)', color: '#fff' }
                                    : { color: 'var(--ash)' }}>
                                {label}
                            </button>
                        );
                    })}
                </div>

                {tipo === 'alumnos' && (
                    <button onClick={() => setMostrarEliminarTodos(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] text-white"
                        style={{ background: 'var(--red)' }}>
                        <Trash2 size={13} /> Eliminar TODOS los alumnos
                    </button>
                )}
            </div>

            <div className="relative mb-4">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={tipo === 'alumnos' ? 'Buscar alumno por nombre o cédula...' : 'Buscar representante por nombre o cédula...'}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                />
            </div>

            <div className="rounded-xl overflow-hidden"
                 style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[480px]">
                        <thead>
                            <tr>
                                {['Nombre', 'Cédula', 'Acciones'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="3" className="px-4 py-12 text-center">
                                        <Loader2 className="animate-spin inline-block" size={20} style={{ color: 'var(--pb)' }} />
                                    </td>
                                </tr>
                            ) : resultados.length > 0 ? resultados.map(r => (
                                <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        {r.nombre} {r.apellido}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                                        {tipo === 'alumnos' ? r.cedula_escolar : r.cedula}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => setSeleccionado(r)}
                                            aria-label={`Eliminar definitivamente a ${r.nombre} ${r.apellido}`}
                                            title="Eliminar definitivamente" className="transition-colors"
                                            style={{ color: 'var(--ash)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="3" className="px-4 py-12 text-center text-sm"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                                        {busqueda.trim() ? 'Sin resultados.' : 'Escribe para buscar un registro a eliminar.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {seleccionado && (
                <ModalEliminarDefinitivo
                    tipo={tipo === 'alumnos' ? 'alumno' : 'representante'}
                    registro={seleccionado}
                    saving={deleting}
                    onClose={() => setSeleccionado(null)}
                    onConfirmar={handleConfirmar}
                />
            )}

            {mostrarEliminarTodos && (
                <ModalEliminarTodosAlumnos
                    saving={eliminandoTodos}
                    onClose={() => setMostrarEliminarTodos(false)}
                    onConfirmar={handleConfirmarEliminarTodos}
                />
            )}
        </>
    );
};

export default LimpiezaDatosTab;
