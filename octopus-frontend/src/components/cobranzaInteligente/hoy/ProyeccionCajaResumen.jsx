import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { usd } from './hoyUtils';
import { rangoSemana } from '../reportes/reportesUtils';
import { rutaPestana } from '../pestanas';

/** Resumen compacto de la proyección de caja de la semana; el detalle está en Reportes. */
export function ProyeccionCajaResumen({ proyeccion }) {
    if (!proyeccion) return null;
    const { promesas, convenios } = proyeccion.por_fuente || {};
    return (
        <div className="flex items-start gap-3 rounded-2xl p-3 sm:p-5" data-testid="proyeccion-resumen"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="shrink-0 rounded-xl p-2" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                <Wallet size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Caja proyectada · {rangoSemana(proyeccion.semana)}</p>
                <p className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
                    {usd(proyeccion.esperado_usd)} esperados de {usd(proyeccion.comprometido_usd)} comprometidos
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    {proyeccion.casos} {proyeccion.casos === 1 ? 'caso' : 'casos'} · {promesas?.casos ?? 0} de promesas · {convenios?.casos ?? 0} de convenios ·{' '}
                    <Link to={rutaPestana('reportes')} className="underline">Ver detalle</Link>
                </p>
            </div>
        </div>
    );
}

export default ProyeccionCajaResumen;
