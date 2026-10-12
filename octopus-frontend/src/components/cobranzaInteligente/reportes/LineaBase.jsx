import { useState } from 'react';
import { toast } from 'react-toastify';
import { Card } from '../../ui/Card';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { guardarLineaBaseInteligente } from '../../../api/cobranza.service';

export function LineaBase({ sedeId, onGuardada }) {
    const [valores, setValores] = useState({ cobrado_al_vencimiento_pct: '', mora_7_pct: '', mora_15_pct: '', mora_30_pct: '' });
    const [guardando, setGuardando] = useState(false);
    const guardar = async () => {
        setGuardando(true);
        try {
            await guardarLineaBaseInteligente(sedeId, valores);
            toast.success('Línea base guardada');
            onGuardada();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };
    return (
        <Card titulo="Línea base" subtitulo="Mide los últimos 3 meses antes de encender el módulo y cárgala una vez para comparar.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {[['cobrado_al_vencimiento_pct', '% cobrado al vencimiento'], ['mora_7_pct', '% en mora a 7 días'],
                    ['mora_15_pct', '% en mora a 15 días'], ['mora_30_pct', '% en mora a 30 días']].map(([k, label]) => (
                    <label key={k} className="text-xs" style={{ color: 'var(--ash)' }}>
                        {label}
                        <input type="number" min="0" max="100" step="0.01" value={valores[k]}
                            onChange={e => setValores(v => ({ ...v, [k]: e.target.value }))}
                            className="mt-1 w-full px-3 py-2 rounded-lg"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                    </label>
                ))}
            </div>
            <button type="button" onClick={guardar} disabled={guardando || valores.cobrado_al_vencimiento_pct === ''}
                className="w-full sm:w-auto mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                Guardar línea base
            </button>
        </Card>
    );
}

export default LineaBase;
