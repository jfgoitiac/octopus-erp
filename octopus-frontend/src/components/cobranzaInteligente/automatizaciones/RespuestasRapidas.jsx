import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { SkeletonLista } from '../shared/SkeletonLista';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import {
    getRespuestasRapidas, crearRespuestaRapida, actualizarRespuestaRapida, eliminarRespuestaRapida,
} from '../../../api/cobranza.service';
import { VistaPreviaMensaje } from './VistaPreviaMensaje';

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

function ModalRespuesta({ respuesta, onClose, onGuardada }) {
    const nueva = !respuesta?.id;
    const [titulo, setTitulo] = useState(respuesta?.titulo ?? '');
    const [cuerpo, setCuerpo] = useState(respuesta?.cuerpo ?? '');
    const [activa, setActiva] = useState(respuesta?.activa ?? true);
    const [guardando, setGuardando] = useState(false);

    const guardar = async () => {
        setGuardando(true);
        const datos = { titulo: titulo.trim(), cuerpo: cuerpo.trim(), activa };
        try {
            if (nueva) await crearRespuestaRapida(datos);
            else await actualizarRespuestaRapida(respuesta.id, datos);
            toast.success(nueva ? 'Respuesta creada' : 'Respuesta actualizada');
            onGuardada();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal open size="lg" onClose={() => !guardando && onClose()} titulo={nueva ? 'Nueva respuesta rápida' : 'Editar respuesta rápida'}
            footer={
                <>
                    <button type="button" className={btn} style={estiloSec} onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={{ background: 'var(--pb)', color: '#fff' }}
                        onClick={guardar} disabled={guardando || !titulo.trim() || !cuerpo.trim()}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Guardar
                    </button>
                </>
            }>
            <div className="space-y-3 text-sm">
                <div className="space-y-1">
                    <label htmlFor="rr-titulo" className="text-xs font-semibold" style={{ color: 'var(--ash)' }}>Título</label>
                    <input id="rr-titulo" className="w-full px-3 py-2 rounded-lg" style={campo} value={titulo} onChange={e => setTitulo(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label htmlFor="rr-cuerpo" className="text-xs font-semibold" style={{ color: 'var(--ash)' }}>Mensaje</label>
                    <textarea id="rr-cuerpo" rows={4} className="w-full px-3 py-2 rounded-lg" style={campo} value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
                </div>
                <label className="flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} />Activa
                </label>
                <VistaPreviaMensaje texto={cuerpo} mostrarVariables />
            </div>
        </Modal>
    );
}

/** CRUD de respuestas rápidas con variables ({nombre}, {saldo_usd}, ...). */
export function RespuestasRapidas() {
    const [estado, setEstado] = useState({ cargando: true, items: [] });
    const [editando, setEditando] = useState(null); // objeto, {} (nueva) o null
    const [borrando, setBorrando] = useState(null);
    const [eliminando, setEliminando] = useState(false);

    const cargar = useCallback(() => {
        const c = new AbortController();
        getRespuestasRapidas(c.signal)
            .then(r => setEstado({ cargando: false, items: Array.isArray(r.data) ? r.data : (r.data?.results ?? []) }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setEstado({ cargando: false, items: [] });
                toast.error(mensajeErrorInteligente(err));
            });
        return () => c.abort();
    }, []);

    useEffect(() => cargar(), [cargar]);

    const alGuardar = () => { setEditando(null); setEstado(e => ({ ...e, cargando: true })); cargar(); };

    const eliminar = async () => {
        setEliminando(true);
        try {
            await eliminarRespuestaRapida(borrando.id);
            toast.success('Respuesta eliminada');
            setBorrando(null);
            setEstado(e => ({ ...e, cargando: true }));
            cargar();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setEliminando(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>Textos listos para usar desde el compositor de Conversaciones.</p>
                <button type="button" onClick={() => setEditando({})}
                    className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--pb)', color: '#fff' }}>
                    <Plus size={16} />Nueva respuesta
                </button>
            </div>

            {estado.cargando ? <SkeletonLista filas={3} alto="h-16" /> : (
                estado.items.length === 0
                    ? <p className="text-sm" style={{ color: 'var(--ash)' }}>Aún no hay respuestas rápidas.</p>
                    : (
                        <ul className="space-y-2">
                            {estado.items.map(r => (
                                <li key={r.id} data-testid="respuesta-item" className="rounded-xl p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: r.activa ? 1 : 0.6 }}>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>{r.titulo}{!r.activa && ' · inactiva'}</p>
                                        <p className="text-xs break-words line-clamp-2" style={{ color: 'var(--ash)' }}>{r.cuerpo}</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button type="button" aria-label={`Editar ${r.titulo}`} onClick={() => setEditando(r)}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm" style={estiloSec}>
                                            <Pencil size={14} /><span className="sm:sr-only">Editar</span>
                                        </button>
                                        <button type="button" aria-label={`Eliminar ${r.titulo}`} onClick={() => setBorrando(r)}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm"
                                            style={{ ...estiloSec, color: 'var(--red)' }}>
                                            <Trash2 size={14} /><span className="sm:sr-only">Eliminar</span>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
            )}

            {editando && <ModalRespuesta respuesta={editando} onClose={() => setEditando(null)} onGuardada={alGuardar} />}
            {borrando && (
                <Modal open size="sm" onClose={() => !eliminando && setBorrando(null)} titulo="Eliminar respuesta rápida"
                    footer={
                        <>
                            <button type="button" className={btn} style={estiloSec} onClick={() => setBorrando(null)} disabled={eliminando}>Cancelar</button>
                            <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={{ background: 'var(--red)', color: '#fff' }}
                                onClick={eliminar} disabled={eliminando}>
                                {eliminando && <Loader2 size={16} className="animate-spin" />}Eliminar
                            </button>
                        </>
                    }>
                    <p className="text-sm" style={{ color: 'var(--jet)' }}>¿Eliminar &quot;{borrando.titulo}&quot;? Esta acción no se puede deshacer.</p>
                </Modal>
            )}
        </div>
    );
}

export default RespuestasRapidas;
