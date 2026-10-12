import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Phone, HandCoins, MessageSquare } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { TablaScroll } from '../../ui/TablaScroll';
import EtapaCobranza from '../../morosos/EtapaCobranza';
import { ModalAccion } from '../shared/ModalAccionCiclo';
import { ModalConvenio } from '../shared/ModalConvenio';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import {
    getConveniosInteligente, pagarCuotaConvenio, cancelarConvenioInteligente,
} from '../../../api/cobranza.service';
import { getExpedienteRepresentante } from './carteraApi';
import { formatearFecha, formatearRelativa, formatearUsd } from './carteraUtils';

const btn = 'w-full sm:w-auto px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };

const ESTADO_CONVENIO = {
    vigente: 'Vigente', cumplido: 'Cumplido', incumplido: 'Incumplido', cancelado: 'Cancelado',
};

const Seccion = ({ titulo, children }) => (
    <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{titulo}</h4>
        {children}
    </section>
);

const Vacio = ({ children }) => <p className="text-sm" style={{ color: 'var(--ash)' }}>{children}</p>;

function SkeletonFicha() {
    return (
        <div className="space-y-3 animate-pulse" role="status" aria-label="Cargando ficha">
            <div className="h-16 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
            <div className="h-24 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
            <div className="h-24 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
        </div>
    );
}

