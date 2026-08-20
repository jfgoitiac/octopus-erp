import { CreditCard, SlidersHorizontal } from 'lucide-react';

const ESTADO_LABELS = {
  sin_asignar: 'Sin asignar',
  activa: 'Activa',
  bloqueada: 'Bloqueada',
  extraviada: 'Extraviada',
};

const ESTADO_STYLE = {
  sin_asignar: { background: 'var(--porcelain)', color: 'var(--ash)' },
  activa: { background: 'var(--pb-light, #e6f7f9)', color: 'var(--pb-mid, #0c7a86)' },
  bloqueada: { background: '#fef3c7', color: '#b45309' },
  extraviada: { background: 'var(--red-light, #fee2e2)', color: 'var(--red, #dc2626)' },
};

function SkeletonFila() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
        </td>
      ))}
    </tr>
  );
}

// Listado general de tarjetas (TarjetasListView, §7.3bis Fase 3) — mínimo
// necesario para poder disparar la acción "Ajustar crédito" por fila; el
// wizard de asignación/reposición/recarga sigue siendo autosuficiente por
// código/serial y no depende de esta tabla.
export default function TarjetasTable({ tarjetas, cargando, onAjustarCredito }) {
  if (cargando) {
    return (
      <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <tbody className="divide-y" style={{ borderColor: 'var(--border-md)' }}>
            {[1, 2, 3].map(i => <SkeletonFila key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (!tarjetas || tarjetas.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <CreditCard size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Sin tarjetas registradas</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['Alumno', 'Serial', 'Saldo', 'Límite de crédito', 'Estado', 'Acciones'].map(h => (
              <th
                key={h}
                scope="col"
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tarjetas.map((t, idx) => (
            <tr
              key={t.id}
              className="bg-transparent hover:bg-[var(--ash-light)] transition-colors"
              style={{ borderBottom: idx < tarjetas.length - 1 ? '0.5px solid var(--border-md)' : 'none' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>
                {t.alumno_nombre || '— sin asignar —'}
                {t.alumno_grado_seccion && (
                  <span className="block text-xs font-normal" style={{ color: 'var(--ash)' }}>{t.alumno_grado_seccion}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{t.serial}</td>
              <td className="px-4 py-3 font-semibold" style={{ color: Number(t.saldo) < 0 ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
                ${Number(t.saldo ?? 0).toFixed(2)}
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>${Number(t.limite_credito ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={ESTADO_STYLE[t.estado] || ESTADO_STYLE.sin_asignar}
                >
                  {ESTADO_LABELS[t.estado] || t.estado}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onAjustarCredito(t)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--pb)' }}
                  title="Ajustar crédito"
                  aria-label={`Ajustar crédito de ${t.alumno_nombre || t.serial}`}
                >
                  <SlidersHorizontal size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
