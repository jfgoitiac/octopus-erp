import { Card } from '../../ui/Card';
import { haceTiempo } from './hoyUtils';

const ESTADO = {
    enviado: { texto: 'Enviado', color: 'var(--green)' },
    omitido: { texto: 'Omitido', color: 'var(--ash)' },
    fallido: { texto: 'Fallido', color: 'var(--red)' },
    pendiente: { texto: 'Pendiente', color: 'var(--ash)' },
};

/** Últimos envíos automáticos del motor. */
export function ActividadAutomatica({ actividad = [] }) {
    return (
        <Card titulo="Actividad automática" subtitulo="Últimos envíos del sistema">
            {!actividad.length ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--ash)' }}>Todavía no hay envíos automáticos.</p>
            ) : (
                <ul>
                    {actividad.map(a => {
                        const est = ESTADO[a.estado] || { texto: a.estado, color: 'var(--ash)' };
                        return (
                            <li key={a.id}
                                className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                                style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>
                                        {a.representante?.nombre || 'Representante'}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                                        {a.regla}{a.canal ? ` · ${a.canal}` : ''}
                                        {a.motivo_omision ? ` · ${a.motivo_omision.replace(/_/g, ' ')}` : ''}
                                    </p>
                                </div>
                                <p className="text-xs shrink-0" style={{ color: 'var(--ash)' }}>
                                    <span className="font-semibold" style={{ color: est.color }}>{est.texto}</span>
                                    {' · '}{haceTiempo(a.enviado_en || a.creado_en)}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

export default ActividadAutomatica;
