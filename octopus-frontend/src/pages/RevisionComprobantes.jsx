import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

const RevisionComprobantes = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('portal/admin/comprobantes/', { params: { estatus: 'pendiente' } });
      setItems(data);
    } catch {
      toast.error('No se pudieron cargar los comprobantes pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const verArchivo = async (item) => {
    if (!item.archivo_url) return toast.warning('Este comprobante no tiene archivo adjunto.');
    try {
      const { data } = await apiClient.get(item.archivo_url, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('No se pudo abrir el archivo protegido.');
    }
  };

  const procesar = async (item, estatus) => {
    const observaciones = estatus === 'rechazado'
      ? window.prompt('Indica el motivo del rechazo para el representante:', '')
      : '';
    if (estatus === 'rechazado' && observaciones === null) return;
    setProcesando(item.id);
    try {
      const { data } = await apiClient.patch(`portal/admin/comprobantes/${item.id}/`, { estatus, observaciones });
      (data.advertencias || []).forEach((mensaje) => toast.warning(mensaje, { autoClose: false }));
      toast.success(data.mensaje);
      setItems((prev) => prev.filter((actual) => actual.id !== item.id));
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo procesar el comprobante.');
    } finally {
      setProcesando(null);
    }
  };

  return <div className="space-y-5">
    <PageHeader titulo="Revisión de comprobantes" descripcion="Aprueba o rechaza los pagos enviados desde el portal de representantes." />
    <Card className="overflow-x-auto">
      {loading ? <p className="p-6 text-sm">Cargando comprobantes…</p> : items.length === 0 ? <p className="p-6 text-sm">No hay comprobantes pendientes.</p> :
        <table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left border-b"><th className="p-3">Alumno</th><th className="p-3">Representante</th><th className="p-3">Mensualidad</th><th className="p-3">Monto</th><th className="p-3">Enviado</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="border-b"><td className="p-3"><b>{item.alumno}</b><br /><span className="text-xs">{item.grado || 'Sin grado'}</span></td><td className="p-3">{item.representante}<br /><span className="text-xs">{item.representante_cedula}</span></td><td className="p-3">{item.mensualidad}</td><td className="p-3">${item.monto_usd}</td><td className="p-3">{new Date(item.fecha_subida).toLocaleDateString('es-VE')}</td><td className="p-3 flex gap-2"><button title="Ver archivo" onClick={() => verArchivo(item)}><Eye size={17} /></button><button disabled={procesando === item.id} title="Aprobar" className="text-green-700" onClick={() => procesar(item, 'aprobado')}><Check size={17} /></button><button disabled={procesando === item.id} title="Rechazar" className="text-red-700" onClick={() => procesar(item, 'rechazado')}><X size={17} /></button></td></tr>)}</tbody>
        </table>}
    </Card>
    <button onClick={cargar} className="flex items-center gap-2 text-sm"><RefreshCw size={15} /> Actualizar</button>
  </div>;
};

export default RevisionComprobantes;
