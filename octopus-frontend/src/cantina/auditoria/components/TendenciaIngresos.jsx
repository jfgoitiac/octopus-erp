import { ESTILO_TARJETA, fmtFechaCorta, usd } from './CierreFormato';

// Evolución diaria de ingresos. Un barra por día; la altura es relativa al día
// de mayor ingreso (solo escala de dibujo). Rangos largos scrollean DENTRO del
// gráfico, nunca el <body>.

export default function TendenciaIngresos({ serie }) {
  const valores = serie.map((p) => Number(p.ingresos_usd));
  const maximo = Math.max(0, ...valores);
  const resumen = `Ingresos diarios del ${fmtFechaCorta(serie[0]?.fecha)} al ${fmtFechaCorta(serie.at(-1)?.fecha)}`;

  return (
    <section className="rounded-2xl p-3 sm:p-4 min-w-0" style={ESTILO_TARJETA} aria-label="Evolución diaria de ingresos">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Evolución diaria de ingresos</h3>
        <span className="text-xs shrink-0" style={{ color: 'var(--ash)' }}>Máx. {usd(maximo)}</span>
      </div>
      {maximo === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Sin ingresos en el período.</p>
      ) : (
        <div className="w-full overflow-x-auto scroll-fino">
          <div role="img" aria-label={resumen} className="flex items-end gap-0.5 h-40 min-w-full" style={{ width: serie.length > 45 ? `${serie.length * 10}px` : undefined }}>
            {serie.map((p, i) => (
              <div
                key={p.fecha}
                title={`${fmtFechaCorta(p.fecha)}: ${usd(p.ingresos_usd)} (${p.ventas} venta(s))`}
                className="flex-1 min-w-[6px] rounded-t"
                style={{
                  height: `${maximo ? (valores[i] / maximo) * 100 : 0}%`,
                  minHeight: valores[i] > 0 ? '2px' : '1px',
                  background: valores[i] > 0 ? 'var(--pb-mid)' : 'var(--jet-light)',
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-between gap-2 mt-2 text-xs" style={{ color: 'var(--ash)' }}>
        <span>{fmtFechaCorta(serie[0]?.fecha)}</span>
        <span>{fmtFechaCorta(serie.at(-1)?.fecha)}</span>
      </div>
    </section>
  );
}
