import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import EgresoFormContenido from '../components/egresos/EgresoForm';
import { crearEgreso, subirComprobante } from '../services/egresosService';
import { parseApiError } from '../utils/apiError';

export default function EgresoForm() { const navegar = useNavigate(); const [guardando, setGuardando] = useState(false); const guardar = async (datos) => { setGuardando(true); try { const { comprobantes, ...cuerpo } = datos; const { data } = await crearEgreso(cuerpo); await Promise.all(comprobantes.map((archivo) => { const form = new FormData(); form.append('archivo', archivo); return subirComprobante(data.id, form); })); toast.success('Egreso de contado registrado.'); navegar(`/egresos/${data.id}`); } catch (error) { toast.error(parseApiError(error)); } finally { setGuardando(false); } }; return <div className="animate-fadeIn"><PageHeader titulo="Nuevo egreso" descripcion="Registro exclusivo de compras y pagos de contado" /><EgresoFormContenido onGuardar={guardar} guardando={guardando} /></div>; }
