import { CheckCircle, XCircle } from 'lucide-react';

const INPUT_STYLE = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
};

const CAMPOS_EVAL = ['evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4'];
const CABECERAS   = ['Alumno', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado'];

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
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      {!loading && notas.length > 0 && (
        <div
          className="px-4 py-2 flex items-center gap-4 text-xs"
          style={{ borderBottom: '0.5px solid var(--border)', color: 'var(--ash)' }}
        >
          <span>{notas.length} alumnos</span>
          <span className="font-medium" style={{ color: '#16a34a' }}>
            {notas.filter(n => n.aprobado === true).length} aprobados
          </span>
          <span className="font-medium" style={{ color: 'var(--red)' }}>
            {notas.filter(n => n.aprobado === false).length} reprobados
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {CABECERAS.map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-[11px] uppercase tracking-widest"
                  style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}
                >
                  {h}
                </th>
              ))}
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
                : notas.map(nota => (
                  <tr
                    key={nota.alumno_id}
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                        {nota.alumno_nombre}
                      </p>
                    </td>

                    {CAMPOS_EVAL.map(campo => (
                      <td key={campo} className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.01"
                          placeholder="—"
                          className="w-16 px-2 py-1 rounded-lg text-sm outline-none text-center"
                          style={INPUT_STYLE}
                          value={nota[campo] ?? ''}
                          onChange={e => onNotaChange(nota.alumno_id, campo, e.target.value)}
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
