import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModalCobroWhatsApp from '../components/whatsapp/ModalCobroWhatsApp';
import { ModalAccion, ModalConvenio } from '../components/cobranzaInteligente/ModalesGestion';

const POR_WHATSAPP = new Set(['enviar_recordatorio', 'recordar_cuota', 'whatsapp']);
const POR_LLAMADA = new Set(['llamar', 'verificar_contacto', 'renegociar']);

/**
 * Ejecuta sobre un caso de la bandeja (fila con representante, ciclos y saldo)
 * la acción sugerida por el backend o una elegida a mano. Devuelve `ejecutar`
 * y los modales a renderizar; `onHecho` se llama al terminar (para recargar).
 */
export function useAccionesCaso(onHecho) {
    const navigate = useNavigate();
    const [modal, setModal] = useState(null); // { tipo, fila, accion }
    const cerrar = () => setModal(null);
    const hecho = () => { setModal(null); onHecho?.(); };

    const ejecutar = (fila, codigo) => {
        if (codigo === 'revisar_pago') return navigate('/comprobantes/revision');
        if (POR_WHATSAPP.has(codigo)) return setModal({ tipo: 'whatsapp', fila });
        if (codigo === 'ofrecer_convenio' || codigo === 'convenio') return setModal({ tipo: 'convenio', fila });
        return setModal({ tipo: 'accion', fila, accion: POR_LLAMADA.has(codigo) ? 'llamada' : codigo });
    };

    const modales = (
        <>
            {modal?.tipo === 'accion' && (
                <ModalAccion fila={modal.fila} accionInicial={modal.accion || 'llamada'} onClose={cerrar} onHecho={hecho} />
            )}
            {modal?.tipo === 'convenio' && <ModalConvenio fila={modal.fila} onClose={cerrar} onHecho={hecho} />}
            <ModalCobroWhatsApp open={modal?.tipo === 'whatsapp'} onClose={hecho} representante={modal?.fila.representante} />
        </>
    );
    return { ejecutar, modales };
}
