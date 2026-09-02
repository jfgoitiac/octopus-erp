import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { TablaScroll } from '../ui/TablaScroll';
import { useReglasRecargoPago } from '../../hooks/useReglasRecargoPago';
import ModalReglaRecargoPago from './ModalReglaRecargoPago';

const formatearValor = (regla) =>
    regla.modo_calculo === 'porcentaje'
        ? `${Number(regla.valor)}%`
        : `$${Number(regla.valor).toFixed(2)}`;

/**
 * Sección "Recargos por Pago Tardío" de Configuración: CRUD de
 * ReglaRecargoPago (cobranza/reglas-recargo-pago/ — ver contrato de API).
 * Mobile-first: la tabla scrollea dentro de TablaScroll, nunca el <body>.
 */
export default function ReglasRecargoPagoTab() {
    const {
        reglasRecargoPago, reglasRecargoPagoLoading,
        sedesDisponibles,
        showReglaRecargoPagoModal, setShowReglaRecargoPagoModal, reglaRecargoPagoEditando,
        reglaRecargoPagoForm, setReglaRecargoPagoForm, reglaRecargoPagoSaving,
        showDeleteReglaRecargoPagoModal, setShowDeleteReglaRecargoPagoModal,
        reglaRecargoPagoAEliminar, setReglaRecargoPagoAEliminar,
        openCreateReglaRecargoPago, openEditReglaRecargoPago,
        handleSaveReglaRecargoPago, confirmarEliminarReglaRecargoPago, handleDeleteReglaRecargoPago,
    } = useReglasRecargoPago();

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="px-5 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--red-light)' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Recargos por Pago Tardío</h3>
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Recargos que se cobran a las mensualidades vencidas a partir de cierto día del mes</p>
                    </div>
                </div>
                <button type="button" onClick={openCreateReglaRecargoPago}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--pb)' }}>
                    <Plus size={13} /> Agregar Regla de Recargo
                </button>
            </div>

            {reglasRecargoPagoLoading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                </div>
            ) : reglasRecargoPago.length === 0 ? (
                <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                    <AlertTriangle size={30} className="mb-2 opacity-20" />
                    <p className="text-sm">No hay reglas de recargo configuradas.</p>
                </div>
            ) : (
                <TablaScroll>
                    <table className="w-full text-left min-w-[720px]">
                        <thead>
                            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                {['Nombre', 'Valor', 'Día de aplicación', 'Sede', 'Estado', ''].map(h => (
                                    <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reglasRecargoPago.map(regla => (
                                <tr key={regla.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--jet)' }}>{regla.nombre}</td>
                                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--jet)' }}>{formatearValor(regla)}</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>Día {regla.dia_aplicacion}</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>
                                        {sedesDisponibles.find(s => s.id === regla.sede)?.nombre || (regla.sede ? `Sede #${regla.sede}` : 'Global')}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                            style={regla.activa
                                                ? { background: '#dcfce7', color: '#16a34a' }
                                                : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                            {regla.activa ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-1.5 justify-end">
                                            <button type="button" onClick={() => openEditReglaRecargoPago(regla)}
                                                className="p-1.5 rounded-lg"
                                                style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                title="Editar">
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" onClick={() => confirmarEliminarReglaRecargoPago(regla)}
                                                className="p-1.5 rounded-lg"
                                                style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                title="Eliminar">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TablaScroll>
            )}

            {showReglaRecargoPagoModal && (
                <ModalReglaRecargoPago
                    open
                    onClose={() => setShowReglaRecargoPagoModal(false)}
                    editando={reglaRecargoPagoEditando}
                    form={reglaRecargoPagoForm}
                    setForm={setReglaRecargoPagoForm}
                    saving={reglaRecargoPagoSaving}
                    onSave={handleSaveReglaRecargoPago}
                    sedesDisponibles={sedesDisponibles}
                />
            )}

            {showDeleteReglaRecargoPagoModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Regla de Recargo"
                    nombre={reglaRecargoPagoAEliminar?.nombre}
                    onConfirm={handleDeleteReglaRecargoPago}
                    onCancel={() => { setShowDeleteReglaRecargoPagoModal(false); setReglaRecargoPagoAEliminar(null); }}
                />
            )}
        </div>
    );
}
