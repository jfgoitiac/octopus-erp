import { Coffee, Flag } from 'lucide-react';
import { DIAS, DIAS_GENERADOR } from '../../constants/horarios';

const bloquesPorHora = (bloques) => [...new Set(bloques.map(b => b.hora_inicio))].sort().map(hora => {
  const celdas = DIAS_GENERADOR.map(dia => bloques.find(b => b.dia_semana === dia.value && b.hora_inicio === hora) || null);
  const existentes = celdas.filter(Boolean);
  const tipoGeneral = existentes.length && existentes.every(b => b.tipo === existentes[0].tipo) && existentes[0].tipo !== 'clase'
    ? existentes[0].tipo
    : null;
  return { hora, horaFin: existentes[0]?.hora_fin || '', celdas, tipoGeneral };
});

/** Versión semántica, limpia y exclusiva para papel. */
export const VistaImpresionHorario = ({ bloques, horarios, encabezado }) => {
  const porBloque = new Map(horarios.map(horario => [horario.bloque_id, horario]));
  return (
    <section className="hidden print:block horario-impresion">
      <header className="mb-5 border-b-2 pb-3" style={{ borderColor: 'var(--jet)' }}>
        <h1 className="text-xl font-bold">{encabezado.titulo}</h1>
        {encabezado.subtitulo && <p className="mt-1 text-sm">{encabezado.subtitulo}</p>}
        <p className="mt-1 text-xs">{encabezado.detalle}</p>
      </header>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border p-2 text-left">Hora</th>
            {DIAS.map(dia => <th key={dia} className="border p-2 text-center">{dia}</th>)}
          </tr>
        </thead>
        <tbody>
          {bloquesPorHora(bloques).map(fila => (
            <tr key={fila.hora}>
              <td className="border p-2 font-medium whitespace-nowrap">{fila.hora}{fila.horaFin ? ` – ${fila.horaFin}` : ''}</td>
              {fila.tipoGeneral ? (
                <td colSpan={DIAS.length} className="border p-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {fila.tipoGeneral === 'inicio' ? <Flag size={12} /> : <Coffee size={12} />}
                    {fila.tipoGeneral === 'inicio' ? 'Inicio / entonación del himno' : 'Receso'}
                  </span>
                </td>
              ) : fila.celdas.map((bloque, index) => {
                const clase = bloque ? porBloque.get(bloque.id) : null;
                return <td key={DIAS[index]} className="border p-2 align-top text-center">{clase && <><strong className="block">{clase.materia?.nombre}</strong>{clase.aula && <span>{clase.aula}</span>}{clase.materia?.grado_seccion && <span className="block text-[10px]">{clase.materia.grado_seccion}</span>}</>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[10px]">Impreso el {new Date().toLocaleDateString('es-VE')}</p>
    </section>
  );
};
