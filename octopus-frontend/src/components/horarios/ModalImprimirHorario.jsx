import { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { INPUT_STYLE } from '../../constants/styles';

export const ModalImprimirHorario = ({ grado, docentes, loadingDocentes, onClose, onPrint }) => {
  const [tipo, setTipo] = useState('grado');
  const [docenteId, setDocenteId] = useState('');
  const [titulo, setTitulo] = useState('Horario de clases');
  const [subtitulo, setSubtitulo] = useState('');
  const [imprimiendo, setImprimiendo] = useState(false);

  const seleccionarTipo = (nuevoTipo) => {
    setTipo(nuevoTipo);
    setTitulo(nuevoTipo === 'grado' ? 'Horario de clases' : 'Horario del profesor');
  };

  const imprimir = async () => {
    if (tipo === 'docente' && !docenteId) return;
    setImprimiendo(true);
    const ok = await onPrint({ tipo, docenteId, titulo: titulo.trim() || 'Horario', subtitulo: subtitulo.trim() });
    setImprimiendo(false);
    if (ok) onClose();
  };

  return <Modal open onClose={onClose} titulo="Preparar impresión" size="sm" footer={<>
    <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm" style={{ border: '0.5px solid var(--border-md)' }}>Cancelar</button>
    <button type="button" onClick={imprimir} disabled={imprimiendo || (tipo === 'docente' && !docenteId)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm text-white inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--pb)' }}>
      {imprimiendo ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir
    </button>
  </>}>
    <div className="space-y-4">
      <fieldset><legend className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Qué horario imprimir</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="rounded-lg p-3 text-sm cursor-pointer" style={{ border: '0.5px solid var(--border-md)' }}><input type="radio" name="tipo-impresion" checked={tipo === 'grado'} onChange={() => seleccionarTipo('grado')} /> <span className="ml-2">Grado: {grado}</span></label>
          <label className="rounded-lg p-3 text-sm cursor-pointer" style={{ border: '0.5px solid var(--border-md)' }}><input type="radio" name="tipo-impresion" checked={tipo === 'docente'} onChange={() => seleccionarTipo('docente')} /> <span className="ml-2">Profesor</span></label>
        </div>
      </fieldset>
      {tipo === 'docente' && <div><label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Profesor</label><select value={docenteId} onChange={event => setDocenteId(event.target.value)} disabled={loadingDocentes} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}><option value="">{loadingDocentes ? 'Cargando profesores...' : 'Seleccionar profesor...'}</option>{docentes.map(docente => <option key={docente.user_id} value={docente.user_id}>{docente.nombre_completo}</option>)}</select></div>}
      <div><label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Encabezado</label><input value={titulo} maxLength="120" onChange={event => setTitulo(event.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE} /></div>
      <div><label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Subtítulo personalizado (opcional)</label><input value={subtitulo} maxLength="180" placeholder="Ej.: Año escolar 2026–2027" onChange={event => setSubtitulo(event.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE} /></div>
    </div>
  </Modal>;
};
