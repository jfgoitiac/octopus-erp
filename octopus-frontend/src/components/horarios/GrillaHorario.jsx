import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CalendarX, Coffee } from 'lucide-react';
import { DIAS, DIAS_GENERADOR } from '../../constants/horarios';
import { TablaScroll } from '../ui/TablaScroll';
import { CeldaDroppable } from './CeldaDroppable';

const TH_STYLE = {
  color: 'var(--ash)',
  background: 'var(--porcelain)',
  borderBottom: '0.5px solid var(--border-md)',
};
// Columna "Hora" fija a la izquierda — visible mientras se hace scroll horizontal
// entre los días en mobile/tablet, donde la grilla semanal completa no cabe.
const TH_STICKY_STYLE = {
  ...TH_STYLE,
  position: 'sticky',
  left: 0,
  zIndex: 3,
  boxShadow: '1px 0 0 0 var(--border-md)',
};
const HORA_CELL_STYLE = {
  color: 'var(--ash)',
  background: 'var(--porcelain)',
  position: 'sticky',
  left: 0,
  zIndex: 1,
  boxShadow: '1px 0 0 0 var(--border-md)',
};
const CELL_STYLE = {
  background: 'var(--porcelain)',
  verticalAlign: 'middle',
  minWidth: 110,
  borderLeft: '0.5px solid var(--border)',
};

// A partir de los BloqueHorario del paquete (uno por día, con su propio
// hora_inicio/hora_fin/tipo) arma las filas de la grilla: cada fila es una
// hora de inicio distinta; cada columna busca el bloque de ese día que
// empieza a esa hora. Si un día no tiene bloque a esa hora, la celda queda
// como hueco (jornadas pueden diferir ligeramente entre días).
// Si TODOS los bloques presentes en una fila son tipo 'receso', se pinta
// como una fila de receso unificada.
const buildFilas = (bloques) => {
  const porDia = {};
  DIAS_GENERADOR.forEach(d => {
    porDia[d.value] = bloques
      .filter(b => b.dia_semana === d.value)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.hora_inicio.localeCompare(b.hora_inicio));
  });

  const horas = [...new Set(bloques.map(b => b.hora_inicio))].sort();

  return horas.map(hora => {
    const celdas = DIAS_GENERADOR.map(d => porDia[d.value].find(b => b.hora_inicio === hora) ?? null);
    const existentes = celdas.filter(Boolean);
    const esReceso = existentes.length > 0 && existentes.every(b => b.tipo === 'receso');
    const horaFin = existentes[0]?.hora_fin ?? '';
    return { hora, horaFin, celdas, esReceso };
  });
};

const SkeletonGrilla = () => (
  <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <TablaScroll>
      <table className="w-full border-collapse" style={{ minWidth: 700 }}>
        <thead>
          <tr>
            <th className="px-3 py-3 w-20" style={TH_STICKY_STYLE} />
            {DIAS.map(d => (
              <th key={d} className="px-3 py-3 text-[11px] uppercase tracking-widest text-center"
                style={{ ...TH_STYLE, borderLeft: '0.5px solid var(--border)' }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, row) => (
            <tr key={row} style={{ borderBottom: '0.5px solid var(--border)' }}>
              <td className="px-3 py-2" style={HORA_CELL_STYLE}>
                <div className="h-3 w-10 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
              </td>
              {DIAS.map((_, col) => (
                <td key={col} className="px-2 py-1.5" style={CELL_STYLE}>
                  {(row + col) % 2 === 0 && (
                    <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--border-md)' }} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaScroll>
  </div>
);

const EmptyGrilla = ({ mensaje }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <TablaScroll>
      <table className="w-full border-collapse" style={{ minWidth: 700 }}>
        <thead>
          <tr>
            <th className="px-3 py-3 text-[11px] uppercase tracking-widest text-left w-20" style={TH_STICKY_STYLE}>
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
              <p className="text-sm">{mensaje}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </TablaScroll>
  </div>
);

export const GrillaHorario = ({
  loading,
  bloques = [],
  getClaseEnBloque,
  onCeldaClick,
  onEditarClase,
  onTogglePin,
  onMoverClase,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (loading) return <SkeletonGrilla />;
  if (!bloques.length) {
    return <EmptyGrilla mensaje="Esta jornada aún no tiene bloques definidos. Configúralos desde 'Editar bloques'." />;
  }

  const filas = buildFilas(bloques);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const clase = active.data.current?.clase;
    const bloqueDestino = over.data.current?.bloque;
    if (!clase || !bloqueDestino) return;
    if (bloqueDestino.tipo !== 'clase') return;
    if (bloqueDestino.id === clase.bloque_id) return; // soltó en el mismo lugar
    if (getClaseEnBloque?.(bloqueDestino.id)) return; // celda destino ya ocupada
    onMoverClase?.(clase, bloqueDestino);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="rounded-xl overflow-hidden print:shadow-none"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <TablaScroll>
          <table className="w-full border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th className="px-3 py-3 text-[11px] uppercase tracking-widest text-left w-20"
                  style={TH_STICKY_STYLE}>
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
              {filas.map(fila => (
                <tr key={fila.hora} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-3 py-2 text-xs font-medium" style={HORA_CELL_STYLE}>
                    {fila.hora}{fila.horaFin ? `–${fila.horaFin}` : ''}
                  </td>
                  {fila.esReceso ? (
                    <td colSpan={DIAS.length} className="px-2 py-1.5 text-center" style={{ ...CELL_STYLE, background: 'var(--ash-light, #f4f4f5)' }}>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--ash)' }}>
                        <Coffee size={12} />
                        Receso
                      </span>
                    </td>
                  ) : (
                    DIAS.map((dia, i) => {
                      const bloque = fila.celdas[i];
                      const clase = bloque ? getClaseEnBloque(bloque.id) : null;
                      return (
                        <td key={dia} className="px-2 py-1.5 text-center" style={CELL_STYLE}>
                          <CeldaDroppable
                            bloque={bloque}
                            clase={clase}
                            cellKey={`${dia}-${fila.hora}`}
                            onCeldaClick={onCeldaClick}
                            onEditarClase={onEditarClase}
                            onTogglePin={onTogglePin}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </DndContext>
  );
};
