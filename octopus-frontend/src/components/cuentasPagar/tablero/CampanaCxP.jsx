/* eslint-disable react-hooks/set-state-in-effect -- actualización tras respuesta HTTP */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, Clock3, CreditCard, ExternalLink } from 'lucide-react';
import { listarBandeja, marcarAvisoLeido } from '../../../services/cuentasPagarService';

const etiqueta = (aviso) => aviso.cuenta_numero || aviso.cuenta?.numero || aviso.titulo || 'Cuenta por pagar';

/** Campana autocontenida: el encabezado puede montarla sin conocer el estado de CxP. */
export default function CampanaCxP({ onPagar, onAplazar, onPosponer, onAbrirCuenta }) {
  const [abierta, setAbierta] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const raiz = useRef(null);
  const cargar = useCallback(async () => {
    try {
      const { data } = await listarBandeja({ leido: false });
      setAvisos(data.results || data || []);
    } catch { setAvisos([]); }
  }, []);
  useEffect(() => { cargar(); const intervalo = window.setInterval(cargar, 300000); return () => window.clearInterval(intervalo); }, [cargar]);
  useEffect(() => {
    const cerrar = (evento) => { if (raiz.current && !raiz.current.contains(evento.target)) setAbierta(false); };
    document.addEventListener('mousedown', cerrar); return () => document.removeEventListener('mousedown', cerrar);
  }, []);
  const leido = async (aviso) => { try { await marcarAvisoLeido(aviso.id); setAvisos((actual) => actual.filter((item) => item.id !== aviso.id)); } catch { /* la bandeja conserva el aviso si falla */ } };
  return <div className="relative" ref={raiz}>
    <button type="button" aria-label="Recordatorios de cuentas por pagar" onClick={() => { setAbierta((valor) => !valor); if (!abierta) cargar(); }} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Bell size={20} />{avisos.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-5 text-white">{avisos.length > 99 ? '99+' : avisos.length}</span>}</button>
    {abierta && <section className="absolute right-0 z-50 mt-2 w-[min(23rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white shadow-xl shadow-sm"><header className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Recordatorios</h2><span className="text-xs text-slate-500">{avisos.length} pendientes</span></header><div className="max-h-[60dvh] overflow-y-auto">{avisos.length === 0 ? <p className="p-4 text-sm text-slate-500">No hay cuentas que requieran atención.</p> : avisos.map((aviso) => <article key={aviso.id} className="border-b p-3 last:border-0"><p className="font-medium text-sm">{etiqueta(aviso)}</p><p className="mt-1 text-xs text-slate-500">{aviso.mensaje || aviso.tipo_display || 'Revisa el vencimiento y toma una acción.'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onPagar?.(aviso.cuenta || aviso.cuenta_id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors px-2 py-1 text-xs"><CreditCard size={13} /> Pagar</button><button type="button" onClick={() => onAplazar?.(aviso.cuenta || aviso.cuenta_id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors px-2 py-1 text-xs"><Clock3 size={13} /> Aplazar</button><button type="button" onClick={() => onPosponer?.(aviso.cuenta || aviso.cuenta_id)} className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors px-2 py-1 text-xs">Posponer</button><button type="button" aria-label="Marcar leído" onClick={() => leido(aviso)} className="rounded-md border p-1 text-slate-600"><Check size={14} /></button><button type="button" aria-label="Abrir cuenta" onClick={() => onAbrirCuenta?.(aviso.cuenta || aviso.cuenta_id)} className="rounded-md border p-1 text-slate-600"><ExternalLink size={14} /></button></div></article>)}</div></section>}
  </div>;
}
