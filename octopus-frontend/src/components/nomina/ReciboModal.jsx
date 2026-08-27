import { useState } from 'react';
import { Download, Loader2, Receipt, X } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { HistorialRecibos } from './HistorialRecibos';

export function ReciboModal({ emp, onClose }) {
    const [downloading, setDownloading] = useState(false);
    const download = async registro => {
        setDownloading(true);
        try {
            const response = await axiosInstance.get(`nomina/recibos/${registro.id}/pdf/`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const link = Object.assign(document.createElement('a'), { href: url, download: `Recibo_Nomina_${emp.cedula}_${registro.mes_correspondiente}_${registro.anio_correspondiente}.pdf` });
            link.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('No se pudo descargar el recibo.'); }
        finally { setDownloading(false); }
    };
    return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(43,48,58,0.65)' }}>
        <div className="w-full max-w-lg rounded-2xl p-6 space-y-5" style={{ background: 'var(--porcelain)' }}>
            <header className="flex items-start justify-between"><div className="flex items-center gap-2"><Receipt size={17} style={{ color: 'var(--pb)' }} /><div><h3 className="font-medium" style={{ color: 'var(--jet)' }}>Historial de recibos</h3><p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{emp.nombre} {emp.apellido} · {emp.cedula}</p></div></div><button onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
            <HistorialRecibos empleadoId={emp.id} onSelect={download} />
            {downloading && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ash)' }}><Loader2 size={14} className="animate-spin" /> Preparando PDF...</div>}
            <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ border: '0.5px solid var(--border-md)' }}>Cerrar</button></div>
        </div>
    </div>;
}
