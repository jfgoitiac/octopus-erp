import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { actualizarConfiguracionCobrosConstancias, getConfiguracionCobrosConstancias } from '../../services/constancias';

const TIPOS = [['estudio', 'Constancia de estudio'], ['conducta', 'Constancia de buena conducta'], ['retiro', 'Constancia de retiro']];

export default function CobrosConstancias() {
  const [tarifas, setTarifas] = useState({ estudio: '0.00', conducta: '0.00', retiro: '0.00' });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { getConfiguracionCobrosConstancias().then((r) => setTarifas(r.data.tarifas_usd)).catch(() => toast.error('No se pudieron cargar las tarifas.')); }, []);
  const guardar = async () => {
    setGuardando(true);
    try { const r = await actualizarConfiguracionCobrosConstancias(tarifas); setTarifas(r.data.tarifas_usd); toast.success('Tarifas actualizadas.'); }
    catch (e) { toast.error(e.response?.data?.detail || 'No se pudieron guardar las tarifas.'); }
    finally { setGuardando(false); }
  };
  return <div className="max-w-2xl mx-auto">
    <PageHeader titulo="Cobro de constancias" descripcion="Configura el precio en USD. Para alumnos se cobrará antes de emitir; las laborales son gratuitas." />
    <Card>
      <div className="space-y-3">{TIPOS.map(([clave, etiqueta]) => <label key={clave} className="flex items-center justify-between gap-4 text-sm">
        <span>{etiqueta}</span><div className="flex items-center gap-2"><span>USD</span><input type="number" min="0" step="0.01" value={tarifas[clave] ?? '0.00'} onChange={(e) => setTarifas((v) => ({ ...v, [clave]: e.target.value }))} className="w-28 rounded-lg border px-3 py-2" /></div>
      </label>)}</div>
      <p className="text-xs mt-4" style={{ color: 'var(--ash)' }}>0,00 mantiene la constancia gratuita. El equivalente en Bs. se calcula con la tasa BCV vigente al emitir.</p>
      <button onClick={guardar} disabled={guardando} className="mt-4 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--pb)' }}>{guardando ? 'Guardando…' : 'Guardar tarifas'}</button>
    </Card>
  </div>;
}
