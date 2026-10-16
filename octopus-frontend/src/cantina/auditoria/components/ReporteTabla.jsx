import { Inbox } from 'lucide-react';
import { TablaScroll } from '../../../components/ui/TablaScroll';
import { ALINEA_DERECHA, formatearCelda, valorCrudo } from '../utils/exportarAuditoria';
import { ESTILO_TARJETA } from './CierreFormato';

// Tabla genérica de los reportes. Las mismas `columnas` alimentan la
// exportación (utils/exportarAuditoria.js); `render(fila)` es solo de la UI.
// La tabla conserva su `minW` y scrollea dentro de TablaScroll; la tarjeta
// lleva overflow-hidden para contener el margen negativo de TablaScroll.

const alineacion = (c) => (ALINEA_DERECHA.has(c.tipo) ? 'text-right' : 'text-left');

export default function ReporteTabla({
  titulo, columnas, filas, totales, claveFila, minW = 'min-w-[640px]', vacio = 'Sin registros en el período.',
}) {
  return (
    <section className="rounded-2xl overflow-hidden" style={ESTILO_TARJETA}>
      {titulo && (
        <h3 className="px-3 sm:px-4 pt-3 pb-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</h3>
      )}
      {filas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 sm:p-10 text-center">
          <Inbox size={26} aria-hidden="true" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>{vacio}</p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Prueba ampliando el rango de fechas o quitando filtros.</p>
        </div>
      ) : (
        <TablaScroll>
          <table className={`w-full text-sm ${minW}`}>
            <thead>
              <tr style={{ background: 'var(--porcelain)' }}>
                {columnas.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-3 py-2.5 font-medium text-xs uppercase tracking-wider whitespace-nowrap ${alineacion(c)}`}
                    style={{ color: 'var(--ash)' }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr
                  key={claveFila ? claveFila(fila) : i}
                  className="hover:bg-[var(--pb-light)] transition-colors"
                  style={{ borderTop: '0.5px solid var(--border-md)' }}
                >
                  {columnas.map((c, idx) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 ${alineacion(c)} ${ALINEA_DERECHA.has(c.tipo) ? 'font-mono tabular-nums whitespace-nowrap' : ''} ${c.tipo === 'fechaHora' || c.tipo === 'fecha' ? 'whitespace-nowrap' : ''}`}
                      style={{ color: idx === 0 ? 'var(--jet)' : 'var(--jet-mid)' }}
                    >
                      {c.render ? c.render(fila) : formatearCelda(c.tipo, valorCrudo(c, fila))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totales && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-md)', background: 'var(--porcelain)' }}>
                  {columnas.map((c, idx) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 font-semibold ${alineacion(c)} ${ALINEA_DERECHA.has(c.tipo) ? 'font-mono tabular-nums whitespace-nowrap' : ''}`}
                      style={{ color: 'var(--jet)' }}
                    >
                      {idx === 0 ? 'Totales' : totales[c.key] === undefined ? '' : formatearCelda(c.tipo, totales[c.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </TablaScroll>
      )}
    </section>
  );
}

const Bloque = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'var(--jet-light)' }} />
);

// Skeleton de una pestaña: tarjetas de resumen + tabla.
export function ReporteSkeleton({ tarjetas = 4, filas = 6 }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4" aria-busy="true" aria-label="Cargando reporte">
      {tarjetas > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: tarjetas }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl p-3 sm:p-4" style={ESTILO_TARJETA}>
              <Bloque className="h-3 w-2/3" />
              <Bloque className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-2xl p-3 sm:p-4" style={ESTILO_TARJETA}>
        <Bloque className="h-8 w-full" />
        {Array.from({ length: filas }, (_, i) => <Bloque key={i} className="h-9 w-full" />)}
      </div>
    </div>
  );
}
