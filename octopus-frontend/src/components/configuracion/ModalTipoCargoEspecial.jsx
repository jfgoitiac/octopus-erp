import { Loader2, Save } from 'lucide-react';
import { Modal } from '../ui/Modal';

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const labelStyle = { color: 'var(--ash)' };

/**
 * Formulario de creación/edición de TipoCargoEspecial (cargo especial
 * dinámico, generalización de "Proyecto de Inversión" — ver
 * cobranza/models.py::TipoCargoEspecial).
 */
export default function ModalTipoCargoEspecial({
    open, onClose, editando,
    form, setForm, saving, onSave,
    gradosDisponibles, sedesDisponibles,
}) {
    const toggleEnLista = (campo, id) => {
        setForm(p => {
            const actual = p[campo] || [];
            const yaEsta = actual.includes(id);
            return { ...p, [campo]: yaEsta ? actual.filter(x => x !== id) : [...actual, id] };
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            titulo={editando ? 'Editar Cargo Especial' : 'Agregar Cargo Especial'}
            size="lg"
            footer={(
                <>
                    <button type="button" onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={onSave} disabled={saving}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--pb)' }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Guardar
                    </button>
                </>
            )}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Nombre *</label>
                        <input type="text" value={form.nombre}
                            onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}
                            placeholder="Ej. Uniformes, Materiales, Excursión" />
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Monto por Defecto (USD) *</label>
                        <input type="number" step="0.01" min="0" value={form.monto_defecto_usd}
                            onChange={e => setForm(p => ({ ...p, monto_defecto_usd: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Alcance</label>
                        <select value={form.alcance}
                            onChange={e => setForm(p => ({ ...p, alcance: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                            <option value="todos">Todos los representantes</option>
                            <option value="grado">Por grado</option>
                            <option value="sede">Por sede</option>
                        </select>
                    </div>

                    {form.alcance === 'grado' && (
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Grados aplicables</label>
                            <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                {gradosDisponibles.length === 0 && (
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>No hay grados configurados.</span>
                                )}
                                {gradosDisponibles.map(g => (
                                    <label key={g.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                                        style={{ border: '0.5px solid var(--border-md)', background: form.grados.includes(g.id) ? 'var(--pb-light)' : '#fff' }}>
                                        <input type="checkbox" checked={form.grados.includes(g.id)}
                                            onChange={() => toggleEnLista('grados', g.id)} className="accent-current" />
                                        {g.grado_seccion}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {form.alcance === 'sede' && (
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Sedes aplicables</label>
                            <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                {sedesDisponibles.length === 0 && (
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>No hay sedes configuradas.</span>
                                )}
                                {sedesDisponibles.map(s => (
                                    <label key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                                        style={{ border: '0.5px solid var(--border-md)', background: form.sedes.includes(s.id) ? 'var(--pb-light)' : '#fff' }}>
                                        <input type="checkbox" checked={form.sedes.includes(s.id)}
                                            onChange={() => toggleEnLista('sedes', s.id)} className="accent-current" />
                                        {s.nombre}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Periodicidad</label>
                        <select value={form.periodicidad}
                            onChange={e => setForm(p => ({
                                ...p, periodicidad: e.target.value,
                                numero_cuotas: e.target.value === 'unico' ? 1 : p.numero_cuotas,
                            }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                            <option value="unico">Único</option>
                            <option value="mensual">Mensual</option>
                            <option value="trimestral">Trimestral</option>
                        </select>
                    </div>

                    {form.periodicidad !== 'unico' && (
                        <>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Número de Cuotas *</label>
                                <input type="number" min="1" value={form.numero_cuotas}
                                    onChange={e => setForm(p => ({ ...p, numero_cuotas: parseInt(e.target.value) || 1 }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Fecha Primera Cuota *</label>
                                <input type="date" value={form.fecha_primera_cuota}
                                    onChange={e => setForm(p => ({ ...p, fecha_primera_cuota: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Día de Cobro (opcional)</label>
                                <input type="number" min="1" max="31" value={form.dia_cobro}
                                    onChange={e => setForm(p => ({ ...p, dia_cobro: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}
                                    placeholder="Sobrescribe el día del mes" />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                    <span className="text-[11px] uppercase tracking-widest" style={labelStyle}>Bloquea inscripción si está impago</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={form.bloquea_inscripcion}
                            onChange={e => setForm(p => ({ ...p, bloquea_inscripcion: e.target.checked }))} />
                        <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                            style={{ background: form.bloquea_inscripcion ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                    </label>
                </div>

                {editando && (
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                        <span className="text-[11px] uppercase tracking-widest" style={labelStyle}>Activo</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.activo}
                                onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} />
                            <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                style={{ background: form.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                        </label>
                    </div>
                )}
            </div>
        </Modal>
    );
}
