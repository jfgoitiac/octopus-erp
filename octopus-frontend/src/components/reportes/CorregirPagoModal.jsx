import { useContext, useEffect, useState } from 'react';
import { Pencil, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { corregirPago, obtenerElegibilidadMontoPago } from '../../api/cobranza.service';
import { METODO_LABELS, getErrorMessage, fmt } from '../../constants/reportes';
import { Modal } from '../ui/Modal';
import { AuthContext } from '../../context/AuthContext';
import { ROLE_GROUPS } from '../../constants/roles';

const MOTIVO_MIN_LEN = 10;

// Label del campo de abono según el tipo de cuota que devuelva el backend
// (ver ElegibilidadMontoCorreccionView) — 'inscripcion' no tiene abono
// parcial (es todo-o-nada), así que no aparece acá.
const CUOTA_ABONO_LABEL = {
    solvencia: 'Abono a cuota de solvencia',
    mensualidad: 'Abono a mensualidad',
    proyecto_inversion: 'Abono a proyecto de inversión',
};

/**
 * Corrige datos de un pago YA registrado (método, referencia, lote, banco,
 * observaciones, y para admin/director/sistemas también monto y, si el pago
 * está ligado a lo sumo una cuota, su abono). Requiere `motivo` (auditoría
 * de por qué se corrigió) — el backend puede rechazar la corrección si el
 * pago cae dentro de un cierre de caja ya validado, o si el monto no es
 * editable (ligado a más de una cuota/mensualidad); esos mensajes se
 * muestran tal cual, sin reformular.
 */
const CorregirPagoModal = ({ pago, bancosDisponibles, onClose, onGuardado }) => {
    const { user } = useContext(AuthContext);
    const rol = (user?.rol || '').toLowerCase().trim();
    const puedeEditarMonto = ROLE_GROUPS.REPRESENTANTES_EDITAR.includes(rol);

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

    // Elegibilidad de edición de monto — solo se consulta si el rol califica,
    // para no gastar la llamada en cajero/cobranza que nunca verán estos campos.
    const [elegibilidad, setElegibilidad] = useState(null);
    const [cargandoElegibilidad, setCargandoElegibilidad] = useState(puedeEditarMonto);
    const [montoUsd, setMontoUsd] = useState(String(pago.monto_usd ?? ''));
    const [cuotaMontoPagado, setCuotaMontoPagado] = useState('');

    useEffect(() => {
        if (!puedeEditarMonto) return;
        const controller = new AbortController();
        obtenerElegibilidadMontoPago(pago.id, controller.signal)
            .then(({ data }) => {
                setElegibilidad(data);
                if (data.cuota?.monto_pagado != null) {
                    setCuotaMontoPagado(String(data.cuota.monto_pagado));
                }
            })
            .catch(err => {
                if (err.name !== 'CanceledError') {
                    toast.error(getErrorMessage(err, 'No se pudo consultar la elegibilidad de monto.'));
                }
            })
            .finally(() => setCargandoElegibilidad(false));
        return () => controller.abort();
    }, [puedeEditarMonto, pago.id]);

    // 'inscripcion' es todo-o-nada (sin monto_pagado) — no tiene campo de abono.
    const cuotaConAbono = elegibilidad?.cuota && elegibilidad.cuota.tipo !== 'inscripcion' ? elegibilidad.cuota : null;

    const requiereBanco = metodoPago && !['efectivo', 'efectivo_ves'].includes(metodoPago);
    const esPuntoDeVenta = metodoPago === 'punto_de_venta';
    const loteInvalido = esPuntoDeVenta && numeroLote.length !== 4;
    const motivoInvalido = motivo.trim().length < MOTIVO_MIN_LEN;
    const montoUsdInvalido = puedeEditarMonto && elegibilidad?.editable_monto
        && (montoUsd === '' || Number(montoUsd) <= 0);
    const cuotaMontoInvalido = puedeEditarMonto && cuotaConAbono
        && (cuotaMontoPagado === ''
            || Number(cuotaMontoPagado) < 0
            || Number(cuotaMontoPagado) > Number(cuotaConAbono.monto_usd));

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
        if (montoUsdInvalido) {
            toast.warning('El monto del pago debe ser mayor a 0.');
            return;
        }
        if (cuotaMontoInvalido) {
            toast.warning('El monto pagado de la cuota debe estar entre 0 y el total de la cuota.');
            return;
        }
        setGuardando(true);
        try {
            const payload = {
                metodo_pago: metodoPago,
                referencia,
                numero_lote: esPuntoDeVenta ? numeroLote : '',
                banco_receptor: requiereBanco ? (bancoReceptor || null) : null,
                observaciones,
                motivo: motivo.trim(),
            };
            if (puedeEditarMonto && elegibilidad?.editable_monto) {
                if (Number(montoUsd) !== Number(pago.monto_usd)) {
                    payload.monto_usd = montoUsd;
                }
                if (cuotaConAbono && Number(cuotaMontoPagado) !== Number(cuotaConAbono.monto_pagado)) {
                    payload.cuota_monto_pagado = cuotaMontoPagado;
                }
            }
            await corregirPago(pago.id, payload);
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

                {/* Monto del pago y abono de solvencia — solo admin/director/sistemas */}
                {puedeEditarMonto && cargandoElegibilidad && (
                    <div className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--bg)' }} />
                )}
                {puedeEditarMonto && !cargandoElegibilidad && elegibilidad && !elegibilidad.editable_monto && (
                    <p className="text-xs p-2.5 rounded-lg" style={{ background: 'var(--bg)', color: 'var(--ash)' }}>
                        {elegibilidad.razon}
                    </p>
                )}
                {puedeEditarMonto && !cargandoElegibilidad && elegibilidad?.editable_monto && (
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                                Monto del pago (USD)
                            </label>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={montoUsd}
                                onChange={e => setMontoUsd(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: `0.5px solid ${touched && montoUsdInvalido ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                            />
                            {touched && montoUsdInvalido && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>Debe ser mayor a 0.</p>
                            )}
                        </div>
                        {cuotaConAbono && (
                            <div className="flex-1">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                                    {CUOTA_ABONO_LABEL[cuotaConAbono.tipo] || 'Abono a cuota'} (de ${fmt(cuotaConAbono.monto_usd)})
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    max={cuotaConAbono.monto_usd}
                                    value={cuotaMontoPagado}
                                    onChange={e => setCuotaMontoPagado(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: `0.5px solid ${touched && cuotaMontoInvalido ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                                />
                                {touched && cuotaMontoInvalido && (
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                                        Debe estar entre 0 y {fmt(cuotaConAbono.monto_usd)}.
                                    </p>
                                )}
                            </div>
                        )}
                        {elegibilidad.cuota?.tipo === 'inscripcion' && (
                            <p className="flex-1 text-xs self-center" style={{ color: 'var(--ash)' }}>
                                Ligado a una cuota de inscripción (todo-o-nada) — no tiene abono que corregir.
                            </p>
                        )}
                    </div>
                )}

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
