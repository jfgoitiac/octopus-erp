import { useEffect, useMemo } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE } from '../../api/apiClient';

/**
 * Props: archivos, onChange, onAgregar(File[]), onEliminar(archivo,index), disabled y maxArchivos.
 * Acepta objetos API con archivo, archivo_url o url. Revoca las URLs locales al desmontarse.
 */
export default function SubirComprobantes({ archivos = [], onChange, onAgregar, onEliminar, maxArchivos = 5, disabled = false }) {
  const urlsLocales = useMemo(() => archivos.map((a) => a instanceof File ? URL.createObjectURL(a) : null), [archivos]);
  useEffect(() => () => urlsLocales.forEach((url) => { if (url) URL.revokeObjectURL(url); }), [urlsLocales]);
  const agregar = async (event) => {
    const validos = [...event.target.files].filter((file) => {
      const permitido = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);
      if (!permitido || file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: usa JPG, PNG, WEBP o PDF de hasta 10 MB.`); return false; }
      return true;
    });
    event.target.value = '';
    if (!validos.length) return;
    if (archivos.length + validos.length > maxArchivos) return toast.warning(`Máximo ${maxArchivos} comprobantes por documento.`);
    if (onAgregar) await onAgregar(validos); else onChange([...archivos, ...validos]);
  };
  const quitar = async (archivo, index) => {
    if (!window.confirm('¿Deseas retirar este comprobante?')) return;
    if (onEliminar) await onEliminar(archivo, index); else onChange(archivos.filter((_, i) => i !== index));
  };
  const url = (archivo, index) => {
    if (urlsLocales[index]) return urlsLocales[index];
    const ruta = archivo.archivo || archivo.url || archivo.archivo_url || '';
    return /^https?:|^blob:/.test(ruta) ? ruta : `${API_BASE}${ruta}`;
  };
  return <section className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Comprobantes</h3><p className="text-xs text-slate-500">Opcionales · JPG, PNG, WEBP o PDF · máximo 10 MB</p></div>{!disabled && <label className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white cursor-pointer" style={{ background: 'var(--pb)' }}><Upload size={16} /> Adjuntar<input disabled={archivos.length >= maxArchivos} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={agregar} /></label>}</div>
    {archivos.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{archivos.map((archivo, index) => { const enlace = url(archivo, index); const esImagen = (archivo.type || archivo.mime_type || '').startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(enlace); return <article key={`${archivo.id || archivo.name || archivo.nombre || 'archivo'}-${index}`} className="rounded-lg border p-2 flex gap-2 items-center"><a href={enlace} target="_blank" rel="noreferrer" className="shrink-0">{esImagen ? <img src={enlace} alt="Vista previa" className="w-12 h-12 object-cover rounded" /> : <FileText className="text-red-600" size={38} />}</a><span className="min-w-0 flex-1 truncate text-sm">{archivo.name || archivo.nombre || 'Comprobante'}</span>{!disabled && <button type="button" onClick={() => quitar(archivo, index)} className="p-2 text-red-600" aria-label="Retirar comprobante"><Trash2 size={16} /></button>}</article>; })}</div>}
  </section>;
}
