import { useState } from 'react';
import { Pencil, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { corregirPago } from '../../api/cobranza.service';
import { METODO_LABELS, getErrorMessage, fmt } from '../../constants/reportes';
import { Modal } from '../ui/Modal';

const MOTIVO_MIN_LEN = 10;

/**
 * Corrige datos de un pago YA registrado (método, referencia, lote, banco,
 * observaciones). Requiere `motivo` (auditoría de por qué se corrigió) — el
 * backend puede rechazar la corrección si el pago cae dentro de un cierre de
 * caja ya validado; ese mensaje se muestra tal cual, sin reformular.
 */
const CorregirPagoModal = ({ pago, bancosDisponibles, onClose, onGuardado }) => {
    const [metodoPago, setMetodoPago] = useState(pago.metodo_pago || 'transferencia');
    const [referencia, setReferencia] = useState(pago.referencia || '');
    const [numeroLote, setNumeroLote] = useState(pago.numero_lote || '');
    // banco_receptor viaja como el ID de la FK en PagoSerializer (banco_nombre
    // es solo el display) — el select usa ese mismo id como value.
    const [bancoReceptor, setBancoReceptor] = useState(pago.banco_receptor || '');
    const [observaciones, setObservaciones] = useState(pago.observaciones || '');
    const [motivo, setMotivo] = useState('');
    const [touched, setTouched] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const requiereBanco = metodoPago && !['efectivo', 'efectivo_ves'].includes(metodoPago);
    const esPuntoDeVenta = metodoPago === 'punto_de_venta';
    const loteInvalido = esPuntoDeVenta && numeroLote.length !== 4;
    const motivoInvalido = motivo.trim().length < MOTIVO_MIN_LEN;

    const handleGuardar = async () => {
        setTouched(true);
        if (loteInvalido) {
            toast.warning('El número de lote debe tener 4 dígitos.');
            return;
        }
        if (motivoInvalido) {
            toast.warning(`Explica el motivo de la corrección (mínimo ${MOTIVO_MIN_LEN} caracteres).`);
            return;
        }
        setGuardando(true);
        try {
            await corregirPago(pago.id, {
                metodo_pago: metodoPago,
                referencia,
                numero_lote: esPuntoDeVenta ? numeroLote : '',
                banco_receptor: requiereBanco ? (bancoReceptor || null) : null,
                observaciones,
                motivo: motivo.trim(),
            });
            onGuardado();
        } catch (err) {
            // El backend devuelve, ej., "el pago pertenece a un cierre de caja ya
            // validado" en 400 — se muestra el mensaje real, no uno genérico.
            toast.error(getErrorMessage(err, 'No se pudo corregir el pago.'));
        } finally {
            setGuardando(false);
        }
    };

    const footer = (
        <>
            <button onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar corrección
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            className="z-[100]"
            titulo={(
                <div>
                    <div className="flex items-center gap-2">
                        <Pencil size={17} />
                        Corregir Pago
                    </div>
                    <p className="text-xs mt-0.5 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        {`${pago.nombre_alumno || ''} ${pago.apellido_alumno || ''}`.trim() || pago.alumno || '—'}
                        {' · '}${fmt(pago.monto_usd)} · Ref. {pago.referencia || '—'}
                    </p>
                </div>
            )}
            footer={footer}
            size="md"
        >
            <div className="space-y-4">
                {/* Método de pago */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                        Método de pago
                    </label>
                    <select
                        value={metodoPago}
                        onChange={e => {
                            const val = e.target.value;
                            setMetodoPago(val);
                            if (['efectivo', 'efectivo_ves'].includes(val)) setBancoReceptor('');
                            if (val !== 'punto_de_venta') setNumeroLote('');
                        }}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                        {Object.entries(METODO_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                </div>

                {/* Banco receptor */}
                {requiereBanco && (
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Banco receptor
                        </label>
                        <select
                            value={bancoReceptor}
                            onChange={e => setBancoReceptor(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                            <option value="">Sin banco</option>
                            {bancosDisponibles.map(b => (
                                <option key={b.id} value={b.id}>{b.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Referencia + lote */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={esPuntoDeVenta ? '' : 'col-span-2'}>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Nº de referencia
                        </label>
                        <input
                            type="text"
                            value={referencia}
                            onChange={e => setReferencia(esPuntoDeVenta ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
                            maxLength={esPuntoDeVenta ? 4 : undefined}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                        />
                    </div>
                    {esPuntoDeVenta && (
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Nº de lote (4 dígitos)
                            </label>
                            <input
                                type="text"
                                value={numeroLote}
                                onChange={e => setNumeroLote(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                maxLength={4}
                                placeholder="Ej: 0042"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: `0.5px solid ${touched && loteInvalido ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                            />
                            {touched && loteInvalido && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>Debe tener 4 dígitos.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Observaciones */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                        Observaciones
                    </label>
                    <textarea
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                    />
                </div>

                {/* Motivo (obligatorio) */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                        Motivo de la corrección <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        rows={3}
                        placeholder="Explica por qué se corrige este pago (mínimo 10 caracteres)…"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ border: `0.5px solid ${touched && motivoInvalido ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                    />
                    {touched && motivoInvalido && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                            Escribe al menos {MOTIVO_MIN_LEN} caracteres explicando el motivo.
                        </p>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default CorregirPagoModal;
