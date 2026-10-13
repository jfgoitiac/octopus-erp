import { useState } from 'react';
import { toast } from 'react-toastify';
import { ModalAccion } from '../shared/ModalAccionCiclo';
import { ModalConvenio } from '../shared/ModalConvenio';
import { ModalConvertirComprobante } from '../conversaciones/ModalConvertirComprobante';
import { ModalDescartarComprobante } from '../conversaciones/ModalDescartarComprobante';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { marcarTarjetaHecha } from '../../../api/cobranza.service';
import { TarjetaAccion } from './TarjetaAccion';

/** Adapta una tarjeta (y la acción pulsada) a la "fila" que esperan los modales compartidos. */
const filaDe = (tarjeta, accion) => ({
    representante: tarjeta.representante,
    ciclos: accion?.ciclo ? [accion.ciclo] : (tarjeta.ciclos || []),
    saldo_total_usd: tarjeta.detalle?.saldo_total_usd ?? tarjeta.detalle?.monto_usd ?? '0.00',
});

/** Lista priorizada de tarjetas de acción, con los modales de registrar acción y convenio. */
export function ListaTarjetas({ tarjetas = [], onCambio }) {
    const [modal, setModal] = useState(null); // { tipo: 'accion' | 'convenio', fila, accionInicial }
    const [marcando, setMarcando] = useState(null);

    const abrirModal = (tarjeta, accion) => {
        if (accion.accion === 'convertir_comprobante' || accion.accion === 'descartar_comprobante') {
            setModal({
                tipo: accion.accion === 'convertir_comprobante' ? 'convertir' : 'descartar',
                mensajeId: accion.mensaje ?? tarjeta.detalle?.mensaje,
                conversacionId: accion.conversacion ?? tarjeta.detalle?.conversacion,
            });
            return;
        }
        setModal({
            tipo: accion.accion === 'convenio' ? 'convenio' : 'accion',
            fila: filaDe(tarjeta, accion),
            accionInicial: accion.accion,
        });
    };

    const marcarHecha = async (tarjeta) => {
        setMarcando(tarjeta.clave);
        try {
            await marcarTarjetaHecha(tarjeta.clave, {});
            toast.success('Tarjeta marcada como hecha');
            onCambio();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setMarcando(null);
        }
    };

    const hecho = () => { setModal(null); onCambio(); };

    if (!tarjetas.length) {
        return (
            <p className="text-sm text-center py-8 rounded-2xl" style={{ color: 'var(--ash)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                Nada requiere acción por ahora.
            </p>
        );
    }

    return (
        <>
            <ul className="space-y-3">
                {tarjetas.map(t => (
                    <li key={t.clave}>
                        <TarjetaAccion tarjeta={t} onAbrirModal={abrirModal} onHecha={marcarHecha} marcando={marcando === t.clave} />
                    </li>
                ))}
            </ul>
            {modal?.tipo === 'accion' && (
                <ModalAccion fila={modal.fila} accionInicial={modal.accionInicial}
                    onClose={() => setModal(null)} onHecho={hecho} />
            )}
            <ModalConvertirComprobante open={modal?.tipo === 'convertir'} onClose={() => setModal(null)}
                mensajeId={modal?.mensajeId} conversacionId={modal?.conversacionId} onHecho={hecho} />
            <ModalDescartarComprobante open={modal?.tipo === 'descartar'} onClose={() => setModal(null)}
                mensajeId={modal?.mensajeId} onHecho={hecho} />
            {modal?.tipo === 'convenio' && <ModalConvenio fila={modal.fila} onClose={() => setModal(null)} onHecho={hecho} />}
        </>
    );
}

export default ListaTarjetas;
