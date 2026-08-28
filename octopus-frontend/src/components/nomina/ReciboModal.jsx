import { useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { HistorialRecibos } from './HistorialRecibos';
import { Modal } from '../ui/Modal';

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

    const footer = (
        <button onClick={onClose} className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm" style={{ border: '0.5px solid var(--border-md)' }}>
            Cerrar
        </button>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div className="flex items-center gap-2">
                        <Receipt size={17} />
                        Historial de recibos
                    </div>
                    <p className="text-xs mt-0.5 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        {emp.nombre} {emp.apellido} · {emp.cedula}
                    </p>
                </div>
            )}
            footer={footer}
            size="md"
        >
            <div className="space-y-5">
                <HistorialRecibos empleadoId={emp.id} onSelect={download} />
                {downloading && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ash)' }}><Loader2 size={14} className="animate-spin" /> Preparando PDF...</div>}
            </div>
        </Modal>
    );
}
