import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Search } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { buscarRepresentantesVincular } from '../../../api/cobranza.service';
import { mensajeError } from './conversacionesUtils';

const RETARDO_BUSQUEDA_MS = 350;

/**
 * Asocia a mano una conversación "Sin vincular" a un representante. Busca por nombre o cédula
 * y llama a `onVincular(representanteId)`, que devuelve true si quedó vinculada.
 */
function ContenidoVincular({ onClose, onVincular, conversacion }) {
    const [texto, setTexto] = useState('');
    const [encontrados, setResultados] = useState(null);
    const [buscando, setBuscando] = useState(false);
    const [vinculando, setVinculando] = useState(null);

    useEffect(() => {
        const consulta = texto.trim();
        if (consulta.length < 2) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setBuscando(true);
            buscarRepresentantesVincular(consulta, controller.signal)
                .then(res => setResultados(res.data?.results ?? res.data ?? []))
                .catch(err => {
                    if (err?.code === 'ERR_CANCELED') return;
                    setResultados([]);
                    toast.error(mensajeError(err, 'No se pudo buscar representantes.'));
                })
                .finally(() => setBuscando(false));
        }, RETARDO_BUSQUEDA_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [texto]);

    const resultados = texto.trim().length >= 2 ? encontrados : null;

    const vincular = async (rep) => {
        setVinculando(rep.id);
        const ok = await onVincular(rep.id);
        setVinculando(null);
        if (ok) onClose();
    };

    return (
            <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>
                    El número <strong>{conversacion?.telefono}</strong>
                    {conversacion?.nombre_contacto ? ` (${conversacion.nombre_contacto})` : ''} no coincide con un único
                    representante. Búscalo y asócialo: nunca se adivina.
                </p>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--ash)' }} />
                    <input type="search" value={texto} onChange={e => setTexto(e.target.value)} autoFocus
                        placeholder="Nombre o cédula del representante" aria-label="Buscar representante"
                        className="w-full rounded-xl pl-9 pr-3 py-2 text-sm min-h-11"
                        style={{ border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--jet)' }} />
                </div>
                {buscando && (
                    <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ash)' }}>
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Buscando…
                    </p>
                )}
                {resultados && resultados.length === 0 && !buscando && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>No se encontraron representantes.</p>
                )}
                {resultados && resultados.length > 0 && (
                    <ul className="space-y-2" aria-label="Resultados">
                        {resultados.map(rep => (
                            <li key={rep.id}>
                                <button type="button" onClick={() => vincular(rep)} disabled={vinculando !== null}
                                    className="w-full min-h-11 flex items-center justify-between gap-3 text-left rounded-xl px-3 py-2 disabled:opacity-60"
                                    style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>
                                            {[rep.nombre, rep.apellido].filter(Boolean).join(' ')}
                                        </span>
                                        <span className="block text-xs truncate" style={{ color: 'var(--ash)' }}>
                                            {[rep.cedula, rep.telefono].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    {vinculando === rep.id
                                        ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
                                        : <span className="text-xs font-medium shrink-0" style={{ color: 'var(--pb-mid)' }}>Vincular</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
    );
}

/** Contenedor: el contenido solo se monta con el modal abierto, así la búsqueda se reinicia sola. */
export function ModalVincularRepresentante({ open, onClose, onVincular, conversacion }) {
    return (
        <Modal open={open} onClose={onClose} titulo="Vincular representante" size="md" footer={
            <button type="button" onClick={onClose}
                className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                Cancelar
            </button>
        }>
            <ContenidoVincular onClose={onClose} onVincular={onVincular} conversacion={conversacion} />
        </Modal>
    );
}

export default ModalVincularRepresentante;
