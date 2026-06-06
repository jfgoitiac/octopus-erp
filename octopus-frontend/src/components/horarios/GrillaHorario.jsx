import { Plus, Edit3, CalendarX, Lock, LockOpen } from 'lucide-react';
import { DIAS, HORAS_INICIO, getColor } from '../../constants/horarios';

const TH_STYLE = {
  color: 'var(--ash)',
  background: 'var(--porcelain)',
  borderBottom: '0.5px solid var(--border-md)',
};
const CELL_STYLE = {
  background: 'var(--porcelain)',
  verticalAlign: 'middle',
  minWidth: 110,
  borderLeft: '0.5px solid var(--border)',
};

// Patrón determinista que simula un horario parcialmente lleno para el skeleton
const SKELETON_PATTERN = [
  [true,  false, true,  true,  false],
  [false, true,  false, false, true ],
  [true,  false, true,  false, true ],
  [false, true,  true,  false, false],
  [true,  true,  false, true,  false],
  [false, false, true,  true,  true ],
  [true,  false, false, true,  false],
  [false, true,  true,  false, true ],
  [true,  false, true,  false, false],
  [false, true,  false, true,  true ],
];

const SkeletonGrilla = ({ horasInicio }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 700 }}>
        <thead>
          <tr>
            <th className="px-3 py-3 w-20" style={TH_STYLE} />
            {DIAS.map(d => (
              <th key={d} className="px-3 py-3 text-[11px] uppercase tracking-widest text-center"
                style={{ ...TH_STYLE, borderLeft: '0.5px solid var(--border)' }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horasInicio.map((hora, row) => (
            <tr key={hora} style={{ borderBottom: '0.5px solid var(--border)' }}>
              <td className="px-3 py-2" style={{ background: 'var(--porcelain)' }}>
                <div className="h-3 w-10 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
              </td>
              {DIAS.map((_, col) => (
                <td key={col} className="px-2 py-1.5" style={CELL_STYLE}>
                  {(SKELETON_PATTERN[row] ?? [])[col] && (
                    <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--border-md)' }} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const EmptyGrilla = () => (
  <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 700 }}>
        <thead>
          <tr>
            <th className="px-3 py-3 text-[11px] uppercase tracking-widest text-left w-20" style={TH_STYLE}>
              Hora
            </th>
            {DIAS.map(d => (
              <th key={d} className="px-3 py-3 text-[11px] uppercase tracking-widest text-center"
                style={{ ...TH_STYLE, borderLeft: '0.5px solid var(--border)' }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={DIAS.length + 1} className="py-16 text-center" style={{ color: 'var(--ash)' }}>
              <CalendarX size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Este grado aún no tiene clases.</p>
              <p className="text-xs mt-1 opacity-70">Haz clic en cualquier celda para agregar la primera clase.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

export const GrillaHorario = ({
  loading,
  isEmpty,
  horasInicio = HORAS_INICIO,
  getClaseEnCelda,
  onCeldaClick,
  lockedIds = new Set(),
  onToggleLock,
}) => {
  if (loading) return <SkeletonGrilla horasInicio={horasInicio} />;
  if (isEmpty) return <EmptyGrilla />;

  return (
    <div className="rounded-xl overflow-hidden print:shadow-none"
      style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th className="px-3 py-3 text-[11px] uppercase tracking-widest text-left w-20"
                style={TH_STYLE}>
                Hora
              </th>
              {DIAS.map(d => (
                <th key={d} className="px-3 py-3 text-[11px] uppercase tracking-widest text-center"
                  style={{ ...TH_STYLE, borderLeft: '0.5px solid var(--border)' }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horasInicio.map(hora => (
              <tr key={hora} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td className="px-3 py-2 text-xs font-medium"
                  style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                  {hora}
                </td>
                {DIAS.map(dia => {
                  const clase = getClaseEnCelda(dia, hora);
                  const isLocked = clase && lockedIds.has(clase.id);
                  return (
                    <td key={dia} className="px-2 py-1.5 text-center" style={CELL_STYLE}>
                      {clase ? (
                        <button
                          onClick={() => onCeldaClick(dia, hora)}
                          aria-label={`Editar ${clase.materia?.nombre || 'clase'} — ${dia} ${hora}`}
                          className="w-full rounded-lg px-2 py-2 text-left transition-all hover:opacity-80 group relative"
                          style={{
                            background: getColor(clase.materia?.id),
                            border: isLocked ? '2px solid #7c3aed' : '1px solid rgba(0,0,0,0.07)',
                          }}
                        >
                          <p className="text-[11px] font-bold leading-tight" style={{ color: 'var(--jet)' }}>
                            {clase.materia?.nombre || 'Materia'}
                          </p>
                          {clase.aula && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>{clase.aula}</p>
                          )}
                          <p className="text-[9px] mt-0.5 opacity-60" style={{ color: 'var(--jet)' }}>
                            {clase.hora_inicio} – {clase.hora_fin}
                          </p>
                          {/* Botón lock — siempre visible si bloqueado, hover si no */}
                          {onToggleLock && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); onToggleLock(clase.id); }}
                              aria-label={isLocked ? 'Desbloquear clase' : 'Bloquear clase para el generador'}
                              className={`absolute top-1 left-1 p-0.5 rounded transition-all ${isLocked ? 'flex' : 'hidden group-hover:flex'}`}
                              style={{ background: 'rgba(255,255,255,0.85)' }}
                            >
                              {isLocked
                                ? <Lock size={10} style={{ color: '#7c3aed' }} />
                                : <LockOpen size={10} style={{ color: 'var(--ash)' }} />
                              }
                            </button>
                          )}
                          <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                            <span className="p-0.5 rounded" style={{ background: 'rgba(255,255,255,0.8)' }}>
                              <Edit3 size={10} style={{ color: 'var(--pb)' }} />
                            </span>
                          </div>
                        </button>
                      ) : (
                        <button
                          onClick={() => onCeldaClick(dia, hora)}
                          aria-label={`Agregar clase — ${dia} ${hora}`}
                          // opacity-30 visible en móvil (sin hover); md:opacity-0 la oculta en desktop hasta hover
                          className="w-full h-12 rounded-lg flex items-center justify-center transition-all opacity-30 hover:opacity-100 md:opacity-0 md:hover:opacity-100"
                          style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
