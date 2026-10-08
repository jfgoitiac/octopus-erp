import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Sparkles, Plus, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import {
    getBandejaInteligente, getPagosRevisionInteligente, getConveniosInteligente,
    accionCicloInteligente, crearConvenioInteligente, pagarCuotaConvenio, cancelarConvenioInteligente,
} from '../api/cobranza.service';

const cargarConvenios = (_sedeId, signal) => getConveniosInteligente(signal);
const fecha = (iso) => format(parseISO(iso), "d 'de' MMM yyyy", { locale: es });

const ACCIONES = [
    { value: 'llamada', label: 'Llamada realizada', texto: true },
    { value: 'whatsapp_manual', label: 'WhatsApp manual enviado', texto: true },
    { value: 'nota', label: 'Nota', texto: true },
    { value: 'pausar', label: 'Pausar el seguimiento', motivo: true },
    { value: 'reclamo', label: 'Reclamo del representante (pausa)', texto: true },
    { value: 'cerrar', label: 'Descartar el caso', texto: true, fija: { motivo: 'descartada' } },
];
const ESTADO_CONVENIO = { vigente: 'Vigente', cumplido: 'Cumplido', incumplido: 'Incumplido', cancelado: 'Cancelado' };

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };
const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const Skeleton = () => (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--ash-light)' }} />)}
    </div>
);

const Vacio = ({ children }) => (
    <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>{children}</p>
);

