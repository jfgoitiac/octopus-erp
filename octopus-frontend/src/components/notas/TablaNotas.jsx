import { useRef } from 'react';
import { CheckCircle, XCircle, Copy } from 'lucide-react';

const CAMPOS_EVAL = ['evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4'];
const CABECERAS   = ['Alumno', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado'];
const LABELS_EVAL = ['Eval 1', 'Eval 2', 'Eval 3', 'Eval 4'];

const SkeletonRow = () => (
  <tr>
    {CABECERAS.map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
      </td>
    ))}
  </tr>
);

export function TablaNotas({ notas, loading, lapsoActivo, onNotaChange }) {
  // inputRefs[fila][columna] -> <input>, para navegar con Tab/Enter y para
  // leer la primera celda con dato al copiar una columna completa.
  const inputRefs = useRef([]);

  const setInputRef = (fila, col) => el => {
    if (!inputRefs.current[fila]) inputRefs.current[fila] = [];
    inputRefs.current[fila][col] = el;
  };

  const enfocarCelda = (fila, col) => {
    const siguienteFila = col >= CAMPOS_EVAL.length ? fila + 1 : fila;
    const siguienteCol = col >= CAMPOS_EVAL.length ? 0 : col;
    inputRefs.current[siguienteFila]?.[siguienteCol]?.focus();
  };

  const handleKeyDown = (fila, col) => e => {
    if (e.key !== 'Tab' && e.key !== 'Enter') return;
    if (e.key === 'Tab' && e.shiftKey) return;
    e.preventDefault();
    enfocarCelda(fila, col + 1);
  };

  const copiarColumna = (colIdx) => {
    const campo = CAMPOS_EVAL[colIdx];
    const primeraConDato = notas.find(n => n[campo] !== '' && n[campo] !== undefined && n[campo] !== null);
    if (!primeraConDato) return;
    const valor = primeraConDato[campo];
    notas.forEach(n => {
      if (n[campo] === '' || n[campo] === undefined || n[campo] === null) {
        onNotaChange(n.alumno_id, campo, valor);
      }
    });
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      {!loading && notas.length > 0 && (
        <div
          className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          style={{ borderBottom: '0.5px solid var(--border)', color: 'var(--ash)' }}
        >
          <span>{notas.length} alumnos</span>
          <span className="font-medium" style={{ color: '#16a34a' }}>
            {notas.filter(n => n.aprobado === true).length} aprobados
          </span>
          <span className="font-medium" style={{ color: 'var(--red)' }}>
            {notas.filter(n => n.aprobado === false).length} reprobados
          </span>
          {!lapsoActivo && (
            <span className="font-medium" style={{ color: '#b45309' }}>
              Lapso cerrado — solo lectura
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr>
              {CABECERAS.map(h => {
                const colEvalIdx = LABELS_EVAL.indexOf(h);
                const esColumnaEval = colEvalIdx !== -1;
                return (
                  <th
                    key={h}
                    className="px-4 py-3 text-[11px] uppercase tracking-widest"
                    style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}
                  >
                    {esColumnaEval && !loading && notas.length > 0 && lapsoActivo ? (
                      <span className="flex items-center gap-1">
                        {h}
                        <button
                          type="button"
                          onClick={() => copiarColumna(colEvalIdx)}
                          title={`Copiar valor a las celdas vacías de ${h}`}
                          aria-label={`Copiar valor a las celdas vacías de ${h}`}
                          className="flex-shrink-0 p-0.5 rounded normal-case tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
                          style={{ color: 'var(--pb)' }}
                        >
                          <Copy size={11} />
                        </button>
                      </span>
                    ) : h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
              : notas.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm" style={{ color: 'var(--ash)' }}>
                      No hay alumnos en este grado para el lapso seleccionado.
                    </td>
                  </tr>
                )
                : notas.map((nota, fila) => (
                  <tr
                    key={nota.alumno_id}
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--jet)' }}>
                        {nota.alumno_nombre}
                      </p>
                    </td>

                    {CAMPOS_EVAL.map((campo, col) => (
                      <td key={campo} className="px-4 py-2">
                        <input
                          ref={setInputRef(fila, col)}
                          type="number"
                          min="0"
                          max="20"
                          step="0.01"
                          placeholder="—"
                          aria-label={`${campo.replace('evaluacion_', 'Evaluación ')} de ${nota.alumno_nombre}`}
                          className={`w-16 px-2 py-2 rounded-lg text-sm outline-none text-center border-[0.5px] transition-colors ${
                            lapsoActivo
                              ? 'border-[var(--border-md)] bg-white text-[var(--jet)] hover:border-[var(--pb)] focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:border-[var(--pb)]'
                              : 'border-[var(--border-md)] bg-[var(--ash-light)] text-[var(--ash)] cursor-not-allowed'
                          }`}
                          value={nota[campo] ?? ''}
                          onChange={e => onNotaChange(nota.alumno_id, campo, e.target.value)}
                          onKeyDown={handleKeyDown(fila, col)}
                          disabled={!lapsoActivo}
                        />
                      </td>
                    ))}

                    <td className="px-4 py-3">
                      <span
                        className="text-sm font-bold"
                        style={{
                          color: nota.definitiva !== '' && nota.definitiva !== undefined
                            ? (parseFloat(nota.definitiva) >= 10 ? '#16a34a' : 'var(--red)')
                            : 'var(--ash)',
                        }}
                      >
                        {nota.definitiva !== '' && nota.definitiva !== undefined ? nota.definitiva : '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {nota.aprobado === true && (
                        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#16a34a' }}>
                          <CheckCircle size={15} /> Aprobado
                        </span>
                      )}
                      {nota.aprobado === false && (
                        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--red)' }}>
                          <XCircle size={15} /> Reprobado
                        </span>
                      )}
                      {(nota.aprobado === null || nota.aprobado === undefined) && (
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
