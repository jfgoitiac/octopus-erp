import { Phone, Handshake, ReceiptText, PhoneOff, Lightbulb, Reply } from 'lucide-react';
import WhatsAppIcon from '../ui/WhatsAppIcon';

const ICONOS = {
    revisar_pago: ReceiptText, renegociar: Handshake, ofrecer_convenio: Handshake,
    verificar_contacto: PhoneOff, llamar: Phone, responder: Reply,
};

/** Botón con la acción sugerida de un caso; `compacto` lo deja solo, `apilado` para columnas angostas. */
export default function AccionSugerida({ accion, onClick, compacto = false, apilado = false }) {
    if (!accion) return null;
    const Icono = ICONOS[accion.codigo];
    const boton = (
        <button type="button" onClick={onClick}
            className={`btn btn-primary w-full ${apilado ? '' : 'sm:w-auto'} ${compacto ? 'btn-sm' : ''}`}>
            {Icono ? <Icono size={16} /> : <WhatsAppIcon size={16} className="[&_path]:fill-white" />}
            {accion.texto}
        </button>
    );
    if (compacto) return boton;
    return (
        <div className={`flex flex-col gap-2 rounded-xl p-3 ${apilado ? '' : 'sm:flex-row sm:items-center sm:justify-between'}`}
            style={{ background: 'var(--pb-light)', border: '1px solid color-mix(in srgb, var(--pb) 25%, transparent)' }}>
            <p className="flex items-center gap-2 text-xs sm:text-sm font-medium" style={{ color: 'var(--pb-mid)' }}>
                <Lightbulb size={16} />Acción sugerida
            </p>
            {boton}
        </div>
    );
}
