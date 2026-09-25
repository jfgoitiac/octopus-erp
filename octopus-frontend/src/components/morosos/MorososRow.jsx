import { useState } from 'react';
import { GraduationCap, Phone, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import InitialsAvatar from '../shared/InitialsAvatar';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import ModalCobroWhatsApp from '../whatsapp/ModalCobroWhatsApp';
import { fmt } from '../../utils/format';
import { mostrarCedula } from '../../utils/cedulaEscolar';

const MorososRow = ({ alu, animDelay, ultimoAviso = null }) => {
    const navigate = useNavigate();
    const [modalWhatsAppAbierto, setModalWhatsAppAbierto] = useState(false);

    const handleCobrar = () =>
        navigate(`/cobranza?cedula=${alu.representante?.cedula ?? ''}`);

    const tieneTelefono = Boolean(alu.representante?.telefono?.trim());

    const deuda        = parseFloat(alu.monto_adeudado || 0);
    const solvencia    = parseFloat(alu.monto_solvencia_adeudado || 0);
    const diasAtraso   = alu.dias_atraso || 0;
    const mesesLabel   = alu.meses_adeudados === 1
        ? '1 mes'
        : `${alu.meses_adeudados} meses`;

    return (
        <tr
            className="anim-fade-up transition-colors hover:bg-[#fef2f2]"
            style={{
                borderBottom: '0.5px solid var(--border)',
                background: 'var(--porcelain)',
                animationDelay: `${animDelay}ms`,
            }}
        >
            {/* Alumno */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <InitialsAvatar nombre={alu.nombre} apellido={alu.apellido} color="#dc2626" />
                    <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                            {alu.nombre} {alu.apellido}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--ash)' }}>
                            {mesesLabel} adeudado{alu.meses_adeudados !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </td>

            {/* Cédula */}
            <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>
                {mostrarCedula(alu.cedula_escolar)}
            </td>

            {/* Grado */}
            <td className="px-4 py-3">
                {alu.grado_seccion ? (
                    <span
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                    >
                        <GraduationCap size={11} />
                        {alu.grado_seccion}
                    </span>
                ) : (
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                )}
            </td>

            {/* Representante */}
            <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                {alu.representante
                    ? `${alu.representante.nombre} ${alu.representante.apellido}`
                    : <span style={{ color: 'var(--ash)' }}>—</span>}
                {alu.representante?.cedula && (
                    <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>
                        {alu.representante.cedula}
                    </p>
                )}
                {ultimoAviso && (
                    <p className="text-[10px]" style={{ color: 'var(--pb-mid)' }}>
                        Último aviso: {formatDistanceToNow(new Date(ultimoAviso), { addSuffix: true, locale: es })}
                    </p>
                )}
            </td>

            {/* Teléfono */}
            <td className="px-4 py-3">
                {alu.representante?.telefono ? (
                    <a
                        href={`tel:${alu.representante.telefono}`}
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: 'var(--pb)' }}
                    >
                        <Phone size={11} />
                        {alu.representante.telefono}
                    </a>
                ) : (
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                )}
            </td>

            {/* Deuda */}
            <td className="px-4 py-3">
                <span className="text-xs font-semibold tabular-nums" style={{ color: '#dc2626' }}>
                    ${fmt(deuda, 2)}
                </span>
            </td>

            {/* Solvencia (renglón aparte: no se suma a la deuda de mensualidad/inscripción) */}
            <td className="px-4 py-3">
                {solvencia > 0 ? (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#be123c' }}>
                        ${fmt(solvencia, 2)}
                    </span>
                ) : (
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                )}
            </td>

            {/* Días de atraso */}
            <td className="px-4 py-3">
                {diasAtraso > 0 ? (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#dc2626' }}>
                        {diasAtraso} día{diasAtraso !== 1 ? 's' : ''}
                    </span>
                ) : (
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                )}
            </td>

            {/* Acción */}
            <td className="px-4 py-3">
                <div className="flex flex-col gap-1.5 sm:flex-row">
                    <button
                        onClick={handleCobrar}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--pb)] hover:text-white"
                        style={{
                            background: 'var(--pb-light)',
                            color: 'var(--pb-mid)',
                            border: '0.5px solid var(--pb)',
                        }}
                        title={`Ir a cobranza de ${alu.nombre} ${alu.apellido}`}
                    >
                        <ExternalLink size={11} />
                        Cobrar
                    </button>
                    <button
                        onClick={() => setModalWhatsAppAbierto(true)}
                        disabled={!tieneTelefono}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            background: '#eafaf0',
                            color: '#166534',
                            border: '0.5px solid #25D366',
                        }}
                        title={tieneTelefono ? 'Enviar cobro por WhatsApp' : 'Sin teléfono registrado'}
                    >
                        <WhatsAppIcon size={12} />
                        WhatsApp
                    </button>
                </div>
            </td>

            {modalWhatsAppAbierto && (
                <ModalCobroWhatsApp
                    open={modalWhatsAppAbierto}
                    onClose={() => setModalWhatsAppAbierto(false)}
                    representante={alu.representante}
                />
            )}
        </tr>
    );
};

export default MorososRow;
