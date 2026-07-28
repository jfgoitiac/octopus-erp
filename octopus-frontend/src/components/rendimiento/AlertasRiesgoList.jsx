import { AlertTriangle, ShieldCheck } from 'lucide-react';

const AlertasRiesgoList = ({ alertas, loading }) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--ash-light)' }} />
        ))}
      </div>
    );
  }

  if (!alertas.length) {
    return (
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
      >
        <ShieldCheck size={32} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--pb)' }} />
        <p className="text-sm">Ningún alumno en riesgo académico por ahora.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alertas.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle size={18} className="flex-shrink-0" style={{ color: 'var(--red)' }} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{a.alumno}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                {a.grado_seccion} · {a.materia || 'Promedio general'} · {a.lapso}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-3">
            <p className="text-sm font-bold" style={{ color: 'var(--red)' }}>{a.promedio_actual}</p>
            <p className="text-[11px]" style={{ color: 'var(--ash)' }}>mín. {a.umbral_minimo}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertasRiesgoList;
