import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, Save, UserMinus, RefreshCcw, PlusCircle, Download, Loader2, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axiosInstance from '../api/apiClient';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { useAlumnos } from '../hooks/useAlumnos';
import { useMensualidadesAlumno } from '../hooks/useMensualidadesAlumno';
import TablaAlumnos, { TablaAlumnosSkeleton } from '../components/alumnos/TablaAlumnos';
import ModalAjustarMensualidades from '../components/alumnos/ModalAjustarMensualidades';
import ModalEditarAlumno from '../components/alumnos/ModalEditarAlumno';
import ModalRegistrarAlumno from '../components/alumnos/ModalRegistrarAlumno';
import SidebarFichaAlumno from '../components/alumnos/SidebarFichaAlumno';
import ModalAsignarGrado from '../components/alumnos/ModalAsignarGrado';
import ModalRetirar from '../components/alumnos/ModalRetirar';
import ModalConfirmarReactivar from '../components/alumnos/ModalConfirmarReactivar';

const ListaAlumnos = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const { tasa, loading: loadingTasa } = useTasaBCV();

    // Q-5 fix: optional chaining redundante eliminado
    const isSecretaria = !!user && ['director', 'administrador', 'secretaria', 'sistemas'].includes(user.rol);
    const isCajero     = !!user && ['director', 'administrador', 'cajero', 'cobranza'].includes(user.rol);

    // UI-only state (no lógica de negocio)
    const [showConfig, setShowConfig] = useState(false);
    const [showFichaSidebar, setShowFichaSidebar] = useState(false);

    const alumnos = useAlumnos();
    const mensualidades = useMensualidadesAlumno();

    const handleSyncTasa = async () => {
        try {
            await axiosInstance.post('cobranza/sincronizar-tasa/', {});
            toast.success('Sincronización con BCV completada.');
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al sincronizar con el BCV.';
            toast.error(msg);
        }
    };

    const handleVerFicha = (alumno) => {
        alumnos.setSelectedAlumno(alumno);
        setShowFichaSidebar(true);
    };

    const handleAsignarGrado = (alumno) => {
        alumnos.setSelectedAlumno(alumno);
        alumnos.setShowAsignarGradoModal(true);
    };

    const handleRetirar = (alumno) => {
        alumnos.setSelectedAlumno(alumno);
        alumnos.setShowRetirarModal(true);
    };

    const handleAjustarDeuda = (alumno) => {
        alumnos.setSelectedAlumno(alumno);
        mensualidades.handleOpenModal(alumno);
    };

    return (
        <div className="animate-fadeIn">
            {/* ── Barra superior ── */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Control de Matrícula</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Listado general de Primaria y Media General
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {isSecretaria && (
                        <button
                            onClick={() => alumnos.setShowRegisterModal(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                            style={{ background: 'var(--pb)' }}>
                            <PlusCircle size={18} />
                            <span>Registrar Alumno</span>
                        </button>
                    )}

                    <button
                        onClick={alumnos.handleExportExcel}
                        disabled={alumnos.exportingExcel}
                        aria-label="Exportar a Excel"
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        {alumnos.exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden sm:inline">Excel</span>
                    </button>

                    {/* Panel de configuración */}
                    <div className="relative">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            <Settings size={16} />
                            <span className="text-sm font-bold">Configuración</span>
                        </button>
                        {showConfig && (
                            <div className="absolute right-0 mt-2 w-72 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 z-50 animate-fadeIn">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[11px] uppercase tracking-widest font-bold"
                                       style={{ color: 'var(--ash)' }}>
                                        Montos Globales
                                    </p>
                                    <button
                                        onClick={() => setShowConfig(false)}
                                        className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                                        style={{ color: 'var(--ash)' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1"
                                       style={{ color: 'var(--ash)' }}>
                                    Mensualidad ($)
                                </label>
                                <input type="number" step="0.01"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    value={alumnos.montoDefecto}
                                    onChange={(e) => alumnos.setMontoDefecto(e.target.value)} />
                                <label className="block text-[11px] uppercase tracking-widest mb-1"
                                       style={{ color: 'var(--ash)' }}>
                                    Inscripción ($)
                                </label>
                                <input type="number" step="0.01"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    value={alumnos.montoInscripcion}
                                    onChange={(e) => alumnos.setMontoInscripcion(e.target.value)} />
                                {/* C-4 fix: disabled mientras guarda */}
                                <button
                                    onClick={() => alumnos.handleSaveConfig().then(() => setShowConfig(false)).catch(() => {})}
                                    disabled={alumnos.savingConfig}
                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {alumnos.savingConfig
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <Save size={14} />}
                                    {alumnos.savingConfig ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => alumnos.setMostrarInactivos(!alumnos.mostrarInactivos)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{
                            border: '0.5px solid var(--border-md)',
                            background: alumnos.mostrarInactivos ? 'var(--jet)' : 'transparent',
                            color: alumnos.mostrarInactivos ? '#fff' : 'var(--ash)',
                        }}>
                        <UserMinus size={16} />
                        <span className="text-sm font-bold">
                            {alumnos.mostrarInactivos ? 'Ver Activos' : 'Ver Retirados'}
                        </span>
                    </button>

                    <button
                        onClick={handleSyncTasa}
                        aria-label="Sincronizar tasa BCV"
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${loadingTasa ? 'animate-pulse' : ''}`}
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}>
                        <RefreshCcw size={18} />
                        <span className="text-sm font-bold">Bs. {tasa.toLocaleString('es-VE')}</span>
                    </button>

                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-2.5" style={{ color: 'var(--ash)' }} size={18} />
                        <input
                            type="text"
                            placeholder="Buscar Estudiante..."
                            aria-label="Buscar estudiante"
                            className="w-full px-3 py-2 pl-10 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                            value={alumnos.busqueda}
                            onChange={(e) => alumnos.setBusqueda(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ── Tabla ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                {/* UX-2 fix: skeleton en lugar de texto plano */}
                {alumnos.loading ? (
                    <TablaAlumnosSkeleton />
                ) : (
                    <TablaAlumnos
                        alumnos={alumnos.alumnos}
                        isSecretaria={isSecretaria}
                        isCajero={isCajero}
                        editingId={alumnos.editingId}
                        editModalLoading={alumnos.editModalLoading}
                        onVerFicha={handleVerFicha}
                        onEditarAlumno={alumnos.handleOpenEditModal}
                        onAsignarGrado={handleAsignarGrado}
                        onRetirar={handleRetirar}
                        onReactivar={alumnos.solicitarReactivar}
                        onAjustarDeuda={handleAjustarDeuda}
                        onIrCobranza={(a) => navigate(`/cobranza?cedula=${a.cedula_escolar}`)}
                    />
                )}
            </div>

            {/* ── Modales ── */}
            {mensualidades.showModal && alumnos.selectedAlumno && (
                <ModalAjustarMensualidades
                    alumno={alumnos.selectedAlumno}
                    mensualidades={mensualidades.mensualidades}
                    totalDeuda={mensualidades.totalDeuda}
                    tasa={tasa}
                    loadingMensualidades={mensualidades.loadingMensualidades}
                    saving={mensualidades.savingMensualidades}
                    onClose={mensualidades.handleCloseModal}
                    onSave={mensualidades.handleSave}
                    onGenerarAnualidad={mensualidades.handleGenerarAnualidad}
                    onUpdateMonto={mensualidades.handleUpdateMonto}
                    onBulkUpdate={mensualidades.handleBulkUpdate}
                />
            )}

            {alumnos.showEditModal && (
                <ModalEditarAlumno
                    form={alumnos.editForm}
                    setForm={alumnos.setEditForm}
                    saving={alumnos.savingEdit}
                    onClose={() => alumnos.setShowEditModal(false)}
                    onSave={alumnos.handleSaveEdit}
                />
            )}

            {alumnos.showRegisterModal && (
                <ModalRegistrarAlumno
                    form={alumnos.registerForm}
                    setForm={alumnos.setRegisterForm}
                    checkingRep={alumnos.checkingRep}
                    repFound={alumnos.repFound}
                    saving={alumnos.savingRegister}
                    onClose={alumnos.handleCloseRegisterModal}
                    onSubmit={alumnos.handleRegister}
                    onLimpiarRep={alumnos.handleLimpiarRepresentante}
                />
            )}

            {showFichaSidebar && alumnos.selectedAlumno && (
                <SidebarFichaAlumno
                    alumno={alumnos.selectedAlumno}
                    onClose={() => setShowFichaSidebar(false)}
                    onIrCobranza={(a) => navigate(`/cobranza?cedula=${a.cedula_escolar}`)}
                />
            )}

            {alumnos.showAsignarGradoModal && alumnos.selectedAlumno && (
                <ModalAsignarGrado
                    alumno={alumnos.selectedAlumno}
                    nuevoGrado={alumnos.nuevoGrado}
                    setNuevoGrado={alumnos.setNuevoGrado}
                    saving={alumnos.savingGrado}
                    onClose={() => alumnos.setShowAsignarGradoModal(false)}
                    onConfirmar={alumnos.handleAsignarGrado}
                />
            )}

            {alumnos.showRetirarModal && alumnos.selectedAlumno && (
                <ModalRetirar
                    alumno={alumnos.selectedAlumno}
                    motivo={alumnos.motivoRetiro}
                    setMotivo={alumnos.setMotivoRetiro}
                    saving={alumnos.savingRetiro}
                    onClose={() => alumnos.setShowRetirarModal(false)}
                    onConfirmar={alumnos.handleRetirar}
                />
            )}

            {/* UX-3 fix: modal propio para reactivar, sin window.confirm */}
            {alumnos.alumnoParaReactivar && (
                <ModalConfirmarReactivar
                    alumno={alumnos.alumnoParaReactivar}
                    saving={alumnos.savingReactivar}
                    onConfirmar={alumnos.handleReactivar}
                    onCancelar={alumnos.cancelarReactivar}
                />
            )}
        </div>
    );
};

export default ListaAlumnos;
