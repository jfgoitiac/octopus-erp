import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import axiosInstance from '../../api/apiClient';
import { fmtBs } from '../../constants/nominaFmt';

// empleadoId es el id del empleado en RRHH (rrhh.Empleado), no en nomina.Empleado
// — son tablas distintas con PKs independientes. El filtro `empleado_rrhh`
// resuelve el registro de nómina vinculado (nomina/views.py::RegistroNominaViewSet).
export function HistorialRecibos({ empleadoId, onSelect }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get(`nomina/registros/?empleado_rrhh=${empleadoId}`).then(({ data }) => setItems(data.results || data)).catch(() => toast.error('No se pudo cargar el historial.')).finally(() => setLoading(false));
    }, [empleadoId]);
    if (loading) return <Loader2 className="animate-spin" size={18} />;
    return <div className="space-y-2">{items.length ? items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ border: '0.5px solid var(--border-md)' }}><span className="text-sm capitalize" style={{ color: 'var(--jet)' }}>{format(new Date(item.anio_correspondiente, item.mes_correspondiente - 1), 'MMMM yyyy', { locale: es })}</span><span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>Bs. {fmtBs(item.total_pagar_ves)}</span><button onClick={() => onSelect(item)} className="p-2" aria-label="Descargar recibo"><Download size={15} /></button></div>) : <p className="text-xs" style={{ color: 'var(--ash)' }}>No hay recibos emitidos.</p>}</div>;
}