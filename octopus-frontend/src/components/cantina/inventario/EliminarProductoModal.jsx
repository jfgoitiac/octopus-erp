import { useState } from 'react';
import { Modal } from '../../ui/Modal';

// Confirmación para eliminar un producto del inventario. Reemplaza al
// window.confirm nativo para mantener el mismo estilo y poder usarlo en táctil.
const EliminarProductoModal = ({ producto, onClose, onConfirmar }) => {
  const [eliminando, setEliminando] = useState(false);

  const confirmar = async () => {
    setEliminando(true);
    try {
      await onConfirmar(producto);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <Modal
      open={Boolean(producto)}
      onClose={onClose}
      titulo="Eliminar producto"
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm min-h-[44px]" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={eliminando} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] disabled:opacity-60" style={{ background: 'var(--red)' }}>
            {eliminando ? 'Eliminando…' : 'Eliminar producto'}
          </button>
        </>
      )}
    >
      <p className="text-sm" style={{ color: 'var(--jet)' }}>
        ¿Eliminar el producto <strong>{producto?.nombre}</strong>? Esta acción no se puede deshacer.
      </p>
    </Modal>
  );
};

export default EliminarProductoModal;
