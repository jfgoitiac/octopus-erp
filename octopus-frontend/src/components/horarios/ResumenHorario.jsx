import { AlertTriangle, CalendarCheck2, CircleAlert, UserRound } from 'lucide-react';

export const ResumenHorario = ({ bloques, horarios, materias, modoDocente = false }) => {
  const bloquesClase = bloques.filter(bloque => bloque.tipo === 'clase');
  const planificados = materias.reduce((total, materia) => total + Number(materia.horas_academicas || 0), 0);
  const pendientes = Math.max(0, planificados - horarios.length);
  const sinEspacio = pendientes > 0 && horarios.length >= bloquesClase.length;
  const sinDocente = materias.filter(materia => !materia.docente_id && !materia.docente?.id).length;
  const tarjetas = modoDocente ? [
    { etiqueta: 'Bloques asignados', valor: `${horarios.length}/${bloquesClase.length}`, icono: CalendarCheck2, tono: 'var(--pb)' },
    { etiqueta: 'Bloques libres', valor: Math.max(0, bloquesClase.length - horarios.length), icono: CircleAlert, tono: 'var(--ash)' },
    { etiqueta: 'Materias a cuadrar', valor: materias.length, icono: UserRound, tono: 'var(--pb)' },
  ] : [
    { etiqueta: 'Bloques asignados', valor: `${horarios.length}/${bloquesClase.length}`, icono: CalendarCheck2, tono: 'var(--pb)' },
    { etiqueta: sinEspacio ? 'Horas sin espacio' : 'Horas por ubicar', valor: pendientes, icono: CircleAlert, tono: pendientes ? '#b45309' : '#16a34a' },
    { etiqueta: 'Materias sin docente', valor: sinDocente, icono: UserRound, tono: sinDocente ? 'var(--red)' : '#16a34a' },
  ];
  return <section className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 print:hidden" aria-label="Resumen del horario">
    {tarjetas.map(({ etiqueta, valor, icono: Icono, tono }) => <div key={etiqueta} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <span className="p-1.5 rounded-lg" style={{ background: 'var(--ash-light)', color: tono }}><Icono size={15} /></span>
      <div><p className="text-sm font-bold" style={{ color: 'var(--jet)' }}>{valor}</p><p className="text-[11px]" style={{ color: 'var(--ash)' }}>{etiqueta}</p></div>
    </div>)}
    {!modoDocente && pendientes > 0 && <p className="sm:col-span-3 flex items-center gap-1.5 text-xs px-1" style={{ color: '#92400e' }}><AlertTriangle size={13} /> {sinEspacio ? `La grilla está llena: la carga semanal suma ${planificados} h para ${bloquesClase.length} bloques. Agrega bloques o ajusta las horas de las materias.` : 'Quedan horas por ubicar según la carga semanal de las materias.'}</p>}
  </section>;
};
