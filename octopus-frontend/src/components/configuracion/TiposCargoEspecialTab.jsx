import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { TablaScroll } from '../ui/TablaScroll';
import { useTiposCargoEspecial } from '../../hooks/useTiposCargoEspecial';
import ModalTipoCargoEspecial from './ModalTipoCargoEspecial';

const ALCANCE_LABELS = { todos: 'Todos', grado: 'Por grado', sede: 'Por sede' };
const PERIODICIDAD_LABELS = { unico: 'Único', mensual: 'Mensual', trimestral: 'Trimestral' };

/**
 * Sección "Cargos Especiales" de Configuración: CRUD de TipoCargoEspecial
 * (generalización dinámica de "Proyecto de Inversión" — ver
 * cobranza/models.py::TipoCargoEspecial). Mobile-first: la tabla scrollea
 * dentro de TablaScroll, nunca el <body>.
 */
export default function TiposCargoEspecialTab() {
    const {
        tiposCargoEspecial, tiposCargoEspecialLoading,
        gradosDisponibles, sedesDisponibles,
        showTipoCargoEspecialModal, setShowTipoCargoEspecialModal, tipoCargoEspecialEditando,
        tipoCargoEspecialForm, setTipoCargoEspecialForm, tipoCargoEspecialSaving,
        showDeleteTipoCargoEspecialModal, setShowDeleteTipoCargoEspecialModal,
        tipoCargoEspecialAEliminar, setTipoCargoEspecialAEliminar,
        openCreateTipoCargoEspecial, openEditTipoCargoEspecial,
        handleSaveTipoCargoEspecial, confirmarEliminarTipoCargoEspecial, handleDeleteTipoCargoEspecial,
    } = useTiposCargoEspecial();

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="px-5 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                        <Sparkles size={15} style={{ color: 'var(--pb)' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Cargos Especiales</h3>
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Cargos dinámicos por representante (uniformes, materiales, excursiones, etc.)</p>
                    </div>
                </div>
                <button type="button" onClick={openCreateTipoCargoEspecial}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--pb)' }}>
                    <Plus size={13} /> Agregar Cargo Especial
                </button>
            </div>

            {tiposCargoEspecialLoading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                </div>
            ) : tiposCargoEspecial.length === 0 ? (
                <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                    <Sparkles size={30} className="mb-2 opacity-20" />
                    <p className="text-sm">No hay cargos especiales configurados.</p>
                </div>
            ) : (
                <TablaScroll>
                    <table className="w-full text-left min-w-[720px]">
                        <thead>
                            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                {['Cargo', 'Monto', 'Alcance', 'Periodicidad', 'Bloquea', 'Estado', ''].map(h => (
                                    <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tiposCargoEspecial.map(tipo => (
                                <tr key={tipo.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--jet)' }}>{tipo.nombre}</td>
                                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--jet)' }}>${Number(tipo.monto_defecto_usd).toFixed(2)}</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>{ALCANCE_LABELS[tipo.alcance] || tipo.alcance}</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>
                                        {PERIODICIDAD_LABELS[tipo.periodicidad] || tipo.periodicidad}
                                        {tipo.periodicidad !== 'unico' && ` (${tipo.numero_cuotas})`}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                            style={tipo.bloquea_inscripcion
                                                ? { background: 'var(--red-light)', color: 'var(--red)' }
                                                : { background: 'var(--bg)', color: 'var(--ash)' }}>
                                            {tipo.bloquea_inscripcion ? 'Sí' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                            style={tipo.activo
                                                ? { background: '#dcfce7', color: '#16a34a' }
                                                : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                            {tipo.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-1.5 justify-end">
                                            <button type="button" onClick={() => openEditTipoCargoEspecial(tipo)}
                                                className="p-1.5 rounded-lg"
                                                style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                title="Editar">
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" onClick={() => confirmarEliminarTipoCargoEspecial(tipo)}
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

            {showTipoCargoEspecialModal && (
                <ModalTipoCargoEspecial
                    open
                    onClose={() => setShowTipoCargoEspecialModal(false)}
                    editando={tipoCargoEspecialEditando}
                    form={tipoCargoEspecialForm}
                    setForm={setTipoCargoEspecialForm}
                    saving={tipoCargoEspecialSaving}
                    onSave={handleSaveTipoCargoEspecial}
                    gradosDisponibles={gradosDisponibles}
                    sedesDisponibles={sedesDisponibles}
                />
            )}

            {showDeleteTipoCargoEspecialModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Cargo Especial"
                    nombre={tipoCargoEspecialAEliminar?.nombre}
                    onConfirm={handleDeleteTipoCargoEspecial}
                    onCancel={() => { setShowDeleteTipoCargoEspecialModal(false); setTipoCargoEspecialAEliminar(null); }}
                />
            )}
        </div>
    );
}