function Convenio({ convenio, ocupado, onPagar, onCancelar }) {
    const [confirmando, setConfirmando] = useState(false);
    const vigente = convenio.estado === 'vigente';
    return (
        <li className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Convenio · {ESTADO_CONVENIO[convenio.estado] || convenio.estado}
                </span>
                {vigente && (confirmando ? (
                    <span className="flex gap-2">
                        <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--red)', color: '#fff' }}
                            disabled={ocupado} onClick={() => onCancelar(convenio.id)}>Sí, cancelar</button>
                        <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={estiloSec}
                            onClick={() => setConfirmando(false)}>No</button>
                    </span>
                ) : (
                    <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={estiloSec}
                        onClick={() => setConfirmando(true)}>Cancelar convenio</button>
                ))}
            </div>
            <ul className="space-y-1">
                {convenio.cuotas.map(q => (
                    <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span style={{ color: 'var(--jet)' }}>
                            Cuota {q.numero} · {formatearFecha(q.fecha)} · {formatearUsd(q.monto_usd)}
                        </span>
                        {q.pagada ? (
                            <span className="text-xs font-medium" style={{ color: 'var(--green)' }}>Pagada</span>
                        ) : vigente && (
                            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                                style={estiloPri} disabled={ocupado}
                                aria-label={`Marcar cuota ${q.numero} como pagada`} onClick={() => onPagar(q.id)}>
                                Marcar pagada
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </li>
    );
}

/**
 * Ficha 360° de un representante: mensualidades, convenios, pagos en revisión e historial.
 * Se abre como Modal (único contenedor permitido). Las acciones reutilizan ModalAccion y ModalConvenio.
 */
export function FichaRepresentante({ fila, pagosRevision = [], onClose, onCambio }) {
    const repId = fila.representante.id;
    const [version, setVersion] = useState(0);
    const [datos, setDatos] = useState({ key: null, expediente: null, convenios: [] });
    const [sub, setSub] = useState(null); // 'accion' | 'convenio'
    const [ocupado, setOcupado] = useState(false);
    const key = `${repId}:${version}`;

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            getExpedienteRepresentante(repId, controller.signal),
            getConveniosInteligente(controller.signal),
        ]).then(([exp, conv]) => setDatos({
            key, expediente: exp.data,
            convenios: (conv.data?.results || []).filter(c => c.representante === repId),
        })).catch(err => {
            if (err?.code === 'ERR_CANCELED') return;
            setDatos(d => ({ ...d, key }));
            toast.error(mensajeErrorInteligente(err));
        });
        return () => controller.abort();
    }, [repId, key]);

    const refrescarTodo = () => {
        setVersion(v => v + 1);
        onCambio?.();
    };

    const ejecutar = async (llamada, mensaje) => {
        setOcupado(true);
        try {
            await llamada();
            toast.success(mensaje);
            refrescarTodo();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setOcupado(false);
        }
    };

    const { expediente, convenios } = datos;
    const loading = datos.key !== key;
    const eventos = expediente?.eventos || [];
    const ciclos = expediente?.ciclos || [];
    const misPagos = pagosRevision.filter(p => p.representante?.id === repId);
    const abiertos = fila.ciclos.length > 0;

    return (
        <>
            <Modal
                open={!sub} size="xl" onClose={onClose}
                titulo={`Ficha · ${fila.representante.nombre}`}
                footer={
                    <>
                        <button type="button" className={btn} style={estiloSec} onClick={onClose}>Cerrar</button>
                        <button type="button" className={btn} style={estiloSec} onClick={() => setSub('accion')} disabled={!abiertos}>
                            <Phone size={16} aria-hidden="true" />Registrar acción
                        </button>
                        <button type="button" className={btn} style={estiloPri} onClick={() => setSub('convenio')} disabled={!abiertos}>
                            <HandCoins size={16} aria-hidden="true" />Crear convenio
                        </button>
                    </>
                }
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Saldo pendiente</p>
                            <p className="text-xl font-bold" style={{ color: fila.dias_mora_max > 0 ? 'var(--red)' : 'var(--jet)' }}>
                                {formatearUsd(fila.saldo_total_usd)}
                            </p>
                        </div>
                        <div className="rounded-2xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                            <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>Etapa</p>
                            <EtapaCobranza etapa={fila.etapa} />
                        </div>
                        <div className="rounded-2xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Cédula</p>
                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{fila.representante.cedula || '—'}</p>
                            {fila.dias_mora_max > 0 && (
                                <p className="text-xs" style={{ color: 'var(--ash)' }}>{fila.dias_mora_max} días de mora máxima</p>
                            )}
                        </div>
                    </div>

                    {loading ? <SkeletonFicha /> : (
                        <>
                            <Seccion titulo="Mensualidades">
                                {ciclos.length === 0 ? <Vacio>Sin mensualidades registradas.</Vacio> : (
                                    <TablaScroll>
                                        <table className="w-full min-w-[34rem] text-sm">
                                            <thead style={{ color: 'var(--ash)' }}>
                                                <tr>
                                                    <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Alumno</th>
                                                    <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Período</th>
                                                    <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Vence</th>
                                                    <th scope="col" className="text-right text-xs font-medium py-1 pr-3">Saldo</th>
                                                    <th scope="col" className="text-left text-xs font-medium py-1">Etapa</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ciclos.map(c => (
                                                    <tr key={c.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                                                        <td className="py-1.5 pr-3">{c.alumno?.nombre}</td>
                                                        <td className="py-1.5 pr-3">{c.periodo?.mes}/{c.periodo?.anio}</td>
                                                        <td className="py-1.5 pr-3">{formatearFecha(c.fecha_vencimiento)}</td>
                                                        <td className="py-1.5 pr-3 text-right">{formatearUsd(c.saldo_usd)}</td>
                                                        <td className="py-1.5"><EtapaCobranza etapa={c.estado} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </TablaScroll>
                                )}
                            </Seccion>

                            <Seccion titulo="Convenios">
                                {convenios.length === 0 ? <Vacio>Sin convenios.</Vacio> : (
                                    <ul className="space-y-2">
                                        {convenios.map(c => (
                                            <Convenio key={c.id} convenio={c} ocupado={ocupado}
                                                onPagar={(id) => ejecutar(() => pagarCuotaConvenio(id), 'Cuota marcada como pagada')}
                                                onCancelar={(id) => ejecutar(() => cancelarConvenioInteligente(id), 'Convenio cancelado')} />
                                        ))}
                                    </ul>
                                )}
                            </Seccion>

                            <Seccion titulo="Pagos en revisión">
                                {misPagos.length === 0 ? <Vacio>No hay pagos en revisión.</Vacio> : (
                                    <ul className="space-y-1">
                                        {misPagos.map(p => (
                                            <li key={`${p.tipo}-${p.id}`} className="flex flex-wrap justify-between gap-2 text-sm">
                                                <span style={{ color: 'var(--jet)' }}>
                                                    {p.tipo === 'comprobante' ? 'Comprobante' : 'Pago'} · {p.alumno} · {formatearUsd(p.monto_usd)}
                                                </span>
                                                <span style={{ color: 'var(--ash)' }}>
                                                    {p.dias_espera === 1 ? '1 día' : `${p.dias_espera} días`} en espera
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Seccion>

                            <Seccion titulo="Historial">
                                {eventos.length === 0 ? <Vacio>Sin eventos todavía.</Vacio> : (
                                    <ul className="space-y-1.5">
                                        {eventos.map(e => (
                                            <li key={e.id} className="flex gap-2 text-sm">
                                                <MessageSquare size={14} aria-hidden="true" className="mt-1 shrink-0" style={{ color: 'var(--ash)' }} />
                                                <span className="min-w-0">
                                                    <span style={{ color: 'var(--jet)' }}>{String(e.tipo).replace(/_/g, ' ')}</span>
                                                    <span className="block text-xs" style={{ color: 'var(--ash)' }}>
                                                        {formatearRelativa(e.creado_en)}{e.usuario ? ` · ${e.usuario}` : ''}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Seccion>
                        </>
                    )}
                    {ocupado && <Loader2 size={16} className="animate-spin" aria-label="Procesando" />}
                </div>
            </Modal>

            {sub === 'accion' && (
                <ModalAccion fila={fila} onClose={() => setSub(null)}
                    onHecho={() => { setSub(null); refrescarTodo(); }} />
            )}
            {sub === 'convenio' && (
                <ModalConvenio fila={fila} onClose={() => setSub(null)}
                    onHecho={() => { setSub(null); refrescarTodo(); }} />
            )}
        </>
    );
}

export default FichaRepresentante;
