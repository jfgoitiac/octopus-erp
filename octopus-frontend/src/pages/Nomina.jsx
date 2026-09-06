import { useState } from 'react';
import {
    Loader2, RefreshCcw, Plus,
    FileSpreadsheet, Pencil, GraduationCap, Briefcase, Wrench,
    Receipt, Search, AlertTriangle, Trash2,
} from 'lucide-react';

import { useNomina } from '../hooks/useNomina';
import { useConfiguracion } from '../hooks/useConfiguracion';
import { ReciboModal } from '../components/nomina/ReciboModal';
import { GenerarNominaModal } from '../components/nomina/GenerarNominaModal';
import { EmpleadoModal } from '../components/nomina/EmpleadoModal';
import SkeletonFila from '../components/nomina/SkeletonFila';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';

// ── Tabs de estamento ────────────────────────────────────────────────────────
const TABS = [
    { key: 'docente',        label: 'Docente',           icon: GraduationCap },
    { key: 'apoyo',          label: 'Personal de Apoyo', icon: Wrench },
    { key: 'administrativo', label: 'Administrativo',    icon: Briefcase },
];

const NOMINA_COLUMNAS = (isDocente) => [
    { key: 'empleado',  label: 'Empleado' },
    { key: 'cargo',     label: 'Cargo' },
    { key: 'detalles',  label: isDocente ? 'Categoría / Años' : 'Detalles' },
    { key: 'banco',     label: 'Banco' },
    { key: 'cuenta',    label: 'N° Cuenta' },
    { key: 'accion',    label: 'Acción' },
];

