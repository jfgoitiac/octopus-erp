import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { iniciarConversacionInteligente } from '../../../api/cobranza.service';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { ETIQUETA_TIPO, haceTiempo } from './hoyUtils';

const btn = 'w-full sm:w-auto px-3 py-2 rounded-xl text-sm font-medium min-h-11 disabled:opacity-50 flex items-center justify-center gap-2';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };

// Acciones que abren una pantalla existente en vez de un modal.
const ENLACES = {
    conciliar: '/conciliador',
    ver_envio: '/cobranza/historial-whatsapp',
    editar_representante: '/representantes',
};
// Acciones que se resuelven con ModalAccion (registrar llamada, pausar...).
const ACCIONES_MODAL = ['llamada', 'pausar', 'nota', 'reanudar', 'reclamo', 'cerrar'];

const RUTA_CHAT = '/cobranza/inteligente/conversaciones';

/** Abre el chat: navega a la conversación existente o la inicia primero si aún no existe. */
function BotonChat({ tarjeta, accion, estilo }) {
    const navigate = useNavigate();
    const [cargando, setCargando] = useState(false);
    const abrir = async () => {
        if (accion.conversacion) { navigate(`${RUTA_CHAT}/${accion.conversacion}`); return; }
        if (!tarjeta.representante?.id) { toast.error('Este contacto no está vinculado a un representante'); return; }
        setCargando(true);
        try {
            const { data } = await iniciarConversacionInteligente(tarjeta.representante.id);
            const id = data?.id ?? data?.conversacion?.id;
            if (!id) throw new Error('Respuesta sin conversación');
            navigate(`${RUTA_CHAT}/${id}`);
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
            setCargando(false);
        }
    };
    return (
        <button type="button" className={btn} style={estilo} onClick={abrir} disabled={cargando}>
            {cargando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {accion.etiqueta}
        </button>
    );
}

/** Tarjeta de acción: por qué aparece, botones con la acción sugerida y "marcar hecha". */
export function TarjetaAccion({ tarjeta, onAbrirModal, onHecha, marcando }) {
    const rep = tarjeta.representante;
    const ago = haceTiempo(tarjeta.desde);
    return (
        <article className="rounded-2xl p-3 sm:p-5 space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${tarjeta.urgente ? 'var(--red)' : 'var(--yellow)'}` }}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tarjeta.urgente ? 'var(--red)' : 'var(--ash)' }}>
                        {ETIQUETA_TIPO[tarjeta.tipo] || tarjeta.tipo}{tarjeta.urgente ? ' · Urgente' : ''}
                    </p>
                    <h3 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>{tarjeta.titulo}</h3>
                    {rep?.telefono && <p className="text-xs" style={{ color: 'var(--ash)' }}>{rep.telefono}</p>}
                </div>
                {ago && <p className="text-xs shrink-0" style={{ color: 'var(--ash)' }}>{ago}</p>}
            </div>

            {tarjeta.por_que?.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Por qué aparece">
                    {tarjeta.por_que.map(r => (
                        <li key={r.texto} className="text-xs rounded-full px-2.5 py-1"
                            style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                            {r.texto}{r.puntos ? ` (+${r.puntos})` : ''}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {(tarjeta.acciones || []).map((a, i) => {
                    const estilo = i === 0 ? estiloPri : estiloSec;
                    if (a.accion === 'abrir_chat' && a.disponible) {
                        return <BotonChat key={a.accion} tarjeta={tarjeta} accion={a} estilo={estilo} />;
                    }
                    if (!a.disponible) {
                        return (
                            <button key={a.accion} type="button" disabled className={btn} style={estiloSec}
                                title="Disponible con Conversaciones">
                                {a.etiqueta}
                            </button>
                        );
                    }
                    if (ACCIONES_MODAL.includes(a.accion)) {
                        return (
                            <button key={a.accion} type="button" className={btn} style={estilo}
                                onClick={() => onAbrirModal(tarjeta, a)}>
                                {a.etiqueta}
                            </button>
                        );
                    }
                    return (
                        <Link key={a.accion} to={ENLACES[a.accion] || '/cobranza/inteligente'} className={btn} style={estilo}>
                            {a.etiqueta}
                        </Link>
                    );
                })}
                <button type="button" className={`${btn} sm:ml-auto`} style={{ color: 'var(--ash)' }}
                    onClick={() => onHecha(tarjeta)} disabled={marcando}>
                    {marcando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                    Marcar hecha
                </button>
            </div>
        </article>
    );
}

export default TarjetaAccion;
