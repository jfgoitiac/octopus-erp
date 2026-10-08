import { Plus } from 'lucide-react';
import { DIAS_GENERADOR, getColor } from '../../constants/horarios';
import { TablaScroll } from '../ui/TablaScroll';

// Matriz de coordinación: cada grupo de columnas es un día y dentro de él
// aparecen todos los grados del paquete. Permite detectar rápidamente huecos
// y cruces entre grados, tal como se haría en una hoja de planificación.
export const VistaHorariosPorDia = ({ bloques = [], grillas = [], escala = 90, onCeldaClick, onEditarClase, soloLectura = false }) => {
  const horas = [...new Set(bloques.map(bloque => bloque.hora_inicio))].sort();
  const bloquePorDiaHora = new Map(bloques.map(bloque => [`${bloque.dia_semana}-${bloque.hora_inicio}`, bloque]));
  const clasesPorGrado = new Map(grillas.map(grilla => [
    grilla.grado,
    new Map(grilla.horarios.filter(clase => clase.bloque_id != null).map(clase => [clase.bloque_id, clase])),
  ]));

  if (!bloques.length) {
    return <p className="text-sm" style={{ color: 'var(--ash)' }}>Configura los bloques del paquete para ver la planificación por día.</p>;
  }
  if (!grillas.length) {
    return <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando los grados del paquete...</p>;
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <TablaScroll>
        <div style={{ zoom: escala / 100 }}>
          <table className="w-full border-collapse text-center" style={{ minWidth: Math.max(900, 105 + (grillas.length * DIAS_GENERADOR.length * 130)) }}>
            <thead>
              <tr>
                <th rowSpan="2" className="sticky left-0 z-20 px-3 py-2 text-[10px] uppercase tracking-wider text-left" style={{ background: 'var(--porcelain)', color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)', boxShadow: '1px 0 0 var(--border-md)' }}>Bloque / hora</th>
                {DIAS_GENERADOR.map(dia => <th key={dia.value} colSpan={grillas.length} className="px-2 py-2 text-[11px] font-bold uppercase tracking-widest" style={{ background: 'var(--pb-light)', color: 'var(--pb)', borderBottom: '0.5px solid var(--border-md)', borderLeft: '2px solid var(--pb)' }}>{dia.label}</th>)}
              </tr>
              <tr>
                {DIAS_GENERADOR.flatMap(dia => grillas.map(grilla => <th key={`${dia.value}-${grilla.grado}`} className="px-2 py-1.5 text-[10px] font-semibold whitespace-nowrap" style={{ background: 'var(--porcelain)', color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)', borderLeft: dia === DIAS_GENERADOR[0] && grilla === grillas[0] ? undefined : '0.5px solid var(--border)' }}>{grilla.grado}</th>))}
              </tr>
            </thead>
            <tbody>
              {horas.map((hora, indice) => (
                <tr key={hora} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="sticky left-0 z-10 px-3 py-2 text-left text-[10px] font-semibold whitespace-nowrap" style={{ background: 'var(--porcelain)', color: 'var(--ash)', boxShadow: '1px 0 0 var(--border-md)' }}>
                    Bloque {indice + 1}<br />{hora}
                  </td>
                  {DIAS_GENERADOR.flatMap(dia => {
                    const bloque = bloquePorDiaHora.get(`${dia.value}-${hora}`);
                    const esGeneral = bloque && bloque.tipo !== 'clase';
                    if (esGeneral) return [
                      <td key={`${dia.value}-${hora}-general`} colSpan={grillas.length} className="px-2 py-2 text-[10px] font-semibold" style={{ background: 'var(--ash-light)', color: 'var(--ash)', borderLeft: '2px solid var(--pb)' }}>
                        {bloque.tipo === 'inicio' ? 'Inicio / entonación del himno' : 'Receso'}
                      </td>,
                    ];
                    return grillas.map((grilla, indiceGrado) => {
                      const clase = bloque ? clasesPorGrado.get(grilla.grado)?.get(bloque.id) : null;
                      return (
                        <td key={`${dia.value}-${hora}-${grilla.grado}`} className="p-1 align-middle" style={{ minWidth: 130, borderLeft: indiceGrado === 0 ? '2px solid var(--pb)' : '0.5px solid var(--border)' }}>
                          {clase ? (
                            soloLectura ? (
                              <div className="w-full rounded px-1.5 py-2 text-left" style={{ background: getColor(clase.materia?.id), color: 'var(--jet)' }}>
                                <span className="block text-[10px] font-bold leading-tight">{clase.materia?.nombre || 'Materia'}</span>
                                {clase.aula && <span className="block mt-0.5 text-[9px] opacity-70">{clase.aula}</span>}
                              </div>
                            ) : (
                            <button type="button" onClick={() => onEditarClase(clase, grilla.materias)} className="w-full rounded px-1.5 py-2 text-left transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]" style={{ background: getColor(clase.materia?.id), color: 'var(--jet)' }}>
                              <span className="block text-[10px] font-bold leading-tight">{clase.materia?.nombre || 'Materia'}</span>
                              {clase.aula && <span className="block mt-0.5 text-[9px] opacity-70">{clase.aula}</span>}
                            </button>
                            )
                          ) : bloque && !soloLectura ? (
                            <button type="button" onClick={() => onCeldaClick(bloque, grilla.materias)} className="flex w-full min-h-10 items-center justify-center rounded border border-dashed transition-colors hover:bg-[var(--pb-light)]" style={{ borderColor: 'var(--border-md)', color: 'var(--ash)' }} aria-label={`Agregar clase a ${grilla.grado}, ${dia.label} ${hora}`}><Plus size={13} className="opacity-45" /></button>
                          ) : <span className="block h-10" />}
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TablaScroll>
    </div>
  );
};
