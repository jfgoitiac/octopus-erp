import { usd } from './hoyUtils';

const Kpi = ({ etiqueta, valor, nota }) => (
    <div className="rounded-2xl p-3 sm:p-4 min-w-0" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
        <p className="text-lg sm:text-2xl font-bold truncate" style={{ color: 'var(--jet)' }}>{valor}</p>
        {nota && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ash)' }}>{nota}</p>}
    </div>
);

/** Cuatro KPIs principales del mes. */
export function KpisCobranza({ kpis }) {
    if (!kpis) return null;
    const c = kpis.cartera_mes || {};
    const e = kpis.envios_7_dias || {};
    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi etiqueta="Cobrado del mes" valor={`${c.cobrado_pct ?? 0}%`} nota={`${usd(c.cobrado_usd)} de ${usd(c.facturado_usd)}`} />
            <Kpi etiqueta="Pendiente del mes" valor={usd(c.pendiente_usd)} />
            <Kpi etiqueta="Pagos por conciliar" valor={kpis.pagos_por_conciliar ?? 0} />
            <Kpi etiqueta="Envíos (7 días)" valor={Number(e.enviado) || 0}
                nota={`${Number(e.omitido) || 0} omitidos · ${Number(e.fallido) || 0} fallidos`} />
        </div>
    );
}

export default KpisCobranza;
