// Pastilla con el número de alertas abiertas (rojo si hay críticas). La usan
// el menú del panel administrativo y el de la cantina. No pinta nada si 0.
export default function ContadorAlertas({ abiertas, hayCriticas, className = '' }) {
  if (!abiertas) return null;
  const plural = abiertas === 1 ? '' : 's';
  return (
    <span
      className={`min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold shrink-0 ${className}`}
      style={hayCriticas
        ? { background: 'var(--red)', color: '#fff' }
        : { background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}
      aria-label={`${abiertas} alerta${plural} abierta${plural}${hayCriticas ? ', con críticas' : ''}`}
      title={hayCriticas ? 'Hay alertas críticas abiertas' : 'Alertas abiertas'}
    >
      {abiertas > 99 ? '99+' : abiertas}
    </span>
  );
}
