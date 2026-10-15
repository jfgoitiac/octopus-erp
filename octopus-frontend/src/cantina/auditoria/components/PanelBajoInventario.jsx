import { PackageCheck, PackageX } from 'lucide-react';
import PanelTarjeta, { PanelVacio } from './PanelTarjeta';
import { num } from './PanelFormato';

const AREAS = { cantina: 'Cantina', libreria: 'Librería' };

// Productos activos con stock_actual < stock_minimo (CONTRATO §2).
const PanelBajoInventario = ({ productos = [] }) => (
  <PanelTarjeta
    icono={PackageX}
    titulo="Bajo inventario"
    contador={productos.length}
    enlace={{ to: '/cantina/inventario', texto: 'Ir a inventario' }}
  >
    {productos.length === 0 ? (
      <PanelVacio icono={PackageCheck} texto="Todo el inventario está sobre el mínimo." />
    ) : (
      <ul className="flex flex-col gap-2">
        {productos.map((p) => {
          const actual = num(p.stock_actual);
          const minimo = num(p.stock_minimo);
          const agotado = actual <= 0;
          return (
            <li
              key={p.producto_id}
              className="flex items-center gap-3 rounded-lg p-2.5"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-medium)' }}>{p.nombre}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  {AREAS[p.area] ?? p.area} · mínimo {minimo}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs tabular-nums"
                style={{
                  background: agotado ? 'var(--red-light)' : 'var(--yellow-light)',
                  color: agotado ? 'var(--red)' : 'var(--amber-ink)',
                  fontWeight: 'var(--fw-semibold)',
                }}
              >
                {agotado ? 'Agotado' : `${actual} en stock`}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </PanelTarjeta>
);

export default PanelBajoInventario;
