import { Search, FileSearch, Printer, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useConsultaInscripcion } from '../hooks/useConsultaInscripcion';
import Pagination from '../components/shared/Pagination';

const TIPO_INGRESO_LABELS = {
    nuevo: 'Nuevo Ingreso',
    regular: 'Estudiante Regular',
};

const TablaSkeleton = () => (
    <div className="animate-pulse divide-y" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="h-4 w-40 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-28 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-24 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-4 w-20 rounded ml-auto" style={{ background: 'var(--ash-light)' }} />
            </div>
        ))}
    </div>
);

const ConsultaInscripcion = () => {
    const {
        inscripciones, busqueda, setBusqueda, loading,
        page, setPage, total, totalPages, pageSize,
        reimprimiendoId, reimprimir,
    } = useConsultaInscripcion();

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6">
                <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <FileSearch size={22} style={{ color: 'var(--pb)' }} />
                    Consulta de Inscripción
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    Busca inscripciones por nombre o apellido del alumno para reimprimir su comprobante.
                </p>
            </div>

            <div className="relative mb-4 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre o apellido..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '0.5px solid var(--border-md)' }}
                />
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {loading ? (
                    <TablaSkeleton />
                ) : inscripciones.length === 0 ? (
                    <div className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                        {busqueda ? 'No se encontraron inscripciones para esa búsqueda.' : 'No hay inscripciones registradas.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Cédula escolar</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Representante</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Período</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Grado/Sección</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Tipo de ingreso</th>
                                    <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                                    <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--ash)' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inscripciones.map((insc) => (
                                    <tr key={insc.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        <td className="px-5 py-3 font-medium" style={{ color: 'var(--jet)' }}>
                                            {insc.alumno_nombre} {insc.alumno_apellido}
                                        </td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{insc.cedula_escolar || '—'}</td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{insc.representante_nombre || '—'}</td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{insc.periodo_escolar}</td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>{insc.grado_seccion}</td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>
                                            {TIPO_INGRESO_LABELS[insc.tipo_ingreso] || insc.tipo_ingreso}
                                        </td>
                                        <td className="px-5 py-3" style={{ color: 'var(--jet)' }}>
                                            {insc.fecha_inscripcion
                                                ? format(parseISO(insc.fecha_inscripcion), "dd/MM/yyyy", { locale: es })
                                                : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button
                                                onClick={() => reimprimir(insc.id)}
                                                disabled={reimprimiendoId === insc.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                                style={{ background: 'var(--pb)' }}
                                            >
                                                {reimprimiendoId === insc.id
                                                    ? <Loader2 size={13} className="animate-spin" />
                                                    : <Printer size={13} />}
                                                Reimprimir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
            </div>
        </div>
    );
};

export default ConsultaInscripcion;
