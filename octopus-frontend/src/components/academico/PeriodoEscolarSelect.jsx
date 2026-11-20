export function PeriodoEscolarSelect({ periodos, value, onChange, loading, disabled = false, id = 'periodo-escolar' }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>
        Período escolar
      </label>
      <select
        id={id}
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        disabled={loading || disabled}
        className="w-full min-h-11 rounded-lg bg-white px-3 py-2 text-sm outline-none disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', fontSize: '16px' }}
      >
        <option value="">{loading ? 'Cargando períodos...' : 'Seleccionar período...'}</option>
        {periodos.map(periodo => (
          <option key={periodo.id} value={periodo.id}>
            {periodo.nombre}{periodo.estado === 'activo' ? ' · Activo' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
