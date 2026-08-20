import { UserX, Phone, Mail, SlidersHorizontal } from 'lucide-react';

// Badge de días en negativo: ámbar 1-3 días, rojo si supera los 3 (§ contrato
// de GET reportes/morosos/, dias_en_negativo).
function badgeDias(dias) {
  const rojo = Number(dias) > 3;
  return {
    background: rojo ? 'var(--red-light, #fee2e2)' : '#fef3c7',
    color: rojo ? 'var(--red, #dc2626)' : '#b45309',
  };
}

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

// Tabla de morosidad (ReporteMorososView, GET reportes/morosos/) — tarjetas
// con saldo negativo, ordenadas por días en negativo descendente. Reutiliza
// AjustarCreditoModal (mismo modal que la tabla de tarjetas general) vía el
// callback onAjustarCredito que le pasa la página contenedora.
export default function MorosidadTable({ resultados, cargando, onAjustarCredito }) {
  if (cargando) {
    return (
      <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <tbody className="divide-y" style={{ borderColor: 'var(--border-md)' }}>
            {[1, 2, 3, 4].map(i => <SkeletonFila key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (!resultados || resultados.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <UserX size={32} className="mb-2 opacity-30" />
        <p className="text-sm">No hay tarjetas con saldo negativo en este filtro</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['Alumno', 'Grado/Sección', 'Representante', 'Saldo', 'Límite de crédito', 'Días en negativo', 'Acciones'].map(h => (
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
          {resultados.map((r, idx) => (
            <tr
              key={r.tarjeta_id}
              className="bg-transparent hover:bg-[var(--ash-light)] transition-colors"
              style={{ borderBottom: idx < resultados.length - 1 ? '0.5px solid var(--border-md)' : 'none' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>
                {r.alumno_nombre}
                <span className="block text-xs font-normal font-mono" style={{ color: 'var(--ash)' }}>{r.serial}</span>
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{r.grado_seccion || '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>
                <div>{r.representante_nombre || '—'}</div>
                <div className="flex flex-col gap-0.5 text-xs mt-0.5">
                  {r.representante_telefono && (
                    <span className="flex items-center gap-1"><Phone size={11} />{r.representante_telefono}</span>
                  )}
                  {r.representante_correo && (
                    <span className="flex items-center gap-1"><Mail size={11} />{r.representante_correo}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 font-semibold" style={{ color: 'var(--red, #dc2626)' }}>
                ${Number(r.saldo ?? 0).toFixed(2)}
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>${Number(r.limite_credito ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={badgeDias(r.dias_en_negativo)}
                >
                  {r.dias_en_negativo} día{Number(r.dias_en_negativo) !== 1 ? 's' : ''}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onAjustarCredito(r)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--pb)' }}
                  title="Ajustar crédito"
                  aria-label={`Ajustar crédito de ${r.alumno_nombre}`}
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
