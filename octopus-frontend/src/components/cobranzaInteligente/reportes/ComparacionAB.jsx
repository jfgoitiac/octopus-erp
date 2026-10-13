import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Card } from '../../ui/Card';
import DatePickerES from '../../DatePickerES';
import { SkeletonLista } from '../shared/SkeletonLista';
import { useSede } from '../../../context/useSede';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { getReporteAB } from '../../../api/cobranza.service';
import { etiquetaDia } from '../automatizaciones/automatizacionesUtils';
import { usd, pct, lecturaAB } from './reportesUtils';

const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const Variante = ({ nombre, v }) => (
    <div className="rounded-xl p-3 space-y-1 min-w-0" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} data-testid={`variante-${nombre}`}>
        <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Variante {nombre}</p>
        <p className="text-xs break-all" style={{ color: 'var(--ash)' }}>{v?.plantilla || 'Sin plantilla'}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm pt-1">
            <dt style={{ color: 'var(--ash)' }}>Enviados</dt><dd className="text-right">{v?.enviados ?? 0}</dd>
            <dt style={{ color: 'var(--ash)' }}>Medidos</dt><dd className="text-right">{v?.medidos ?? 0}</dd>
            <dt style={{ color: 'var(--ash)' }}>Por medir</dt><dd className="text-right">{v?.por_medir ?? 0}</dd>
            <dt style={{ color: 'var(--ash)' }}>Pagaron</dt><dd className="text-right">{v?.pagaron ?? 0}</dd>
            <dt style={{ color: 'var(--ash)' }}>Tasa de pago</dt><dd className="text-right">{pct(v?.tasa_pago_pct)}</dd>
            <dt style={{ color: 'var(--ash)' }}>Recuperado</dt><dd className="text-right">{usd(v?.recuperado_usd)} ({pct(v?.recuperado_pct)})</dd>
        </dl>
    </div>
);

/** Reporte A/B de plantillas de Meta: recuperado a 7 días por variante. Lectura orientativa. */
export function ComparacionAB() {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [estado, setEstado] = useState({ key: null, data: null });
    const key = `${sedeId}:${desde}:${hasta}`;

    useEffect(() => {
        const c = new AbortController();
        const params = { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) };
        getReporteAB(params, sedeId, c.signal)
            .then(r => setEstado({ key, data: r.data }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setEstado({ key, data: null });
                if (err?.response?.status !== 409) toast.error(mensajeErrorInteligente(err));
            });
        return () => c.abort();
    }, [desde, hasta, sedeId, key]);

    const loading = estado.key !== key;
    const d = loading ? null : estado.data;
    const filas = d?.results ?? [];

    return (
        <Card titulo="Comparación A/B de plantillas"
            subtitulo="Cuánto del saldo se pagó en los 7 días siguientes a cada envío. Es una lectura orientativa, sin prueba estadística.">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 mb-3">
                <label className="text-xs w-full sm:w-44" style={{ color: 'var(--ash)' }}>Desde
                    <DatePickerES clearable value={desde} onChange={e => setDesde(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg" style={campo} />
                </label>
                <label className="text-xs w-full sm:w-44" style={{ color: 'var(--ash)' }}>Hasta
                    <DatePickerES clearable value={hasta} onChange={e => setHasta(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg" style={campo} />
                </label>
            </div>

            {loading && <SkeletonLista filas={2} alto="h-32" />}
            {!loading && !d && <p className="text-sm" style={{ color: 'var(--ash)' }}>No se pudo cargar la comparación.</p>}
            {d && filas.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    Ninguna regla tiene comparación A/B. Define una plantilla de Meta B en Automatizaciones para empezar.
                </p>
            )}
            {d && filas.length > 0 && (
                <ul className="space-y-4">
                    {filas.map(f => {
                        const lectura = lecturaAB(f);
                        return (
                            <li key={f.regla.id} className="space-y-2" data-testid="fila-ab">
                                <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>
                                    {f.regla.nombre} <span className="font-normal text-xs" style={{ color: 'var(--ash)' }}>· {etiquetaDia(f.regla.dia_relativo)}{f.regla.ab_activo ? '' : ' · A/B apagada'}</span>
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <Variante nombre="A" v={f.A} />
                                    <Variante nombre="B" v={f.B} />
                                </div>
                                <p className="text-xs rounded-lg p-2" role="note" data-testid="lectura-ab"
                                    style={{ background: lectura.tono === 'ok' ? 'var(--yellow-light)' : 'var(--ash-light)', color: 'var(--jet)' }}>
                                    {lectura.texto}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
            {d?.regla && <p className="text-xs mt-3" style={{ color: 'var(--ash)' }}>{d.regla}</p>}
        </Card>
    );
}

export default ComparacionAB;
