import { GraduationCap, Phone, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import InitialsAvatar from '../shared/InitialsAvatar';
import { fmt } from '../../utils/format';

const MorososRow = ({ alu, animDelay }) => {
    const navigate = useNavigate();

    const handleCobrar = () =>
        navigate(`/cobranza?cedula=${alu.representante?.cedula ?? ''}`);

    const deuda        = parseFloat(alu.monto_adeudado || 0);
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
                {alu.cedula_escolar ?? '—'}
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

            {/* Acción */}
            <td className="px-4 py-3">
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
            </td>
        </tr>
    );
};

export default MorososRow;
