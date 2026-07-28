const colorCelda = (porcentaje) => {
  if (porcentaje === null || porcentaje === undefined) return { bg: 'var(--ash-light)', color: 'var(--ash)', emoji: '—' };
  if (porcentaje > 80) return { bg: '#dcfce7', color: '#166534', emoji: '🟢' };
  if (porcentaje >= 60) return { bg: '#fef9c3', color: '#854d0e', emoji: '🟡' };
  return { bg: 'var(--red-light)', color: 'var(--red)', emoji: '🔴' };
};

const MapaCalorSeccion = ({ seccion, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--ash-light)' }} />
        ))}
      </div>
    );
  }

  if (!seccion || !seccion.por_materia?.length) {
    return (
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
      >
        <p className="text-sm">No hay materias activas con notas cargadas para esta sección todavía.</p>
      </div>
    );
  }

  return (
    <div>
      {seccion.lapso && (
        <p className="text-xs mb-3" style={{ color: 'var(--ash)' }}>
          Lapso: <span className="font-medium" style={{ color: 'var(--jet)' }}>{seccion.lapso}</span>
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {seccion.por_materia.map((m) => {
          const { bg, color, emoji } = colorCelda(m.porcentaje_aprobados);
          return (
            <div key={m.materia_id} className="rounded-xl p-4" style={{ background: bg }}>
              <p className="text-xs font-medium truncate" style={{ color }}>{m.materia}</p>
              <p className="text-2xl font-bold mt-1" style={{ color }}>
                {emoji} {m.porcentaje_aprobados === null ? 'Sin datos' : `${m.porcentaje_aprobados}%`}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color }}>
                {m.total_evaluados} evaluado{m.total_evaluados === 1 ? '' : 's'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MapaCalorSeccion;
