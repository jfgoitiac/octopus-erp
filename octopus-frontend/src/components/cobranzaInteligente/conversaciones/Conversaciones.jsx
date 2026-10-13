import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { AuthContext } from '../../../context/AuthContext';
import { Modal } from '../../ui/Modal';
import { useConversaciones } from '../../../hooks/useConversaciones';
import { useHiloConversacion } from '../../../hooks/useHiloConversacion';
import { nombreUsuario } from '../../../utils/nombreUsuario';
import { ModuloApagado } from '../shared/ModuloApagado';
import { BandejaConversaciones } from './BandejaConversaciones';
import { ConversacionesSkeleton } from './ConversacionesSkeleton';
import { FichaConversacion } from './FichaConversacion';
import { HiloMensajes } from './HiloMensajes';
import { ModalEnviarPlantilla } from './ModalEnviarPlantilla';
import { ModalConvertirComprobante } from './ModalConvertirComprobante';
import { ModalDescartarComprobante } from './ModalDescartarComprobante';
import { ModalVincularRepresentante } from './ModalVincularRepresentante';
import { RUTA_CONVERSACIONES, segundosRestantes } from './conversacionesUtils';

const RETARDO_BUSQUEDA_MS = 350;

/** Texto de búsqueda con retardo para no consultar en cada tecla. */
function useBusquedaConRetardo() {
    const [busqueda, setBusqueda] = useState('');
    const [q, setQ] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setQ(busqueda.trim()), RETARDO_BUSQUEDA_MS);
        return () => clearTimeout(t);
    }, [busqueda]);
    return { busqueda, setBusqueda, q };
}

/**
 * Pestaña "Conversaciones": bandeja + hilo (+ ficha del contacto en xl).
 * Móvil (< lg): lista → hilo con botón atrás. lg: 2 columnas. xl: 3 columnas.
 * La ruta es `conversaciones/:conversacionId?`.
 */
const Conversaciones = () => {
    const { conversacionId } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext) || {};
    const activaId = conversacionId ? Number(conversacionId) : null;

    const [filtro, setFiltro] = useState('todas');
    const { busqueda, setBusqueda, q } = useBusquedaConRetardo();
    const bandeja = useConversaciones({ filtro, q });

    const usuario = useMemo(() => (user ? { id: user.id, nombre: nombreUsuario(user) } : null), [user]);
    const hilo = useHiloConversacion(Number.isFinite(activaId) ? activaId : null, {
        onConversacion: bandeja.actualizarLocal, usuario,
    });

    const [modal, setModal] = useState(null); // 'plantilla' | 'vincular' | 'ficha'
    const cerrarModal = useCallback(() => setModal(null), []);
    const [adjuntoModal, setAdjuntoModal] = useState(null); // { tipo: 'convertir' | 'descartar', mensaje }
    const cerrarAdjunto = useCallback(() => setAdjuntoModal(null), []);
    const seleccionar = useCallback((id) => navigate(`${RUTA_CONVERSACIONES}/${id}`), [navigate]);
    const volver = useCallback(() => navigate(RUTA_CONVERSACIONES), [navigate]);

    if (bandeja.apagada) return <ModuloApagado />;
    if (bandeja.loading && !activaId) return <ConversacionesSkeleton />;

    const conv = hilo.conversacion;
    const fueraDeVentana = !!conv && segundosRestantes(conv) <= 0;

    return (
        <section aria-label="Conversaciones"
            className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_18rem] h-[calc(100dvh-16rem)] min-h-[32rem] rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className={`${activaId ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 min-w-0`} style={{ borderRight: '1px solid var(--border)' }}>
                <BandejaConversaciones conversaciones={bandeja.conversaciones} loading={bandeja.loading}
                    filtro={filtro} onFiltro={setFiltro} busqueda={busqueda} onBusqueda={setBusqueda}
                    activaId={activaId} onSeleccionar={seleccionar} />
            </div>

            <div className={`${activaId ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 min-w-0`}>
                {activaId ? (
                    <HiloMensajes hilo={hilo} onVolver={volver} onAbrirFicha={() => setModal('ficha')} onAbrirPlantilla={() => setModal('plantilla')}
                        onConvertir={(mensaje) => setAdjuntoModal({ tipo: 'convertir', mensaje })}
                        onDescartar={(mensaje) => setAdjuntoModal({ tipo: 'descartar', mensaje })} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center" style={{ color: 'var(--ash)' }}>
                        <MessagesSquare size={32} aria-hidden="true" />
                        <p className="text-sm">Selecciona una conversación para ver el hilo.</p>
                    </div>
                )}
            </div>

            <aside aria-label="Datos del contacto" className="hidden xl:block min-h-0 overflow-y-auto" style={{ borderLeft: '1px solid var(--border)' }}>
                {conv && <FichaConversacion conversacion={conv} onVincular={() => setModal('vincular')} />}
            </aside>

            <Modal open={modal === 'ficha'} onClose={cerrarModal} titulo="Datos del contacto" size="sm">
                <FichaConversacion conversacion={conv} onVincular={() => setModal('vincular')} />
            </Modal>
            <ModalEnviarPlantilla open={modal === 'plantilla'} onClose={cerrarModal} onEnviar={hilo.enviarPlantilla} fueraDeVentana={fueraDeVentana} />
            <ModalVincularRepresentante open={modal === 'vincular'} onClose={cerrarModal} onVincular={hilo.vincular} conversacion={conv} />
            <ModalConvertirComprobante open={adjuntoModal?.tipo === 'convertir'} onClose={cerrarAdjunto}
                mensajeId={adjuntoModal?.mensaje?.id} conversacionId={activaId} adjunto={adjuntoModal?.mensaje?.adjunto}
                onHecho={hilo.aplicarResolucion} />
            <ModalDescartarComprobante open={adjuntoModal?.tipo === 'descartar'} onClose={cerrarAdjunto}
                mensajeId={adjuntoModal?.mensaje?.id} onHecho={hilo.aplicarResolucion} />
        </section>
    );
};

export default Conversaciones;
