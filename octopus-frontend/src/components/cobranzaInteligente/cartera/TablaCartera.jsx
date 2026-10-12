import { useEsEscritorio } from './useEsEscritorio';
import { TablaScroll } from '../../ui/TablaScroll';
import EtapaCobranza from '../../morosos/EtapaCobranza';
import { formatearFecha, formatearRelativa, formatearUsd } from './carteraUtils';

const textoProxima = (f) => {
    if (!f.proxima_accion && !f.proxima_accion_fecha) return '—';
    return [f.proxima_accion, f.proxima_accion_fecha ? formatearFecha(f.proxima_accion_fecha) : null].filter(Boolean).join(' · ');
};

const Insignia = ({ valor, singular, plural, color }) => (
    valor > 0
        ? <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'var(--ash-light)', color }}>{valor} {valor === 1 ? singular : plural}</span>
        : <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
);

const Convenios = ({ f }) => <Insignia valor={f.convenios_vigentes} singular="vigente" plural="vigentes" color="var(--pb-mid)" />;
const Revision = ({ f }) => <Insignia valor={f.pagos_revision} singular="en revisión" plural="en revisión" color="var(--yellow)" />;

function TarjetaFila({ fila, onAbrir }) {
    return (
        <li>
            <button type="button" onClick={() => onAbrir(fila)} aria-label={`Abrir ficha de ${fila.representante.nombre}`}
                className="w-full text-left rounded-2xl p-3 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>{fila.representante.nombre}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>{fila.representante.cedula}</p>
                    </div>
                    <EtapaCobranza etapa={fila.etapa} />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold" style={{ color: fila.dias_mora_max > 0 ? 'var(--red)' : 'var(--jet)' }}>
                        {formatearUsd(fila.saldo_total_usd)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                        {fila.dias_mora_max > 0 ? `${fila.dias_mora_max} días de mora` : 'Al día'}
                    </span>
                </div>
                <dl className="grid grid-cols-1 gap-1 text-xs" style={{ color: 'var(--ash)' }}>
                    <div className="flex justify-between gap-2"><dt>Último contacto</dt><dd>{formatearRelativa(fila.ultimo_contacto)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Próxima acción</dt><dd className="text-right">{textoProxima(fila)}</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2">
                    {fila.convenios_vigentes > 0 && <Convenios f={fila} />}
                    {fila.pagos_revision > 0 && <Revision f={fila} />}
                </div>
            </button>
        </li>
    );
}

const TH = 'text-left text-xs font-medium px-3 py-2 whitespace-nowrap';
const TD = 'px-3 py-2.5 text-sm align-middle';

/** Tabla en md+ y lista de tarjetas en móvil (estándar responsive del proyecto). */
export function TablaCartera({ filas, onAbrir }) {
    const escritorio = useEsEscritorio();

    if (filas.length === 0) {
        return (
            <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
                No hay representantes que coincidan con los filtros.
            </p>
        );
    }

    if (!escritorio) {
        return (
            <ul className="space-y-3" aria-label="Cartera de representantes">
                {filas.map(f => <TarjetaFila key={f.representante.id} fila={f} onAbrir={onAbrir} />)}
            </ul>
        );
    }

    return (
        <TablaScroll>
            <table className="w-full min-w-[56rem] text-sm" aria-label="Cartera de representantes">
                <thead style={{ color: 'var(--ash)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                        <th scope="col" className={TH}>Representante</th>
                        <th scope="col" className={TH}>Etapa</th>
                        <th scope="col" className={`${TH} text-right`}>Saldo</th>
                        <th scope="col" className={TH}>Último contacto</th>
                        <th scope="col" className={TH}>Próxima acción</th>
                        <th scope="col" className={TH}>Convenios</th>
                        <th scope="col" className={TH}>Pagos en revisión</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map(f => (
                        <tr key={f.representante.id} className="cursor-pointer hover:bg-black/[0.03]"
                            style={{ borderBottom: '0.5px solid var(--border)' }} onClick={() => onAbrir(f)}>
                            <td className={TD}>
                                <button type="button" className="text-left font-semibold" style={{ color: 'var(--jet)' }}
                                    onClick={e => { e.stopPropagation(); onAbrir(f); }}
                                    aria-label={`Abrir ficha de ${f.representante.nombre}`}>
                                    {f.representante.nombre}
                                </button>
                                <div className="text-xs" style={{ color: 'var(--ash)' }}>{f.representante.cedula}</div>
                            </td>
                            <td className={TD}><EtapaCobranza etapa={f.etapa} /></td>
                            <td className={`${TD} text-right font-semibold`} style={{ color: f.dias_mora_max > 0 ? 'var(--red)' : 'var(--jet)' }}>
                                {formatearUsd(f.saldo_total_usd)}
                                {f.dias_mora_max > 0 && <div className="text-xs font-normal" style={{ color: 'var(--ash)' }}>{f.dias_mora_max} días de mora</div>}
                            </td>
                            <td className={TD} style={{ color: 'var(--ash)' }}>{formatearRelativa(f.ultimo_contacto)}</td>
                            <td className={TD}>{textoProxima(f)}</td>
                            <td className={TD}><Convenios f={f} /></td>
                            <td className={TD}><Revision f={f} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </TablaScroll>
    );
}

export default TablaCartera;
