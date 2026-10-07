import { FileText, Image, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';

/**
 * Props: archivos (File[]|metadatos), onChange(archivos), maxArchivos (5), disabled.
 * Muestra previsualización local de imágenes y abre PDFs en otra pestaña. La eliminación
 * siempre pide confirmación al usuario antes de actualizar la lista.
 */
export default function SubirComprobantes({ archivos = [], onChange, maxArchivos = 5, disabled = false }) {
  const agregar = (event) => {
    const nuevos = [...event.target.files];
    const validos = nuevos.filter((file) => {
      const permitido = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);
      if (!permitido || file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: usa JPG, PNG, WEBP o PDF de hasta 10 MB.`); return false; }
      return true;
    });
    if (archivos.length + validos.length > maxArchivos) return toast.warning(`Máximo ${maxArchivos} comprobantes por documento.`);
    onChange([...archivos, ...validos]);
    event.target.value = '';
  };
  const quitar = (index) => {
    if (window.confirm('¿Deseas retirar este comprobante?')) onChange(archivos.filter((_, i) => i !== index));
  };
  const url = (archivo) => archivo instanceof File ? URL.createObjectURL(archivo) : archivo.url || archivo.archivo_url;
  return <section className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Comprobantes</h3><p className="text-xs text-slate-500">Opcionales · JPG, PNG, WEBP o PDF · máximo 10 MB</p></div><label className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white cursor-pointer" style={{ background: 'var(--pb)' }}><Upload size={16} /> Adjuntar<input disabled={disabled || archivos.length >= maxArchivos} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={agregar} /></label></div>
    {archivos.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{archivos.map((archivo, index) => { const esImagen = (archivo.type || archivo.mime_type || '').startsWith('image/'); const enlace = url(archivo); return <article key={`${archivo.name || archivo.nombre || 'archivo'}-${index}`} className="rounded-lg border p-2 flex gap-2 items-center"><a href={enlace} target="_blank" rel="noreferrer" className="shrink-0">{esImagen ? <img src={enlace} alt="Vista previa" className="w-12 h-12 object-cover rounded" /> : <FileText className="text-red-600" size={38} />}</a><span className="min-w-0 flex-1 truncate text-sm">{archivo.name || archivo.nombre || 'Comprobante'}{!esImagen && <Image className="inline ml-1" size={13} />}</span><button type="button" disabled={disabled} onClick={() => quitar(index)} className="p-2 text-red-600" aria-label="Retirar comprobante"><Trash2 size={16} /></button></article>; })}</div>}
  </section>;
}
