import { Loader2, Save } from 'lucide-react';
import { Modal } from '../ui/Modal';

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const labelStyle = { color: 'var(--ash)' };

const MONTO_EJEMPLO = 30;

/**
 * Calcula la previsualización en vivo del recargo, 100% en el cliente,
 * sin llamar a la API — solo con los valores actuales del formulario.
 */
const calcularEjemplo = (form) => {
    const dia = parseInt(form.dia_aplicacion, 10);
    const valor = parseFloat(form.valor);
    if (!dia || isNaN(dia) || form.valor === '' || isNaN(valor)) return null;

    const montoConRecargo = form.modo_calculo === 'porcentaje'
        ? MONTO_EJEMPLO + (MONTO_EJEMPLO * valor / 100)
        : MONTO_EJEMPLO + valor;

    return {
        diaSinRecargo: dia - 1,
        diaConRecargo: dia,
        montoSinRecargo: MONTO_EJEMPLO.toFixed(2),
        montoConRecargo: montoConRecargo.toFixed(2),
    };
};

/**
 * Formulario de creación/edición de ReglaRecargoPago (recargo por
 * mensualidad vencida a partir de cierto día del mes — ver contrato de API
 * cobranza/reglas-recargo-pago/).
 */
export default function ModalReglaRecargoPago({
    open, onClose, editando,
    form, setForm, saving, onSave,
}) {
    const ejemplo = calcularEjemplo(form);

    return (
        <Modal
            open={open}
            onClose={onClose}
            titulo={editando ? 'Editar Regla de Recargo' : 'Agregar Regla de Recargo'}
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
                            placeholder="Ej. Recargo por pago tardío" />
                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Este texto se imprime tal cual en el recibo y lo ve el representante.</p>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Descripción</label>
                        <input type="text" value={form.descripcion}
                            onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}
                            placeholder="Opcional" />
                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Texto que ve el representante en el portal.</p>
                    </div>

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Modo de Cálculo</label>
                        <select value={form.modo_calculo}
                            onChange={e => setForm(p => ({ ...p, modo_calculo: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                            <option value="monto_fijo_usd">Monto fijo (USD)</option>
                            <option value="porcentaje">Porcentaje</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>
                            Valor {form.modo_calculo === 'porcentaje' ? '(%)' : '(USD)'} *
                        </label>
                        {form.modo_calculo === 'porcentaje' ? (
                            <input type="number" step="1" min="0" max="100" value={form.valor}
                                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                        ) : (
                            <input type="number" step="0.01" min="0" value={form.valor}
                                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                        )}
                    </div>

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Día de Aplicación *</label>
                        <input type="number" min="1" max="31" value={form.dia_aplicacion}
                            onChange={e => setForm(p => ({ ...p, dia_aplicacion: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>El recargo aplica desde este día, inclusive.</p>
                    </div>
                </div>

                {/* Previsualización en vivo — calculada 100% en el cliente, sin llamada a la API */}
                <div className="p-3.5 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                    <p className="text-[11px] uppercase tracking-widest mb-2" style={labelStyle}>Previsualización</p>
                    {ejemplo ? (
                        <div className="space-y-1.5 text-sm">
                            <p style={{ color: 'var(--jet)' }}>
                                Una mensualidad de ${MONTO_EJEMPLO.toFixed(2)} pagada el día {ejemplo.diaSinRecargo} → <span className="font-semibold">${ejemplo.montoSinRecargo}</span> (sin recargo)
                            </p>
                            <p style={{ color: 'var(--red)' }}>
                                Una mensualidad de ${MONTO_EJEMPLO.toFixed(2)} pagada el día {ejemplo.diaConRecargo} → <span className="font-semibold">${ejemplo.montoConRecargo}</span> (con recargo)
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Completa el día y el valor para ver el ejemplo.</p>
                    )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                    <span className="text-[11px] uppercase tracking-widest" style={labelStyle}>Activa</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={form.activa}
                            onChange={e => setForm(p => ({ ...p, activa: e.target.checked }))} />
                        <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                            style={{ background: form.activa ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                    </label>
                </div>
            </div>
        </Modal>
    );
}
