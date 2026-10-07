import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

export default function ProveedorRapidoModal({ open, onClose, onGuardar }) {
  const [datos, setDatos] = useState({ razon_social: '', rif: '', condicion_habitual: 'contado', dias_credito_habitual: 0 });
  const [guardando, setGuardando] = useState(false);
  const cambiar = (event) => setDatos((actual) => ({ ...actual, [event.target.name]: event.target.value }));
  const guardar = async (event) => { event.preventDefault(); setGuardando(true); try { await onGuardar(datos); setDatos({ razon_social: '', rif: '', condicion_habitual: 'contado', dias_credito_habitual: 0 }); onClose(); } finally { setGuardando(false); } };
  return <Modal open={open} onClose={onClose} titulo="Nuevo proveedor" footer={<><button type="button" className="w-full sm:w-auto px-4 py-2" onClick={onClose}>Cancelar</button><button type="submit" form="proveedor-rapido" disabled={guardando} className="w-full sm:w-auto rounded-lg px-4 py-2 text-white" style={{ background: 'var(--pb)' }}>{guardando ? <Loader2 className="animate-spin inline" size={16} /> : 'Guardar proveedor'}</button></>}><form id="proveedor-rapido" className="space-y-4" onSubmit={guardar}><label className="block text-sm font-medium">Razón social<input required name="razon_social" value={datos.razon_social} onChange={cambiar} className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm font-medium">RIF<input required name="rif" value={datos.rif} onChange={cambiar} className="mt-1 w-full rounded-lg border p-2" /></label><p className="text-xs text-slate-500">Este módulo solo registra compras de contado.</p></form></Modal>;
}
