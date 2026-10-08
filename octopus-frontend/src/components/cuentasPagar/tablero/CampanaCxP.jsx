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
    <button type="button" aria-label="Recordatorios de cuentas por pagar" onClick={() => { setAbierta((valor) => !valor); if (!abierta) cargar(); }} className="relative w-7 h-7 rounded-full flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: 'rgba(0,0,0,0.18)', color: 'var(--topbar-fg)', outlineColor: 'var(--topbar-fg)' }}><Bell size={14} />{avisos.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[9px] font-semibold leading-4 text-white" style={{ background: 'var(--red)' }}>{avisos.length > 99 ? '99+' : avisos.length}</span>}</button>
    {abierta && <section className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', color: 'var(--ink)' }}><header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}><h2 className="text-sm font-semibold">Recordatorios</h2><span className="text-xs" style={{ color: 'var(--ash)' }}>{avisos.length} pendientes</span></header><div className="max-h-[60dvh] overflow-y-auto">{avisos.length === 0 ? <p className="px-4 py-5 text-sm" style={{ color: 'var(--ash)' }}>No hay cuentas que requieran atención.</p> : avisos.map((aviso) => <article key={aviso.id} className="p-3 sm:p-4" style={{ borderBottom: '1px solid var(--border)' }}><p className="text-sm font-medium">{etiqueta(aviso)}</p><p className="mt-1 text-xs" style={{ color: 'var(--ash)' }}>{aviso.mensaje || aviso.tipo_display || 'Revisa el vencimiento y toma una acción.'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onPagar?.(aviso.cuenta || aviso.cuenta_id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--ash-light)]" style={{ border: '1px solid var(--border-md)', color: 'var(--ink)' }}><CreditCard size={13} /> Pagar</button><button type="button" onClick={() => onAplazar?.(aviso.cuenta || aviso.cuenta_id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--ash-light)]" style={{ border: '1px solid var(--border-md)', color: 'var(--ink)' }}><Clock3 size={13} /> Aplazar</button><button type="button" onClick={() => onPosponer?.(aviso.cuenta || aviso.cuenta_id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--ash-light)]" style={{ border: '1px solid var(--border-md)', color: 'var(--ink)' }}>Posponer</button><button type="button" aria-label="Marcar leído" onClick={() => leido(aviso)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--ash-light)]" style={{ border: '1px solid var(--border-md)', color: 'var(--ink)' }}><Check size={14} /></button><button type="button" aria-label="Abrir cuenta" onClick={() => onAbrirCuenta?.(aviso.cuenta || aviso.cuenta_id)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--ash-light)]" style={{ border: '1px solid var(--border-md)', color: 'var(--ink)' }}><ExternalLink size={14} /></button></div></article>)}</div></section>}
  </div>;
}
