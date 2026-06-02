import { User, FileText, Edit2, GraduationCap, UserMinus, RefreshCcw, DollarSign, ExternalLink, Loader2 } from 'lucide-react';

const EstadoBadge = ({ alumno }) => {
    const estado = !alumno.activo ? 'Retirado' : (alumno.grado_seccion ? 'Inscrito' : 'Sin inscribir');
    const styles = {
        Inscrito:     { background: '#dcfce7', color: '#16a34a' },
        Retirado:     { background: 'var(--red-light)', color: 'var(--red)' },
        'Sin inscribir': { background: '#fef9c3', color: '#854d0e' },
    };
    return (
        <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
              style={styles[estado]}>
            {estado}
        </span>
    );
};

// UX-2: skeleton de tabla mientras carga la lista
export const TablaAlumnosSkeleton = () => (
    <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--ash-light)' }} />
        ))}
    </div>
);

const TablaAlumnos = ({
    alumnos,
    isSecretaria,
    isCajero,
    editingId,
    editModalLoading,
    onVerFicha,
    onEditarAlumno,
    onAsignarGrado,
    onRetirar,
    onReactivar,
    onAjustarDeuda,
    onIrCobranza,
}) => {
    if (alumnos.length === 0) {
        return (
            <div className="p-20 text-center" style={{ color: 'var(--ash)' }}>
                No se encontraron estudiantes con esos datos.
            </div>
        );
    }

    return (
        // UX-1: overflow-x-auto + min-w para evitar layout roto en móvil
        <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-left border-collapse">
                <thead>
                    <tr>
                        {['Estudiante', 'Grado / Año', 'Estado', 'Finanzas', 'Acciones'].map(h => (
                            <th key={h}
                                className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {alumnos.map((alumno) => (
                        <tr key={alumno.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <td className="px-4 py-3">
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                         style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            {alumno.nombre} {alumno.apellido}
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                            CI: {alumno.cedula_escolar || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </td>

                            <td className="px-4 py-3">
                                <span className="px-3 py-1 rounded-full text-xs font-bold"
                                      style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                    {alumno.grado_seccion ? alumno.grado_seccion.split(' - ')[0] : 'No asignado'}
                                </span>
                            </td>

                            <td className="px-4 py-3">
                                <EstadoBadge alumno={alumno} />
                            </td>

                            <td className="px-4 py-3">
                                <div className={`flex items-center space-x-2 font-bold text-xs uppercase ${
                                    alumno.estatus_financiero === 'solvente' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                        alumno.estatus_financiero === 'solvente' ? 'bg-green-600' : 'bg-red-600'
                                    }`} />
                                    <span>{alumno.estatus_financiero}</span>
                                </div>
                            </td>

                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* UX-6: aria-label en todos los botones de icono */}
                                    <button
                                        onClick={() => onVerFicha(alumno)}
                                        className="p-2 rounded-lg transition-all"
                                        title="Ver Ficha" aria-label="Ver ficha del alumno"
                                        style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                        <FileText size={18} />
                                    </button>

                                    <button
                                        onClick={() => onEditarAlumno(alumno)}
                                        className="p-2 rounded-lg transition-all"
                                        title="Editar Información" aria-label="Editar información del alumno"
                                        style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                        {/* C-1 fix: editingId en lugar de editForm.id */}
                                        {editModalLoading && editingId === alumno.id
                                            ? <Loader2 size={18} className="animate-spin" />
                                            : <Edit2 size={18} />}
                                    </button>

                                    {isSecretaria && (
                                        <button
                                            onClick={() => onAsignarGrado(alumno)}
                                            className="p-2 rounded-lg transition-all"
                                            title="Asignar Grado" aria-label="Asignar grado al alumno"
                                            style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                            <GraduationCap size={18} />
                                        </button>
                                    )}

                                    {alumno.activo ? (
                                        <button
                                            onClick={() => onRetirar(alumno)}
                                            disabled={!isSecretaria}
                                            className={`p-2 rounded-lg transition-all ${!isSecretaria ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title="Retirar Alumno" aria-label="Retirar alumno"
                                            style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                            <UserMinus size={18} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onReactivar(alumno)}
                                            disabled={!isSecretaria}
                                            className={`p-2 rounded-lg transition-all ${!isSecretaria ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title="Reactivar Alumno" aria-label="Reactivar alumno"
                                            style={{ background: '#dcfce7', color: '#16a34a' }}>
                                            <RefreshCcw size={18} />
                                        </button>
                                    )}

                                    {isCajero && (
                                        <button
                                            onClick={() => onAjustarDeuda(alumno)}
                                            className="p-2 rounded-lg transition-all"
                                            title="Ajustar Deuda" aria-label="Ajustar deuda del alumno"
                                            style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                            <DollarSign size={18} />
                                        </button>
                                    )}

                                    <button
                                        onClick={() => onIrCobranza(alumno)}
                                        disabled={!isCajero}
                                        className={`p-2 rounded-lg flex items-center gap-1 transition-all ${!isCajero ? 'opacity-30 cursor-not-allowed' : ''}`}
                                        title="Ir a Cobranza" aria-label="Ir a módulo de cobranza"
                                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                        <ExternalLink size={16} />
                                        <span className="hidden lg:inline text-xs font-bold">Cobrar</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default TablaAlumnos;
