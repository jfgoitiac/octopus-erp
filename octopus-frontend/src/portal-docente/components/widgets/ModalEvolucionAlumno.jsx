import { useState, useEffect, useRef } from 'react';
import { TrendingDown, LineChart } from 'lucide-react';
import { getRendimientoAlumno } from '../../api/academico.service';
import { Modal } from '../../../components/ui/Modal';

// Sparkline SVG simple hecho a mano (sin librería nueva) — traza el promedio
// general a través de los lapsos disponibles.
const Sparkline = ({ puntos, enRiesgo }) => {
  const valores = puntos.map(p => p.promedio_general).filter(v => v !== null && v !== undefined);
  if (valores.length === 0) {
    return <p className="text-xs text-[var(--ash)] text-center py-6">Sin promedios registrados aún.</p>;
  }

  const width = 280;
  const height = 80;
  const padding = 8;
  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, 20);
  const rango = max - min || 1;

  const coords = puntos.map((p, i) => {
    const x = puntos.length > 1
      ? padding + (i / (puntos.length - 1)) * (width - padding * 2)
      : width / 2;
    const y = p.promedio_general === null || p.promedio_general === undefined
      ? null
      : height - padding - ((p.promedio_general - min) / rango) * (height - padding * 2);
    return { x, y, lapso: p.lapso, valor: p.promedio_general };
  });

  const validos = coords.filter(c => c.y !== null);
  const pathD = validos.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const color = enRiesgo ? 'var(--red)' : 'var(--docente-primary)';

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20" role="img" aria-label="Evolución del promedio general por lapso">
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {validos.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {coords.map((c, i) => (
          <span key={i} className="text-[11px] text-[var(--ash)] truncate" style={{ maxWidth: `${100 / coords.length}%` }}>
            {c.lapso}
          </span>
        ))}
      </div>
    </div>
  );
};

const SkeletonEvolucion = () => (
  <div className="animate-pulse space-y-3">
    <div className="h-4 w-2/3 bg-[var(--surface-sunken)] rounded" />
    <div className="h-20 bg-[var(--surface-sunken)] rounded" />
  </div>
);

const ModalEvolucionAlumno = ({ alumnoId, onClose }) => {
  const [rendimiento, setRendimiento] = useState(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    getRendimientoAlumno(alumnoId, controller.signal)
      .then(res => { if (!controller.signal.aborted) setRendimiento(res.data || null); })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        setRendimiento(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [alumnoId]);

  const enRiesgo = rendimiento?.en_riesgo;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      titulo={<span className="flex items-center gap-2"><LineChart size={18} /> Evolución del alumno</span>}
    >
        {loading ? (
          <SkeletonEvolucion />
        ) : !rendimiento ? (
          <p className="text-sm text-[var(--ash)] text-center py-6">No se pudo cargar la información del alumno.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-[var(--jet)]">
                {rendimiento.alumno?.nombre} {rendimiento.alumno?.apellido}
              </p>
              {enRiesgo && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 bg-[var(--red-light)] text-[var(--red)] text-xs font-medium rounded-lg px-2.5 py-1">
                  <TrendingDown size={13} />
                  Alumno en riesgo académico
                </div>
              )}
            </div>

            <Sparkline puntos={rendimiento.por_lapso || []} enRiesgo={enRiesgo} />

            {rendimiento.asistencia?.porcentaje !== null && rendimiento.asistencia?.porcentaje !== undefined && (
              <div className="bg-[var(--surface-sunken)] rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-[var(--ash)]">Asistencia</span>
                <span className="text-sm font-semibold text-[var(--jet)]">{rendimiento.asistencia.porcentaje}%</span>
              </div>
            )}
          </div>
        )}
    </Modal>
  );
};

export default ModalEvolucionAlumno;
