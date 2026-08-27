import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';

export function HistorialRecibos({ empleadoId, onSelect }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get(`nomina/registros/?empleado=${empleadoId}`).then(({ data }) => setItems(data.results || data)).catch(() => toast.error('No se pudo cargar el historial.')).finally(() => setLoading(false));
    }, [empleadoId]);
    if (loading) return <Loader2 className="animate-spin" size={18} />;
    return <div className="space-y-2">{items.length ? items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ border: '0.5px solid var(--border-md)' }}><span className="text-sm" style={{ color: 'var(--jet)' }}>{item.mes_correspondiente}/{item.anio_correspondiente}</span><span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>Bs. {item.total_pagar_ves}</span><button onClick={() => onSelect(item)} className="p-2" aria-label="Descargar recibo"><Download size={15} /></button></div>) : <p className="text-xs" style={{ color: 'var(--ash)' }}>No hay recibos emitidos.</p>}</div>;
}