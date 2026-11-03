import { Users } from 'lucide-react';
import { fmtMonto } from '../utils/montos';

const FiltroDeudaEstudiante = ({ alumnos = [], resumen, alumnoId, onChange }) => {
  if (alumnos.length <= 1) return null;

  const deudaPorAlumno = new Map(
    (resumen?.deuda_por_alumno || []).map((item) => [String(item.alumno_id), Number(item.deuda_usd || 0)]),
  );
  const pendientesPorAlumno = (resumen?.mensualidades_vencidas || []).reduce((acumulado, mensualidad) => {
    const id = String(mensualidad.alumno_id);
    acumulado.set(id, (acumulado.get(id) || 0) + 1);
    return acumulado;
  }, new Map());

  const opciones = [
    {
      id: null,
      nombre: 'Toda la familia',
      detalle: `${alumnos.length} estudiantes`,
      deuda: Number(resumen?.total_deuda_usd || 0),
      Icon: Users,
    },
    ...alumnos.map((alumno) => {
      const id = String(alumno.id);
      const cantidad = pendientesPorAlumno.get(id) || 0;
      return {
        id,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle: cantidad
          ? `${cantidad} mensualidad${cantidad === 1 ? '' : 'es'} pendiente${cantidad === 1 ? '' : 's'}`
          : 'Sin mensualidades vencidas',
        deuda: deudaPorAlumno.get(id) || 0,
      };
    }),
  ];

  return (
    <section aria-labelledby="consulta-por-estudiante" className="space-y-3">
      <div>
        <h3 id="consulta-por-estudiante" className="portal-section-title text-lg sm:text-xl">Consulta por estudiante</h3>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Elige a quién quieres consultar o revisa el total de la familia.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Filtrar deuda por estudiante">
        {opciones.map(({ id, nombre, detalle, deuda, Icon }) => {
          const activa = id === null ? alumnoId === null : String(alumnoId) === id;
          return (
            <button
              key={id ?? 'familia'}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={activa}
              className={`min-h-[72px] rounded-[var(--portal-radius-sm)] border p-3 text-left transition-colors ${
                activa
                  ? 'border-[var(--portal-primary)] bg-[var(--portal-tint)] shadow-[var(--portal-shadow)]'
                  : 'border-[var(--portal-line)] bg-[var(--portal-surface)] hover:bg-[var(--portal-canvas)]'
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--portal-ink)]">
                    {Icon && <Icon size={15} aria-hidden="true" />}
                    <span className="truncate">{nombre}</span>
                  </span>
                  <span className="mt-1 block text-xs text-[var(--portal-muted)]">{detalle}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold ${deuda > 0 ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>
                  {deuda > 0 ? `REF. ${fmtMonto(deuda)}` : 'Al día'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default FiltroDeudaEstudiante;
