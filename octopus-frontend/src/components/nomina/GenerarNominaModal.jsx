import { useEffect, useState } from 'react';
import { Calendar, Loader2, X, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';

const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };

export function GenerarNominaModal({ onClose, onGenerated }) {
    const today = new Date();
    const [form, setForm] = useState({ mes: today.getMonth() + 1, anio: today.getFullYear(), tasa_cambio: '', monto_cestaticket: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        axiosInstance.get('nomina/registros/configuracion_generacion/')
            .then(({ data }) => setForm(prev => ({ ...prev, tasa_cambio: data.tasa_cambio ?? '', monto_cestaticket: data.cesta_ticket?.monto_usd ?? data.cesta_ticket?.monto ?? '' })))
            .catch(() => toast.error('No se pudo cargar la configuración por defecto.'))
            .finally(() => setLoading(false));
    }, []);

    const update = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const submit = async e => {
        e.preventDefault();
        setSaving(true);
        try {
            const { data } = await axiosInstance.post('nomina/registros/generar_lote/', form);
            toast.success(`Nómina generada para ${data.length} empleados.`);
            onGenerated?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo generar la nómina.');
        } finally { setSaving(false); }
    };

    return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(43,48,58,0.65)' }}>
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: 'var(--porcelain)' }}>
            <header className="flex items-start justify-between">
                <div className="flex items-center gap-2"><Zap size={17} style={{ color: 'var(--pb)' }} /><div><h3 className="font-medium" style={{ color: 'var(--jet)' }}>Generar nómina del mes</h3><p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Los valores se guardarán en cada registro.</p></div></div>
                <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
            </header>
            {loading ? <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--border)' }} /> : <>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs" style={{ color: 'var(--ash)' }}>Mes<input name="mes" type="number" min="1" max="12" value={form.mes} onChange={update} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={inputStyle} /></label>
                    <label className="text-xs" style={{ color: 'var(--ash)' }}>Año<input name="anio" type="number" min="2000" value={form.anio} onChange={update} className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={inputStyle} /></label>
                </div>
                <label className="block text-xs" style={{ color: 'var(--ash)' }}>Tasa usada (Bs/USD)<input required name="tasa_cambio" type="number" min="0" step="0.0001" value={form.tasa_cambio} onChange={update} className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-mono" style={inputStyle} /></label>
                <label className="block text-xs" style={{ color: 'var(--ash)' }}>Cesta ticket (Bs)<input required name="monto_cestaticket" type="number" min="0" step="0.01" value={form.monto_cestaticket} onChange={update} className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-mono" style={inputStyle} /></label>
            </>}
            <footer className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ border: '0.5px solid var(--border-md)' }}>Cancelar</button><button disabled={loading || saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: 'var(--pb)' }}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />} Generar</button></footer>
        </form>
    </div>;
}