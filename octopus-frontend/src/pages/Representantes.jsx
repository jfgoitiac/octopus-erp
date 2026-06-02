import { useEffect, useContext } from 'react';
import { Search, UserPlus, Download, Loader2, Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useRepresentantes } from '../hooks/useRepresentantes';
import TablaRepresentantes, { TablaRepresentantesSkeleton } from '../components/representantes/TablaRepresentantes';
import RepresentanteFicha from '../components/representantes/RepresentanteFicha';
import ModalRepresentante from '../components/representantes/ModalRepresentante';

const INPUT_STYLE = {
    background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    borderRadius: '8px', color: 'var(--jet)', fontSize: '13px',
    padding: '7px 10px', outline: 'none',
};

const Representantes = () => {
    const { user } = useContext(AuthContext);
    const canWrite = ['director', 'administrador', 'secretaria'].includes((user?.rol || '').toLowerCase().trim());

    const rep = useRepresentantes();

    // Cerrar modal de eliminación con Escape
    useEffect(() => {
        if (!rep.confirmDelete) return;
        const handler = (e) => { if (e.key === 'Escape') rep.setConfirmDelete(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [rep.confirmDelete, rep.setConfirmDelete]);

    return (
        <div className="flex gap-4 items-start">
            {/* Panel principal */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">

                {/* Barra de búsqueda + acciones */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, cédula o correo…"
                            value={rep.busqueda}
                            onChange={e => rep.setBusqueda(e.target.value)}
                            style={{ ...INPUT_STYLE, paddingLeft: '30px', width: '100%' }}
                        />
                    </div>
                    <div>
                        <label htmlFor="filtro-min-hijos" className="sr-only">Mínimo de alumnos</label>
                        <input
                            id="filtro-min-hijos"
                            type="number"
                            placeholder="Mín. alumnos"
                            value={rep.minHijos}
                            min="0"
                            onChange={e => rep.setMinHijos(e.target.value)}
                            style={{ ...INPUT_STYLE, width: '120px' }}
                        />
                    </div>
                    {canWrite && (
                        <button
                            onClick={rep.openCrear}
                            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white"
                            style={{ background: 'var(--pb)', whiteSpace: 'nowrap' }}
                        >
                            <UserPlus size={14} />
                            Agregar
                        </button>
                    )}
                    {canWrite && (
                        <button
                            onClick={rep.handleExportExcel}
                            disabled={rep.exportingExcel || rep.loading}
                            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white disabled:opacity-50"
                            style={{ background: 'var(--jet)', whiteSpace: 'nowrap' }}
                            title="Exportar a Excel"
                        >
                            {rep.exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            Excel
                        </button>
                    )}
                </div>

                {/* Tabla */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                    {['Cédula', 'Nombre', 'Teléfono', 'Correo', 'Alumnos activos', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--ash)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            {rep.loading ? (
                                <TablaRepresentantesSkeleton />
                            ) : (
                                <TablaRepresentantes
                                    representantes={rep.representantes}
                                    selectedRep={rep.selectedRep}
                                    canWrite={canWrite}
                                    onOpenFicha={rep.openFicha}
                                    onEditar={rep.openEditar}
                                    onConfirmDelete={rep.setConfirmDelete}
                                />
                            )}
                        </table>
                    </div>
                </div>
            </div>

            {/* Ficha lateral */}
            {rep.selectedRep && (
                <RepresentanteFicha
                    rep={rep.selectedRep}
                    alumnos={rep.fichaAlumnos}
                    fichaLoading={rep.fichaLoading}
                    canWrite={canWrite}
                    onClose={rep.closeFicha}
                    onEditar={rep.openEditar}
                    onConfirmDelete={rep.setConfirmDelete}
                />
            )}

            {/* Modal crear / editar */}
            {rep.showModal && (
                <ModalRepresentante
                    editando={rep.editando}
                    form={rep.form}
                    setForm={rep.setForm}
                    formErrors={rep.formErrors}
                    saving={rep.saving}
                    onSave={rep.handleSave}
                    onClose={rep.closeModal}
                />
            )}

            {/* Modal confirmar eliminación */}
            {rep.confirmDelete && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                    onClick={(e) => { if (e.target === e.currentTarget) rep.setConfirmDelete(null); }}
                >
                    <div className="rounded-2xl w-full max-w-sm mx-4" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <div className="px-5 py-4">
                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--jet)' }}>¿Eliminar representante?</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                Se eliminará a <strong>{rep.confirmDelete.nombre} {rep.confirmDelete.apellido}</strong>.
                                {' '}No se puede deshacer. Los representantes con alumnos activos no pueden eliminarse.
                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-4">
                            <button
                                onClick={() => rep.setConfirmDelete(null)}
                                className="flex-1 py-2 rounded-lg text-xs font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={rep.handleDelete}
                                disabled={rep.deleting}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                                style={{ background: 'var(--red)', opacity: rep.deleting ? 0.7 : 1 }}
                            >
                                {rep.deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                {rep.deleting ? 'Eliminando…' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Representantes;
