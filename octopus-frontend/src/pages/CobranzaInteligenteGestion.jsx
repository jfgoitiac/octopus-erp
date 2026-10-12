import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Sparkles } from 'lucide-react';
import { ModalAccion } from '../components/cobranzaInteligente/shared/ModalAccionCiclo';
import { ModalConvenio } from '../components/cobranzaInteligente/shared/ModalConvenio';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import {
    getBandejaInteligente, getPagosRevisionInteligente, getConveniosInteligente,
    pagarCuotaConvenio, cancelarConvenioInteligente,
} from '../api/cobranza.service';

const cargarConvenios = (_sedeId, signal) => getConveniosInteligente(signal);
const fecha = (iso) => format(parseISO(iso), "d 'de' MMM yyyy", { locale: es });

const ESTADO_CONVENIO = { vigente: 'Vigente', cumplido: 'Cumplido', incumplido: 'Incumplido', cancelado: 'Cancelado' };

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };

const Skeleton = () => (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--ash-light)' }} />)}
    </div>
);

const Vacio = ({ children }) => (
    <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>{children}</p>
);

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
