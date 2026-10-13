import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { AdjuntoMensaje } from './AdjuntoMensaje';
import { convertirAdjuntoComprobante, getBancos, getMensualidadesPendientes } from '../../../api/cobranza.service';
import { METODOS_PAGO, mensajeError } from './conversacionesUtils';

const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const usd = (v) => `$${(Number(v) || 0).toFixed(2)}`;

/**
 * Convierte el adjunto pendiente en comprobante(s) de pago: un comprobante por mensualidad elegida,
 * que entra al flujo normal de revisión. Contenido con estado propio, montado sólo con el modal abierto.
 */
function ContenidoConvertir({ mensajeId, conversacionId, adjunto, onClose, onHecho }) {
    const [datos, setDatos] = useState(null); // { representante, results } | 'error'
    const [bancos, setBancos] = useState([]);
    const [elegidas, setElegidas] = useState([]);
    const [referencia, setReferencia] = useState('');
    const [metodo, setMetodo] = useState('transferencia');
    const [banco, setBanco] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        getMensualidadesPendientes(conversacionId, controller.signal)
            .then(res => setDatos(res.data))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setDatos('error');
                toast.error(mensajeError(err, 'No se pudieron cargar las mensualidades pendientes.'));
            });
        // Los bancos son opcionales: si fallan, el modal sigue funcionando sin ese selector.
        getBancos(controller.signal)
            .then(res => setBancos(res.data?.results ?? res.data ?? []))
            .catch(() => {});
        return () => controller.abort();
    }, [conversacionId]);

    const cargando = datos === null;
    const filas = datos && datos !== 'error' ? (datos.results || []) : [];
    const sinRepresentante = !!datos && datos !== 'error' && !datos.representante;

    const alternar = (id) => setElegidas(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const convertir = async () => {
        setGuardando(true);
        try {
            const cuerpo = { mensualidades: elegidas, metodo_pago: metodo };
            if (referencia.trim()) cuerpo.referencia_bancaria = referencia.trim();
            if (banco) cuerpo.banco_receptor_id = Number(banco);
            const { data } = await convertirAdjuntoComprobante(mensajeId, cuerpo);
            const n = data?.comprobantes?.length || elegidas.length;
            toast.success(n === 1 ? 'Comprobante enviado a revisión.' : `${n} comprobantes enviados a revisión.`);
            onHecho?.(data);
            onClose();
        } catch (err) {
            toast.error(mensajeError(err, 'No se pudo convertir el comprobante.'));
            setGuardando(false);
        }
    };

    return (
        <Modal open onClose={guardando ? () => {} : onClose} titulo="Asignar a mensualidad" size="lg" footer={
            <>
                <button type="button" onClick={onClose} disabled={guardando}
                    className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                    style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                    Cancelar
                </button>
                <button type="button" onClick={convertir} disabled={guardando || elegidas.length === 0 || sinRepresentante}
                    className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'var(--pb)', color: '#fff' }}>
                    {guardando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                    Convertir en comprobante
                </button>
            </>
        }>
            <div className="space-y-4">
                {adjunto && mensajeId && (
                    <div className="max-w-full"><AdjuntoMensaje mensajeId={mensajeId} adjunto={adjunto} /></div>
                )}

                {cargando && (
                    <div className="space-y-2 animate-pulse" aria-label="Cargando mensualidades" role="status">
                        {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--ash-light)' }} />)}
                    </div>
                )}
                {datos === 'error' && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--red)' }}>No se pudieron cargar las mensualidades.</p>
                )}
                {sinRepresentante && (
                    <p className="text-sm rounded-xl p-3" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                        La conversación no tiene representante vinculado. Vincúlala primero desde los datos del contacto.
                    </p>
                )}
                {datos && datos !== 'error' && !sinRepresentante && filas.length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>
                        {datos.representante?.nombre} no tiene mensualidades impagas.
                    </p>
                )}
                {filas.length > 0 && (
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium mb-1" style={{ color: 'var(--jet)' }}>
                            Mensualidades que cubre este pago{datos.representante?.nombre ? ` · ${datos.representante.nombre}` : ''}
                        </legend>
                        {filas.map(f => {
                            const bloqueada = !!f.tiene_comprobante_pendiente;
                            return (
                                <label key={f.id} className={`flex items-start gap-3 rounded-xl p-3 min-h-11 ${bloqueada ? 'opacity-60' : 'cursor-pointer'}`}
                                    style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                                    <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" disabled={bloqueada}
                                        checked={elegidas.includes(f.id)} onChange={() => alternar(f.id)} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{f.alumno} · {f.periodo}</span>
                                        <span className="block text-xs" style={{ color: 'var(--ash)' }}>
                                            Saldo {usd(f.saldo_usd)}{bloqueada ? ' · Ya tiene un comprobante en revisión' : ''}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </fieldset>
                )}

                {filas.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            Referencia bancaria (opcional)
                            <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                                className="mt-1 w-full rounded-xl px-3 py-2 min-h-11 font-normal" style={campo} />
                        </label>
                        <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            Método de pago
                            <select value={metodo} onChange={e => setMetodo(e.target.value)}
                                className="mt-1 w-full rounded-xl px-3 py-2 min-h-11 font-normal" style={campo}>
                                {METODOS_PAGO.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                            </select>
                        </label>
                        {bancos.length > 0 && (
                            <label className="block text-sm font-medium sm:col-span-2" style={{ color: 'var(--jet)' }}>
                                Banco receptor (opcional)
                                <select value={banco} onChange={e => setBanco(e.target.value)}
                                    className="mt-1 w-full rounded-xl px-3 py-2 min-h-11 font-normal" style={campo}>
                                    <option value="">Sin indicar</option>
                                    {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                )}
                {elegidas.length > 1 && (
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        Se creará un comprobante por mensualidad con el mismo archivo.
                    </p>
                )}
            </div>
        </Modal>
    );
}

/** `onHecho(data)` recibe `{ mensaje, comprobantes, conversacion }` de la respuesta 201. */
export function ModalConvertirComprobante({ open, ...props }) {
    return open ? <ContenidoConvertir {...props} /> : null;
}

export default ModalConvertirComprobante;
