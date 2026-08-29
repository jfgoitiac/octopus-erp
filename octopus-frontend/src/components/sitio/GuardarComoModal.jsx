import { useState } from 'react';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

/**
 * Modal minimo para nombrar una PlantillaPagina nueva ("guardar esta pagina
 * como plantilla"), Fase 2 de personalizacion. Mismo patron visual que
 * ConfirmDeleteModal.
 */
const GuardarComoModal = ({
  nombreSugerido,
  guardando,
  onConfirmar,
  onCancelar,
  titulo = 'Guardar como plantilla',
  descripcion = 'Las secciones de esta página quedarán disponibles para crear páginas nuevas a partir de ellas.',
  labelInput = 'Nombre de la plantilla',
}) => {
  const [nombre, setNombre] = useState(nombreSugerido || '');

  const handleClose = () => { if (!guardando) onCancelar(); };

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={guardando}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
        Cancelar
      </button>
      <button type="submit" form="form-guardar-plantilla" disabled={guardando || !nombre.trim()}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: 'var(--pb)' }}>
        {guardando ? <Loader2 className="animate-spin" size={16} /> : <LayoutTemplate size={16} />}
        Guardar
      </button>
    </>
  );

  return (
    <Modal open onClose={handleClose} className="z-[100]" footer={footer} size="sm">
      <div className="-m-6 mb-4 p-6 flex flex-col items-center text-center" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
        <LayoutTemplate size={28} className="mb-3" aria-hidden="true" />
        <h3 className="text-base font-bold">{titulo}</h3>
        <p className="text-sm mt-1 opacity-80">
          {descripcion}
        </p>
      </div>
      <form id="form-guardar-plantilla" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) onConfirmar(nombre.trim()); }}>
        <label htmlFor="nombre-plantilla" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          {labelInput}
        </label>
        <input
          id="nombre-plantilla"
          type="text"
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
        />
      </form>
    </Modal>
  );
};

export default GuardarComoModal;
