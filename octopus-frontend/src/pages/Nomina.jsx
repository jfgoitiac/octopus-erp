import { useState } from 'react';
import {
    Download, Loader2, RefreshCcw, Plus,
    FileSpreadsheet, Pencil, GraduationCap, Briefcase, Wrench,
    Receipt, Search, AlertTriangle,
} from 'lucide-react';

import { useNomina } from '../hooks/useNomina';
import { useSyncedLocalStorage } from '../hooks/useSyncedLocalStorage';
import { loadCestaConfig } from '../constants/avec';
import { ReciboModal } from '../components/nomina/ReciboModal';
import { EmpleadoModal } from '../components/nomina/EmpleadoModal';

// ── Tabs de estamento ────────────────────────────────────────────────────────
const TABS = [
    { key: 'docente',        label: 'Docente',           icon: GraduationCap },
    { key: 'apoyo',          label: 'Personal de Apoyo', icon: Wrench },
    { key: 'administrativo', label: 'Administrativo',    icon: Briefcase },
];

const Nomina = () => {
    const {
        empleados, bancosNomina, loading, fetchError, refetch,
        busqueda, setBusqueda, empleadosPorTab,
        exportingExcel, handleExportExcel,
        showRegisterModal,
        newEmployeeData, handleNewChange,
        isRegistering, handleRegisterEmployee, handleOpenRegisterModal, handleCloseRegisterModal,
        showEditModal, editEmployeeData, handleEditChange,
        isSaving, handleOpenEditModal, handleSaveEmployee, handleCloseEditModal,
    } = useNomina();

    const [activeTab,  setActiveTab]  = useState('docente');
    const [reciboEmp,  setReciboEmp]  = useState(null);

    // cestaConfig se re-lee cada vez que la ventana recupera el foco,
    // evitando calcular recibos con tasas BCV desactualizadas.
    const cestaConfig = useSyncedLocalStorage(loadCestaConfig);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-3" size={36} style={{ color: 'var(--pb)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Cargando nómina...</p>
        </div>
    );

    const tabEmpleados  = empleadosPorTab[activeTab] || [];
    const isDocente     = activeTab === 'docente';
    const activeTabDef  = TABS.find(t => t.key === activeTab);

    return (
        <div className="animate-fadeIn">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                        Gestión de Nómina
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Registro y administración del personal
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={refetch} aria-label="Recargar listado de empleados"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        <RefreshCcw size={16} />
                    </button>
                    <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                        {exportingExcel ? 'Exportando...' : 'Excel'}
                    </button>
                </div>
            </div>

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
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
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
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                {['Empleado', 'Cargo', isDocente ? 'Categoría / Años' : 'Detalles', 'Banco', 'N° Cuenta', 'Acción'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tabEmpleados.length > 0 ? tabEmpleados.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            {emp.nombre} {emp.apellido}
                                        </p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                            V-{emp.cedula}
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
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                MODAL — RECIBO DE PAGO
            ════════════════════════════════════════════════════════════ */}
            {reciboEmp && (
                <ReciboModal
                    emp={reciboEmp}
                    cestaConfig={cestaConfig}
                    onClose={() => setReciboEmp(null)}
                />
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — REGISTRAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {showRegisterModal && (
                <EmpleadoModal
                    title={`Registrar ${activeTabDef?.label || 'empleado'}`}
                    data={newEmployeeData}
                    onChange={handleNewChange}
                    bancosNomina={bancosNomina}
                    onSubmit={handleRegisterEmployee}
                    onClose={handleCloseRegisterModal}
                    isBusy={isRegistering}
                    submitLabel="Registrar"
                    submitIcon={Plus}
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
                    bancosNomina={bancosNomina}
                    onSubmit={handleSaveEmployee}
                    onClose={handleCloseEditModal}
                    isBusy={isSaving}
                    submitLabel="Guardar cambios"
                    submitIcon={Pencil}
                    showTipoSelect
                />
            )}

        </div>
    );
};

export default Nomina;
