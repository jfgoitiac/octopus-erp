const OPCIONES = [
  { valor: '', texto: 'Todas' },
  { valor: 'cantina', texto: 'Cantina' },
  { valor: 'libreria', texto: 'Librería' },
];

// Control segmentado del área (CONTRATO §0: `area` omitido = ambas).
const PanelFiltroArea = ({ valor, onCambio, deshabilitado = false }) => (
  <div
    role="radiogroup"
    aria-label="Área"
    className="grid w-full grid-cols-3 gap-1 rounded-xl p-1 sm:inline-grid sm:w-auto"
    style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
  >
    {OPCIONES.map((op) => {
      const activo = valor === op.valor;
      return (
        <button
          key={op.valor || 'todas'}
          type="button"
          role="radio"
          aria-checked={activo}
          disabled={deshabilitado}
          onClick={() => !activo && onCambio(op.valor)}
          className="min-h-[40px] rounded-lg px-3 text-sm transition-colors disabled:opacity-60 sm:min-w-[88px]"
          style={{
            background: activo ? 'var(--surface)' : 'transparent',
            color: activo ? 'var(--pb-mid)' : 'var(--jet-mid)',
            boxShadow: activo ? 'var(--shadow-sm)' : 'none',
            fontWeight: activo ? 'var(--fw-semibold)' : 'var(--fw-medium)',
          }}
        >
          {op.texto}
        </button>
      );
    })}
  </div>
);

export default PanelFiltroArea;
