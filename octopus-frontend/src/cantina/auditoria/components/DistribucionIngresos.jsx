import { usd } from './CierreFormato';
import { ESTILO_TARJETA } from './CierreFormato';

// Distribución de ingresos por área (Cantina / Librería) y por método de pago.
// El porcentaje lo calcula el backend; aquí solo se dibuja el ancho de la barra.

function Barras({ titulo, filas }) {
  return (
    <section className="rounded-2xl p-3 sm:p-4 min-w-0" style={ESTILO_TARJETA} aria-label={titulo}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--jet)' }}>{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Sin ventas en el período.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => (
            <li key={f.clave} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate" style={{ color: 'var(--jet)' }}>{f.etiqueta}</span>
                <span className="shrink-0 font-mono tabular-nums" style={{ color: 'var(--jet-mid)' }}>
                  {usd(f.ingresos_usd)} · {f.porcentaje} %
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full rounded-full overflow-hidden"
                style={{ background: 'var(--jet-light)' }}
                role="progressbar"
                aria-label={`${f.etiqueta}: ${f.porcentaje} % de los ingresos`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(f.porcentaje)}
              >
                <div className="h-full rounded-full" style={{ width: `${f.porcentaje}%`, background: 'var(--pb-mid)' }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--ash)' }}>{f.ventas} venta(s)</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DistribucionIngresos({ porArea, porMetodo }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      <Barras titulo="Ingresos por área" filas={porArea} />
      <Barras titulo="Ingresos por método de pago" filas={porMetodo} />
    </div>
  );
}