const Nomina = () => {
    const {
        empleados, bancosNomina, loading, isRefreshing, fetchError, refetch,
        busqueda, setBusqueda, empleadosPorTab,
        exportingExcel, handleExportExcel,
        showRegisterModal,
        newEmployeeData, handleNewChange, registerErrors,
        isRegistering, handleRegisterEmployee, handleOpenRegisterModal, handleCloseRegisterModal,
        showEditModal, editEmployeeData, handleEditChange, editErrors,
        isSaving, handleOpenEditModal, handleSaveEmployee, handleCloseEditModal,
        empleadoParaEliminar, deletingId,
        solicitarEliminarEmpleado, cancelarEliminarEmpleado, confirmarEliminarEmpleado,
    } = useNomina();
    const { config } = useConfiguracion();
    const convenioNomina = config?.convenio_nomina || 'avec_ve';

    const [activeTab,  setActiveTab]  = useState('docente');
    const [reciboEmp,  setReciboEmp]  = useState(null);
    const [showGenerar, setShowGenerar] = useState(false);

    if (loading) return (
        <div className="animate-fadeIn">
            <PageHeader
                titulo="Gestión de Nómina"
                descripcion="Registro y administración del personal"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl p-4 animate-pulse"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <div className="h-3 w-24 rounded mb-3" style={{ background: 'var(--border-md)' }} />
                        <div className="h-5 w-32 rounded" style={{ background: 'var(--border-md)' }} />
                    </div>
                ))}
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <table className="w-full text-left">
                    <tbody>
                        {[...Array(6)].map((_, i) => <SkeletonFila key={i} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const tabEmpleados  = empleadosPorTab[activeTab] || [];
    const isDocente     = activeTab === 'docente';
    const activeTabDef  = TABS.find(t => t.key === activeTab);

    return (
        <div className="animate-fadeIn">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <PageHeader
                titulo="Gestión de Nómina"
                descripcion="Registro y administración del personal"
                acciones={
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setShowGenerar(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--pb)' }}>
                            <Receipt size={16} /> Generar nómina
                        </button>
                        <button onClick={refetch} disabled={isRefreshing || loading}
                            aria-label="Recargar listado de empleados"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                            style={{ background: 'var(--jet)' }}>
                            {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                            {exportingExcel ? 'Exportando...' : 'Excel'}
                        </button>
                    </div>
                }
            />

            {/* ── Banner de error de carga ─────────────────────────────────── */}
            {fetchError && (
                <div className="mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
                    style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626' }}>
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <span className="flex-1">{fetchError}</span>
                    <button onClick={refetch}
                        className="text-xs font-medium underline underline-offset-2 flex-shrink-0">
                        Reintentar
                    </button>
                </div>
            )}

            {/* ── Stat cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <div key={t.key} className="rounded-xl p-4"
                            style={{ background: 'var(--porcelain)', border: `0.5px solid ${activeTab === t.key ? 'var(--pb)' : 'var(--border-md)'}` }}>
                            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                                {t.label}
                            </p>
                            <div className="flex items-center gap-2">
                                <Icon size={18} style={{ color: 'var(--pb)' }} />
                                <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                                    {(empleadosPorTab[t.key] || []).length} empleados
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Búsqueda + Tabs ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--ash)' }} />
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar nombre, cédula, cargo…"
                        className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)', fontSize: '16px' }}
                        aria-label="Buscar empleados"
                    />
                </div>

                <div className="flex items-center gap-2">
                    {/* overflow-x-auto permite scroll horizontal en pantallas muy pequeñas */}
                    <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        {TABS.map(t => {
                            const Icon   = t.icon;
                            const active = activeTab === t.key;
                            return (
                                <button key={t.key} onClick={() => setActiveTab(t.key)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                                    style={{ background: active ? 'var(--pb)' : 'transparent', color: active ? '#fff' : 'var(--ash)' }}>
                                    <Icon size={14} />
                                    {t.label}
                                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-1"
                                        style={{ background: active ? 'rgba(255,255,255,0.2)' : 'var(--border-md)', color: active ? '#fff' : 'var(--ash)' }}>
                                        {(empleadosPorTab[t.key] || []).length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => handleOpenRegisterModal(activeTab)}
                        className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors flex-shrink-0"
                        style={{ background: 'var(--pb)', color: '#fff' }}
                        aria-label={`Registrar ${activeTabDef?.label}`}
                        title={`Registrar ${activeTabDef?.label}`}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* ── Tabla de empleados ───────────────────────────────────────── */}
            <Card padding="none">
                <Tabla columnas={NOMINA_COLUMNAS(isDocente)} minWidth={720}>
                    {tabEmpleados.length > 0 ? tabEmpleados.map(emp => (
                                <tr key={emp.id}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            {emp.nombre} {emp.apellido}
                                        </p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                            {/^[a-zA-Z]-/.test(emp.cedula || '') ? emp.cedula : `V-${emp.cedula}`}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs px-2 py-1 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                            {emp.cargo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {isDocente ? (
                                            <div>
                                                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                                    {emp.categoria_docente || <span style={{ color: 'var(--ash)' }}>—</span>}
                                                </p>
                                                {emp.anos_servicio && (
                                                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                                        {emp.anos_servicio} años servicio
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                                {emp.correo || emp.telefono || '—'}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.banco_nombre || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                        {emp.numero_cuenta || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleOpenEditModal(emp)}
                                                className="flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium min-h-[40px] sm:min-h-0"
                                                style={{ color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
                                                aria-label={`Editar a ${emp.nombre} ${emp.apellido}`}>
                                                <Pencil size={12} /> Editar
                                            </button>
                                            <button onClick={() => setReciboEmp(emp)}
                                                className="flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-white min-h-[40px] sm:min-h-0"
                                                style={{ background: 'var(--pb)' }}
                                                aria-label={`Generar recibo de ${emp.nombre} ${emp.apellido}`}>
                                                <Receipt size={12} /> Recibo
                                            </button>
                                            <button onClick={() => solicitarEliminarEmpleado(emp)}
                                                disabled={deletingId === emp.id}
                                                className="flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium min-h-[40px] sm:min-h-0 disabled:opacity-50"
                                                style={{ color: 'var(--red)', border: '0.5px solid var(--border-md)' }}
                                                aria-label={`Desactivar a ${emp.nombre} ${emp.apellido}`}>
                                                {deletingId === emp.id
                                                    ? <Loader2 size={12} className="animate-spin" />
                                                    : <Trash2 size={12} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                    )) : (
                                <tr>
                                    <td colSpan="6" className="px-4 py-16 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                        {busqueda
                                            ? `Sin resultados para "${busqueda}".`
                                            : `No hay personal ${activeTabDef?.label.toLowerCase()} registrado.`
                                        }
                                    </td>
                                </tr>
                    )}
                </Tabla>
            </Card>

            {/* ════════════════════════════════════════════════════════════
                MODAL — RECIBO DE PAGO
            ════════════════════════════════════════════════════════════ */}
            {reciboEmp && (
                <ReciboModal
                    emp={reciboEmp}
                    onClose={() => setReciboEmp(null)}
                />
            )}

            {showGenerar && <GenerarNominaModal onClose={() => setShowGenerar(false)} onGenerated={refetch} />}

            {/* ════════════════════════════════════════════════════════════
                MODAL — REGISTRAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {showRegisterModal && (
                <EmpleadoModal
                    title={`Registrar ${activeTabDef?.label || 'empleado'}`}
                    data={newEmployeeData}
                    onChange={handleNewChange}
                    errors={registerErrors}
                    bancosNomina={bancosNomina}
                    onSubmit={handleRegisterEmployee}
                    onClose={handleCloseRegisterModal}
                    isBusy={isRegistering}
                    submitLabel="Registrar"
                    submitIcon={Plus}
                    convenioNomina={convenioNomina}
                />
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — EDITAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {showEditModal && editEmployeeData && (
                <EmpleadoModal
                    title={`Editar — ${editEmployeeData.nombre} ${editEmployeeData.apellido}`}
                    data={editEmployeeData}
                    onChange={handleEditChange}
                    errors={editErrors}
                    bancosNomina={bancosNomina}
                    onSubmit={handleSaveEmployee}
                    onClose={handleCloseEditModal}
                    isBusy={isSaving}
                    submitLabel="Guardar cambios"
                    submitIcon={Pencil}
                    showTipoSelect
                    convenioNomina={convenioNomina}
                />
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — ELIMINAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {empleadoParaEliminar && (
                <ConfirmDeleteModal
                    titulo="Desactivar empleado"
                    nombre={`${empleadoParaEliminar.nombre} ${empleadoParaEliminar.apellido}`}
                    mensaje={<>¿Desactivar a <b>{empleadoParaEliminar.nombre} {empleadoParaEliminar.apellido}</b>? No se eliminará su historial de nómina y podrá reactivarse más adelante.</>}
                    labelBoton="Desactivar"
                    onConfirm={confirmarEliminarEmpleado}
                    onCancel={cancelarEliminarEmpleado}
                />
            )}

        </div>
    );
};

export default Nomina;
