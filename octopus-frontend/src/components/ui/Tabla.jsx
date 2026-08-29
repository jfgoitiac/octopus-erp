import { Children, cloneElement } from 'react';
import { TablaScroll } from './TablaScroll';

const FILA_CLASS = 'hover:bg-[var(--surface-sunken)] transition-colors';
const FILA_STYLE = { borderBottom: '1px solid var(--border)' };

export function Tabla({ columnas = [], children, minWidth = 640, vacio }) {
  const filas = Children.map(children, fila =>
    cloneElement(fila, {
      className: [FILA_CLASS, fila.props.className].filter(Boolean).join(' '),
      style: { ...FILA_STYLE, ...fila.props.style },
    })
  );

  const tabla = (
    <table className="w-full text-sm border-collapse" style={{ minWidth: `${minWidth}px` }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {columnas.map(col => (
            <th
              key={col.key}
              scope="col"
              className={`px-3 py-3 sm:px-4 text-xs uppercase tracking-wider whitespace-nowrap ${
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
              }`}
              style={{ color: 'var(--ash)', fontWeight: 'var(--fw-medium)' }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas}
      </tbody>
    </table>
  );

  if (!children || (Array.isArray(children) && children.length === 0)) {
    return (
      <TablaScroll>
        {tabla}
        {vacio && (
          <div className="py-16 flex items-center justify-center text-center" style={{ color: 'var(--ash)' }}>
            {vacio}
          </div>
        )}
      </TablaScroll>
    );
  }

  return <TablaScroll>{tabla}</TablaScroll>;
}

export default Tabla;
