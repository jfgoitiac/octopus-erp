import { forwardRef, useEffect } from 'react';
import { X } from 'lucide-react';

const SIZE_CLASSES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export const Modal = forwardRef(function Modal(
  { open, onClose, titulo, children, footer, size = 'md', className = 'z-50' },
  ref
) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div
      className={`fixed inset-0 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm transition-opacity ${className}`}
      style={{ background: 'rgba(43,48,58,0.5)' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo ? 'modal-titulo' : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${sizeClass} max-h-[100dvh] sm:max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden`}
        style={{ background: 'var(--porcelain)' }}
      >
        {titulo && (
          <div
            className="p-5 flex justify-between items-center shrink-0"
            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}
          >
            <h3 id="modal-titulo" className="font-bold text-base flex items-center gap-2">
              {titulo}
            </h3>
            <button onClick={onClose} aria-label="Cerrar" style={{ color: '#fff' }}>
              <X size={20} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {footer && (
          <div className="p-6 pt-0 shrink-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
});