/* ── Modal de acción sobre los ciclos de un representante ── */
function ModalAccion({ fila, onClose, onHecho }) {
    const [accion, setAccion] = useState('llamada');
    const [texto, setTexto] = useState('');
    const [guardando, setGuardando] = useState(false);
    const def = ACCIONES.find(a => a.value === accion);

    const enviar = async () => {
        setGuardando(true);
        try {
            for (const cicloId of fila.ciclos) {
                await accionCicloInteligente(cicloId, {
                    accion,
                    ...(def.motivo ? { motivo: texto } : { texto }),
                    ...(def.fija || {}),
                });
            }
            toast.success('Acción registrada');
            onHecho();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open
            onClose={() => !guardando && onClose()}
            titulo={`Acción · ${fila.representante.nombre}`}
            footer={
                <>
                    <button type="button" className={btn} style={estiloSec} onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={estiloPri}
                        onClick={enviar} disabled={guardando}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Registrar
                    </button>
                </>
            }
        >
            <div className="space-y-3 text-sm">
                <div>
                    <label htmlFor="accion-tipo" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>Acción</label>
                    <select id="accion-tipo" value={accion} onChange={e => setAccion(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg" style={campo}>
                        {ACCIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="accion-texto" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>
                        {def.motivo ? 'Motivo (obligatorio)' : 'Detalle'}
                    </label>
                    <textarea id="accion-texto" rows={3} maxLength={500} value={texto}
                        onChange={e => setTexto(e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                </div>
            </div>
        </Modal>
    );
}

/* ── Modal de convenio de pago ── */
function ModalConvenio({ fila, onClose, onHecho }) {
    const [cuotas, setCuotas] = useState([{ fecha: '', monto: fila.saldo_total_usd }]);
    const [guardando, setGuardando] = useState(false);
    const suma = cuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
    const cambiar = (i, k, v) => setCuotas(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

    const crear = async () => {
        setGuardando(true);
        try {
            await crearConvenioInteligente({
                representante_id: fila.representante.id, ciclo_ids: fila.ciclos, cuotas,
            });
            toast.success('Convenio creado');
            onHecho();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open size="lg"
            onClose={() => !guardando && onClose()}
            titulo={`Convenio · ${fila.representante.nombre}`}
            footer={
                <>
                    <button type="button" className={btn} style={estiloSec} onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={estiloPri}
                        onClick={crear} disabled={guardando || cuotas.some(c => !c.fecha)}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Crear convenio
                    </button>
                </>
            }
        >
            <div className="space-y-3 text-sm">
                <p style={{ color: 'var(--ash)' }}>
                    Saldo a cubrir: <strong>${fila.saldo_total_usd}</strong>. Mientras el convenio esté vigente,
                    se pausa el seguimiento; si una cuota se incumple, el caso vuelve a la bandeja.
                </p>
                {cuotas.map((c, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="date" aria-label={`Fecha cuota ${i + 1}`} value={c.fecha}
                            onChange={e => cambiar(i, 'fecha', e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                        <input type="number" min="0" step="0.01" aria-label={`Monto cuota ${i + 1}`} value={c.monto}
                            onChange={e => cambiar(i, 'monto', e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                        {cuotas.length > 1 && (
                            <button type="button" aria-label={`Quitar cuota ${i + 1}`} className="p-2 self-end sm:self-auto"
                                onClick={() => setCuotas(cs => cs.filter((_, j) => j !== i))}>
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--pb)' }}
                    onClick={() => setCuotas(cs => [...cs, { fecha: '', monto: '' }])}>
                    <Plus size={16} />Agregar cuota
                </button>
                <p style={{ color: Math.abs(suma - parseFloat(fila.saldo_total_usd)) > 0.01 ? 'var(--red)' : 'var(--green)' }}>
                    Suma de cuotas: ${suma.toFixed(2)}
                </p>
            </div>
        </Modal>
    );
}

/* ── Pestañas ── */
function Bandeja() {
    const { data, loading, apagada, recargar } = useCargaInteligente(getBandejaInteligente);
    const [modal, setModal] = useState(null); // { tipo: 'accion' | 'convenio', fila }

    if (loading) return <Skeleton />;
    if (apagada) return <Vacio>Cobranza Inteligente está apagada en esta sede.</Vacio>;
    if (!data?.results.length) return <Vacio>Nada requiere atención hoy.</Vacio>;
    const hecho = () => { setModal(null); recargar(); };

    return (
        <>
            <ul className="space-y-3">
                {data.results.map(f => (
                    <li key={f.representante.id}>
                        <Card>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--jet)' }}>
                                        {f.representante.nombre}
                                    </h3>
                                    <p className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>
                                        {f.ciclos.length} deuda(s) · ${f.saldo_total_usd} · {f.dias_mora_max} días de mora
                                        {f.responsable ? ` · ${f.responsable}` : ''}
                                    </p>
                                    <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Por qué aparece">
                                        {f.razones.map(r => (
                                            <li key={r.texto} className="text-xs rounded-full px-2 py-0.5"
                                                style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                                                {r.texto} (+{r.puntos})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <span className="text-lg font-bold shrink-0" style={{ color: 'var(--red)' }}
                                    title="Puntaje de prioridad">{f.puntaje} pts</span>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row mt-3">
                                <button type="button" className={btn} style={estiloPri}
                                    onClick={() => setModal({ tipo: 'accion', fila: f })}>Registrar acción</button>
                                <button type="button" className={btn} style={estiloSec}
                                    onClick={() => setModal({ tipo: 'convenio', fila: f })}>Crear convenio</button>
                            </div>
                        </Card>
                    </li>
                ))}
            </ul>
            {modal?.tipo === 'accion' && <ModalAccion fila={modal.fila} onClose={() => setModal(null)} onHecho={hecho} />}
            {modal?.tipo === 'convenio' && <ModalConvenio fila={modal.fila} onClose={() => setModal(null)} onHecho={hecho} />}
        </>
    );
}

function PagosRevision() {
    const { data, loading, apagada } = useCargaInteligente(getPagosRevisionInteligente);
    if (loading) return <Skeleton />;
    if (apagada) return <Vacio>Cobranza Inteligente está apagada en esta sede.</Vacio>;
    if (!data?.results.length) return <Vacio>No hay pagos esperando revisión.</Vacio>;
    return (
        <TablaScroll>
            <table className="w-full min-w-[560px] text-sm">
                <thead>
                    <tr className="text-left" style={{ color: 'var(--ash)' }}>
                        <th className="py-2 pr-3">Representante</th><th className="pr-3">Alumno</th>
                        <th className="pr-3">Monto</th><th className="pr-3">Tipo</th><th>Espera</th>
                    </tr>
                </thead>
                <tbody>
                    {data.results.map(p => (
                        <tr key={`${p.tipo}-${p.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="py-2 pr-3">{p.representante.nombre}</td>
                            <td className="pr-3">{p.alumno}</td>
                            <td className="pr-3">${p.monto_usd}</td>
                            <td className="pr-3">{p.tipo === 'pago' ? 'Pago' : 'Comprobante'}</td>
                            <td style={{ color: p.dias_espera > 3 ? 'var(--red)' : undefined }}>{p.dias_espera} días</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </TablaScroll>
    );
}

function Convenios() {
    const { data, loading, apagada, recargar } = useCargaInteligente(cargarConvenios);
    const ejecutar = async (llamada, ok) => {
        try {
            await llamada();
            toast.success(ok);
            recargar();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        }
    };
    if (loading) return <Skeleton />;
    if (apagada) return <Vacio>Cobranza Inteligente está apagada.</Vacio>;
    if (!data?.results.length) return <Vacio>Aún no hay convenios.</Vacio>;
    return (
        <ul className="space-y-3">
            {data.results.map(c => (
                <li key={c.id}>
                    <Card titulo={`Convenio #${c.id} · ${ESTADO_CONVENIO[c.estado]}`}
                        accion={c.estado === 'vigente' && (
                            <button type="button" className={btn} style={estiloSec}
                                onClick={() => ejecutar(() => cancelarConvenioInteligente(c.id), 'Convenio cancelado')}>
                                Cancelar convenio
                            </button>
                        )}>
                        <ul className="space-y-2 text-sm">
                            {c.cuotas.map(q => (
                                <li key={q.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Cuota {q.numero} · {fecha(q.fecha)} · ${q.monto_usd}{q.pagada ? ' · Pagada' : ''}</span>
                                    {!q.pagada && c.estado === 'vigente' && (
                                        <button type="button" className={btn} style={estiloPri}
                                            onClick={() => ejecutar(() => pagarCuotaConvenio(q.id), 'Cuota registrada')}>
                                            Marcar pagada
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>
                </li>
            ))}
        </ul>
    );
}

const PESTANAS = [
    { id: 'bandeja', label: 'Atención hoy', Vista: Bandeja },
    { id: 'pagos', label: 'Pagos en revisión', Vista: PagosRevision },
    { id: 'convenios', label: 'Convenios', Vista: Convenios },
];

const CobranzaInteligenteGestion = () => {
    const [activa, setActiva] = useState('bandeja');
    const { Vista } = PESTANAS.find(p => p.id === activa);
    return (
        <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-20">
            <PageHeader titulo="Gestión de cobranza" descripcion="Casos que requieren atención hoy, con la razón de cada prioridad." />
            <div role="tablist" className="flex gap-2 overflow-x-auto">
                {PESTANAS.map(p => (
                    <button key={p.id} type="button" role="tab" aria-selected={activa === p.id}
                        onClick={() => setActiva(p.id)}
                        className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium min-h-11"
                        style={activa === p.id ? estiloPri : estiloSec}>
                        {p.id === 'bandeja' && <Sparkles size={14} className="inline mr-1" />}{p.label}
                    </button>
                ))}
            </div>
            <Vista />
        </div>
    );
};

export default CobranzaInteligenteGestion;
