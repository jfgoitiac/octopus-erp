import { useEffect, useContext } from 'react';
import { Search, UserPlus, Download, Loader2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { ROLE_GROUPS } from '../constants/roles';
import { useRepresentantes } from '../hooks/useRepresentantes';
import TablaRepresentantes, { TablaRepresentantesSkeleton } from '../components/representantes/TablaRepresentantes';
import RepresentanteFicha from '../components/representantes/RepresentanteFicha';
import ModalRepresentante from '../components/representantes/ModalRepresentante';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ModalEliminarDefinitivo from '../components/shared/ModalEliminarDefinitivo';
import Pagination from '../components/shared/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';

const REPRESENTANTES_COLUMNAS = [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombre', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'correo', label: 'Correo' },
    { key: 'alumnos', label: 'Alumnos activos' },
    { key: 'acciones', label: '' },
];

const INPUT_STYLE = {
    background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    borderRadius: '8px', color: 'var(--jet)', fontSize: '16px',
    padding: '7px 10px', outline: 'none',
};

const Representantes = () => {
    const { user } = useContext(AuthContext);
    const rol = (user?.rol || '').toLowerCase().trim();
    const canEditar   = ROLE_GROUPS.REPRESENTANTES_EDITAR.includes(rol);
    const canEliminar = ROLE_GROUPS.REPRESENTANTES_ELIMINAR.includes(rol);

    const rep = useRepresentantes();

    // Cerrar modal de eliminación con Escape
    useEffect(() => {
        if (!rep.confirmDelete) return;
        const handler = (e) => { if (e.key === 'Escape') rep.setConfirmDelete(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [rep.confirmDelete, rep.setConfirmDelete]);

    // Cerrar modal de eliminación definitiva con Escape
    useEffect(() => {
        if (!rep.confirmDeleteDefinitivo) return;
        const handler = (e) => { if (e.key === 'Escape') rep.setConfirmDeleteDefinitivo(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [rep.confirmDeleteDefinitivo, rep.setConfirmDeleteDefinitivo]);

    return (
        <div className="flex flex-col gap-4">
            <PageHeader titulo="Representantes" />
            <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* Panel principal */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-4">

                {/* Barra de búsqueda + acciones */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="relative flex-1 sm:min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="search"
                            aria-label="Buscar representante por nombre, cédula o correo"
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
                            style={{ ...INPUT_STYLE, width: '100%' }}
                            className="sm:w-[120px]"
                        />
                    </div>
                    <div className="flex gap-2">
                    {canEditar && (
                        <button
                            onClick={rep.openCrear}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium text-white min-h-[44px]"
                            style={{ background: 'var(--pb)', whiteSpace: 'nowrap' }}
                        >
                            <UserPlus size={14} />
                            Agregar
                        </button>
                    )}
                    {canEditar && (
                        <button
                            onClick={rep.handleExportExcel}
                            disabled={rep.exportingExcel || rep.loading}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium text-white disabled:opacity-50 min-h-[44px]"
                            style={{ background: 'var(--jet)', whiteSpace: 'nowrap' }}
                            aria-label="Exportar a Excel"
                        >
                            {rep.exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            Excel
                        </button>
                    )}
                    </div>
                </div>

                {/* Tabla */}
                <Card padding="none">
                    <Tabla columnas={REPRESENTANTES_COLUMNAS} minWidth={640}>
                        {rep.loading ? (
                            <TablaRepresentantesSkeleton />
                        ) : (
                            <TablaRepresentantes
                                representantes={rep.representantes}
                                selectedRep={rep.selectedRep}
                                canEditar={canEditar}
                                canEliminar={canEliminar}
                                onOpenFicha={rep.openFicha}
                                onEditar={rep.openEditar}
                                onConfirmDelete={rep.setConfirmDelete}
                            />
                        )}
                    </Tabla>
                    {!rep.loading && (
                        <Pagination
                            page={rep.page}
                            totalPages={rep.totalPages}
                            onPageChange={rep.setPage}
                            total={rep.total}
                            pageSize={rep.pageSize}
                        />
                    )}
                </Card>
            </div>

            {/* Ficha lateral */}
            {rep.selectedRep && (
                <RepresentanteFicha
                    rep={rep.selectedRep}
                    alumnos={rep.fichaAlumnos}
                    fichaLoading={rep.fichaLoading}
                    canEditar={canEditar}
                    canEliminar={canEliminar}
                    onClose={rep.closeFicha}
                    onEditar={rep.openEditar}
                    onConfirmDelete={rep.setConfirmDelete}
                    onConfirmDeleteDefinitivo={rep.setConfirmDeleteDefinitivo}
                    portalLoading={rep.portalLoading}
                    onActivarPortal={rep.handleActivarPortal}
                    onDesactivarPortal={rep.handleDesactivarPortal}
                    onRestablecerContrasena={rep.handleRestablecerContrasena}
                    cargandoProyectoId={rep.cargandoProyectoId}
                    onCargarProyectoInversion={rep.handleCargarProyectoInversion}
                />
            )}
            </div>

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
                <ConfirmDeleteModal
                    titulo="¿Eliminar representante?"
                    mensaje={(
                        <>
                            Se eliminará a <strong>{rep.confirmDelete.nombre} {rep.confirmDelete.apellido}</strong>.
                            {' '}Si tiene alumnos activos vinculados, también serán retirados automáticamente
                            (se conserva su historial de pagos y facturas). Esta acción no se puede deshacer.
                        </>
                    )}
                    labelBoton={rep.deleting ? 'Eliminando…' : 'Eliminar'}
                    onConfirm={rep.handleDelete}
                    onCancel={() => rep.setConfirmDelete(null)}
                />
            )}

            {/* Modal confirmar eliminación DEFINITIVA (solo representantes sin alumnos) */}
            {rep.confirmDeleteDefinitivo && (
                <ModalEliminarDefinitivo
                    tipo="representante"
                    registro={rep.confirmDeleteDefinitivo}
                    saving={rep.deletingDefinitivo}
                    onClose={() => rep.setConfirmDeleteDefinitivo(null)}
                    onConfirmar={rep.handleDeleteDefinitivo}
                />
            )}
        </div>
    );
};

export default Representantes;
