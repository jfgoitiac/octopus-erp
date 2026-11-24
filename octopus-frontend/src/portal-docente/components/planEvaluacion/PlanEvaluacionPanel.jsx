import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../../../utils/datepickerPortal';
import {
  AlertTriangle, ClipboardList, Plus, Trash2, Save, Loader2, Pencil, X, Layers,
} from 'lucide-react';

import { useDocentePlanEvaluacion } from '../../hooks/useDocentePlanEvaluacion';
import SkeletonCard from '../../../portal/components/SkeletonCard';
import { Modal } from '../../../components/ui/Modal';
import {
  construirPayloadPlan,
  fechaFueraDelLapso,
  fechaInicialParaLapso,
  obtenerTotalCanonicoVisible,
} from './planEvaluacion.utils';

const nuevoId = () => `tmp-${Math.random().toString(36).slice(2)}${Date.now()}`;

const nuevoItem = (fechaInicio, fechaFin) => ({
  id: nuevoId(),
  nombre: '',
  fecha: fechaInicialParaLapso(format(new Date(), 'yyyy-MM-dd'), fechaInicio, fechaFin),
  valor_maximo: '',
  orden: 0,
});

const nuevoBloque = (fechaInicio, fechaFin) => ({
  id: nuevoId(),
  nombre: '',
  total_puntos: '',
  modo: 'puntos',
  orden: 0,
  items: [nuevoItem(fechaInicio, fechaFin)],
});

export default function PlanEvaluacionPanel({
  materiaId, lapsoId, tipoEvaluacion, lapsoActivo, fechaInicio, fechaFin,
}) {
  const esLiteral = tipoEvaluacion === 'literal';
  const {
    plan, loadingPlan, savingPlan, guardarPlan, refetchPlan,
    conflictoPlan, limpiarConflictoPlan,
    conflictoVersion, limpiarConflictoVersion,
    alumnos, loadingNotas, savingNotas, guardarNotas,
  } = useDocentePlanEvaluacion(materiaId, lapsoId);

  // ── Builder de bloques/ítems ────────────────────────────────────────────
  const [editando, setEditando] = useState(false);
  const [bloquesForm, setBloquesForm] = useState([]);

  useEffect(() => {
    if (editando) return; // no pisar cambios en curso
    if (plan?.bloques?.length) {
      setBloquesForm(plan.bloques.map(b => ({
        ...b,
        items: (b.items || []).map(it => ({ ...it })),
      })));
    } else {
      setBloquesForm([]);
    }
  }, [plan, editando]);

  const iniciarEdicion = () => {
    setBloquesForm(plan?.bloques?.length
      ? plan.bloques.map(b => ({ ...b, items: (b.items || []).map(it => ({ ...it })) }))
      : [nuevoBloque(fechaInicio, fechaFin)]);
    setEditando(true);
  };

  const cancelarEdicion = () => setEditando(false);

  const agregarBloque = () => setBloquesForm(prev => [...prev, nuevoBloque(fechaInicio, fechaFin)]);
  const quitarBloque = (bloqueId) => setBloquesForm(prev => prev.filter(b => b.id !== bloqueId));
  const cambiarBloque = (bloqueId, campo, valor) =>
    setBloquesForm(prev => prev.map(b => (b.id !== bloqueId ? b : { ...b, [campo]: valor })));

  const agregarItem = (bloqueId) =>
    setBloquesForm(prev => prev.map(b => (b.id !== bloqueId ? b : {
      ...b,
      items: [...b.items, nuevoItem(fechaInicio, fechaFin)],
    })));
  const quitarItem = (bloqueId, itemId) =>
    setBloquesForm(prev => prev.map(b => (b.id !== bloqueId ? b : { ...b, items: b.items.filter(it => it.id !== itemId) })));
  const cambiarItem = (bloqueId, itemId, campo, valor) =>
    setBloquesForm(prev => prev.map(b => (b.id !== bloqueId ? b : {
      ...b,
      items: b.items.map(it => (it.id !== itemId ? it : { ...it, [campo]: valor })),
    })));

  const handleGuardarPlan = async () => {
    if (!bloquesForm.length) { toast.warning('Agrega al menos un bloque.'); return; }
    for (const b of bloquesForm) {
      if (!b.nombre.trim()) { toast.warning('Todos los bloques deben tener nombre.'); return; }
      if (!b.items.length) { toast.warning(`El bloque "${b.nombre}" necesita al menos un ítem.`); return; }
      for (const it of b.items) {
        if (!it.nombre.trim()) { toast.warning('Todos los ítems deben tener nombre.'); return; }
        if (fechaFueraDelLapso(it.fecha, fechaInicio, fechaFin)) {
          toast.warning(`La fecha de "${it.nombre}" debe estar dentro del lapso.`);
          return;
        }
        if (!esLiteral && Number(it.valor_maximo) <= 0) {
          toast.warning(`El ítem "${it.nombre}" necesita una nota máxima mayor que cero.`);
          return;
        }
      }
    }

    const payload = construirPayloadPlan(bloquesForm, esLiteral);

    const resultado = await guardarPlan(payload);
    if (resultado.ok) setEditando(false);
  };

  const recargarTrasConflicto = async () => {
    await refetchPlan();
    limpiarConflictoVersion();
    setEditando(false);
    toast.info('Plan actualizado con la versión más reciente. Revisa los cambios antes de editar nuevamente.');
  };

  // ── Notas por alumno ─────────────────────────────────────────────────────
  const [notasLocal, setNotasLocal] = useState([]);
  const [dirtyNotas, setDirtyNotas] = useState(false);
  // Set de "alumnoId-itemId" que fallaron en el último guardado — se limpia
  // al editar la celda de nuevo o al reintentar guardar.
  const [celdasConError, setCeldasConError] = useState(() => new Set());

  useEffect(() => {
    if (dirtyNotas) return;
    setNotasLocal(alumnos.map(al => ({
      alumno_id: al.alumno_id,
      alumno_nombre: al.alumno_nombre,
      // La autoridad del total es el motor canónico del backend. No se deriva
      // de las celdas porque también intervienen pesos y aportes externos.
      total_canonico: al.resultado?.valor_provisional ?? al.total ?? null,
      pendiente: false,
      valores: (al.bloques || []).reduce((acc, b) => {
        (b.notas_items || []).forEach(ni => {
          acc[ni.item_id] = esLiteral ? (ni.valor_letra ?? '') : (ni.valor_numerico ?? '');
        });
        return acc;
      }, {}),
    })));
  }, [alumnos, dirtyNotas, esLiteral]);

  const bloquesPlan = useMemo(() => plan?.bloques || [], [plan]);

  const handleValorChange = useCallback((alumnoId, itemId, valor) => {
    setDirtyNotas(true);
    setNotasLocal(prev => prev.map(al => (al.alumno_id !== alumnoId
      ? al
      : { ...al, pendiente: true, valores: { ...al.valores, [itemId]: valor } })));
    setCeldasConError(prev => {
      if (!prev.has(`${alumnoId}-${itemId}`)) return prev;
      const next = new Set(prev);
      next.delete(`${alumnoId}-${itemId}`);
      return next;
    });
  }, []);

  const handleGuardarNotas = async () => {
    const notas = [];
    notasLocal.forEach(al => {
      Object.entries(al.valores).forEach(([itemId, valor]) => {
        if (valor === '' || valor === null || valor === undefined) return;
        notas.push({
          item_id: isNaN(Number(itemId)) ? itemId : Number(itemId),
          alumno_id: al.alumno_id,
          ...(esLiteral ? { valor_letra: valor } : { valor_numerico: Number(valor) }),
        });
      });
    });
    if (!notas.length) { toast.warning('No hay notas para guardar.'); return; }
    const { ok, errores } = await guardarNotas(notas);
    setCeldasConError(new Set(errores.map(e => `${e.alumno_id}-${e.item_id}`)));
    if (ok) setDirtyNotas(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loadingPlan) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    );
  }

  if (!plan && !editando) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-10 text-center text-[var(--ash)]">
        <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm mb-4">Todavía no hay un plan de evaluación para este lapso.</p>
        <button
          onClick={iniciarEdicion}
          disabled={!lapsoActivo}
          className="inline-flex items-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-2.5 px-4 rounded-xl text-sm min-h-[44px]"
        >
          <Plus size={16} /> Crear plan de evaluación
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editando ? (
        <BuilderPlan
          bloques={bloquesForm}
          esLiteral={esLiteral}
          plan={plan}
          saving={savingPlan}
          lapsoActivo={lapsoActivo}
          onAgregarBloque={agregarBloque}
          onQuitarBloque={quitarBloque}
          onCambiarBloque={cambiarBloque}
          onAgregarItem={agregarItem}
          onQuitarItem={quitarItem}
          onCambiarItem={cambiarItem}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onGuardar={handleGuardarPlan}
          onCancelar={plan ? cancelarEdicion : null}
        />
      ) : (
        <>
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--jet)] flex items-center gap-1.5">
                <Layers size={15} className="text-[var(--docente-primary)]" /> Bloques del plan
              </h3>
              <button
                onClick={iniciarEdicion}
                disabled={!lapsoActivo}
                className="flex items-center gap-1 text-xs font-medium text-[var(--docente-primary)] min-h-[36px] px-2"
              >
                <Pencil size={13} /> Editar plan
              </button>
            </div>
            <div className="space-y-2">
              {bloquesPlan.map(b => (
                <div key={b.id} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-sm font-semibold text-[var(--jet-mid)]">{b.nombre}</span>
                    {!esLiteral && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--jet-mid)]">
                        {b.total_puntos} pts · {b.modo === 'promedio' ? 'promedio' : 'suma'}
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {(b.items || []).map(it => (
                      <li key={it.id} className="flex items-center justify-between text-xs text-[var(--ash)]">
                        <span>{it.nombre}</span>
                        <span className="flex items-center gap-2">
                          {it.fecha && (
                            <span>{format(parseISO(it.fecha), "dd 'de' MMM", { locale: es })}</span>
                          )}
                          {!esLiteral && it.valor_maximo != null && it.valor_maximo !== '' && (
                            <span className="font-medium text-[var(--jet-mid)]">{it.valor_maximo} pts</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <TablaNotasPlan
            bloques={bloquesPlan}
            notasLocal={notasLocal}
            loading={loadingNotas}
            esLiteral={esLiteral}
            lapsoActivo={lapsoActivo}
            celdasConError={celdasConError}
            onValorChange={handleValorChange}
          />

          <button
            onClick={handleGuardarNotas}
            disabled={savingNotas || !dirtyNotas || !notasLocal.length || !lapsoActivo}
            className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {savingNotas ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {savingNotas ? 'Guardando...' : 'Guardar notas'}
          </button>
        </>
      )}

      <Modal
        open={Boolean(conflictoPlan)}
        onClose={limpiarConflictoPlan}
        size="sm"
        titulo={<><AlertTriangle size={18} aria-hidden="true" /> Cambio bloqueado</>}
        footer={(
          <button
            type="button"
            onClick={limpiarConflictoPlan}
            className="min-h-[44px] w-full rounded-xl bg-[var(--docente-primary)] px-4 text-sm font-semibold text-white sm:w-auto"
          >
            Volver al plan
          </button>
        )}
      >
        <div className="space-y-3 text-sm text-[var(--jet-mid)]">
          <p>No se aplicó ningún cambio porque eliminaría ítems que ya tienen calificaciones. Conserva esos ítems o consulta con coordinación para archivar una versión del plan.</p>
          <p className="font-semibold text-[var(--jet)]">
            {conflictoPlan?.total_notas ?? 0} nota{conflictoPlan?.total_notas === 1 ? '' : 's'} protegida{conflictoPlan?.total_notas === 1 ? '' : 's'}
            {conflictoPlan?.total_alumnos ? ` de ${conflictoPlan.total_alumnos} alumno${conflictoPlan.total_alumnos === 1 ? '' : 's'}` : ''}
          </p>
          {Array.isArray(conflictoPlan?.items) && conflictoPlan.items.length > 0 && (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[var(--surface-sunken)] p-3" aria-label="Ítems protegidos">
              {conflictoPlan.items.map(item => (
                <li key={item.id} className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 break-words">{item.nombre || `Ítem ${item.id}`}</span>
                  <span className="shrink-0 font-semibold">{item.notas_afectadas ?? 0} notas</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(conflictoVersion)}
        onClose={limpiarConflictoVersion}
        size="sm"
        titulo={<><AlertTriangle size={18} aria-hidden="true" /> El plan cambió</>}
        footer={(
          <>
            <button
              type="button"
              onClick={limpiarConflictoVersion}
              className="min-h-[44px] w-full rounded-xl px-4 text-sm font-medium text-[var(--jet-mid)] hover:bg-[var(--ash-light)] sm:w-auto"
            >
              Seguir revisando
            </button>
            <button
              type="button"
              onClick={recargarTrasConflicto}
              className="min-h-[44px] w-full rounded-xl bg-[var(--docente-primary)] px-4 text-sm font-semibold text-white sm:w-auto"
            >
              Recargar versión reciente
            </button>
          </>
        )}
      >
        <div className="space-y-3 text-sm text-[var(--jet-mid)]">
          <p>Otra persona guardó cambios mientras editabas. No sobrescribimos su trabajo ni aplicamos el tuyo.</p>
          <p>Al recargar verás la versión {conflictoVersion?.current_version ?? 'más reciente'}. Revisa las diferencias y vuelve a aplicar solamente los cambios necesarios.</p>
        </div>
      </Modal>
    </div>
  );
}

// ── Builder de bloques/ítems ───────────────────────────────────────────────
function BuilderPlan({
  bloques, esLiteral, plan, saving, lapsoActivo,
  fechaInicio, fechaFin,
  onAgregarBloque, onQuitarBloque, onCambiarBloque,
  onAgregarItem, onQuitarItem, onCambiarItem,
  onGuardar, onCancelar,
}) {
  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--jet)]">
          {plan ? 'Editar plan de evaluación' : 'Nuevo plan de evaluación'}
        </h3>
        {onCancelar && (
          <button onClick={onCancelar} className="text-[var(--ash)] min-h-[36px] px-1" aria-label="Cancelar edición">
            <X size={16} />
          </button>
        )}
      </div>

      {!lapsoActivo && (
        <p className="text-xs font-medium text-[var(--yellow)] bg-[var(--yellow-light)] rounded-lg px-3 py-2">
          Este lapso está cerrado — puedes revisar el plan, pero no guardar cambios.
        </p>
      )}

      {bloques.map(b => (
        <div key={b.id} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <label htmlFor={`bloque-nombre-${b.id}`} className="block text-[11px] font-medium text-[var(--ash)] mb-1">Nombre del bloque</label>
              <input
                id={`bloque-nombre-${b.id}`}
                type="text"
                placeholder="Ej: Contenido, Actitudinal..."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={b.nombre}
                onChange={e => onCambiarBloque(b.id, 'nombre', e.target.value)}
                disabled={!lapsoActivo}
              />
            </div>
            <button
              onClick={() => onQuitarBloque(b.id)}
              disabled={!lapsoActivo}
              className="mt-6 text-[var(--red)] hover:text-[var(--red)] min-h-[36px] px-1"
              aria-label="Eliminar bloque"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {!esLiteral && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label htmlFor={`bloque-total-${b.id}`} className="block text-[11px] font-medium text-[var(--ash)] mb-1">Total de puntos</label>
                <input
                  id={`bloque-total-${b.id}`}
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                  value={b.total_puntos}
                  onChange={e => onCambiarBloque(b.id, 'total_puntos', e.target.value)}
                  disabled={!lapsoActivo}
                />
              </div>
              <div>
                <label htmlFor={`bloque-modo-${b.id}`} className="block text-[11px] font-medium text-[var(--ash)] mb-1">Modo</label>
                <select
                  id={`bloque-modo-${b.id}`}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                  value={b.modo}
                  onChange={e => onCambiarBloque(b.id, 'modo', e.target.value)}
                  disabled={!lapsoActivo}
                >
                  <option value="puntos">Suma de puntos</option>
                  <option value="promedio">Promedio</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-[var(--ash)]">Ítems</label>
            {b.items.map(it => (
              <div key={it.id} className="flex items-start gap-2 bg-[var(--surface-sunken)] rounded-lg p-2">
                <div className="flex-1 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Nombre del ítem (ej: Exposición)"
                    className="w-full border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                    value={it.nombre}
                    onChange={e => onCambiarItem(b.id, it.id, 'nombre', e.target.value)}
                    disabled={!lapsoActivo}
                  />
                  <div className="flex gap-1.5">
                    <DatePicker
                      selected={it.fecha ? parseISO(it.fecha) : null}
                      onChange={date => onCambiarItem(b.id, it.id, 'fecha', date ? format(date, 'yyyy-MM-dd') : '')}
                      disabled={!lapsoActivo}
                      minDate={fechaInicio ? parseISO(fechaInicio) : undefined}
                      maxDate={fechaFin ? parseISO(fechaFin) : undefined}
                      locale={es}
                      dateFormat="dd/MM/yyyy"
                      wrapperClassName="flex-1"
                      popperContainer={datepickerPopperContainer}
                      customInput={
                        <input className="w-full border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30" />
                      }
                    />
                    {!esLiteral && (
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder={b.modo === 'promedio' ? 'Nota máx.' : 'Pts máx.'}
                        aria-label={b.modo === 'promedio' ? `Nota máxima de ${it.nombre || 'ítem'}` : `Puntos máximos de ${it.nombre || 'ítem'}`}
                        className="w-24 border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                        value={it.valor_maximo}
                        onChange={e => onCambiarItem(b.id, it.id, 'valor_maximo', e.target.value)}
                        disabled={!lapsoActivo}
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onQuitarItem(b.id, it.id)}
                  disabled={!lapsoActivo}
                  className="text-[var(--red)] hover:text-[var(--red)] min-h-[36px] px-1"
                  aria-label="Eliminar ítem"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={() => onAgregarItem(b.id)}
              disabled={!lapsoActivo}
              className="flex items-center gap-1 text-xs font-medium text-[var(--docente-primary)] min-h-[36px]"
            >
              <Plus size={13} /> Agregar ítem
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={onAgregarBloque}
        disabled={!lapsoActivo}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-[var(--border-md)] text-[var(--ash)] py-2.5 rounded-xl text-sm min-h-[44px]"
      >
        <Plus size={15} /> Agregar bloque
      </button>

      <button
        onClick={onGuardar}
        disabled={saving || !lapsoActivo}
        className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-50 min-h-[44px]"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'Guardando...' : 'Guardar plan de evaluación'}
      </button>
    </div>
  );
}

// ── Tabla de carga de notas por alumno ──────────────────────────────────────
function TablaNotasPlan({ bloques, notasLocal, loading, esLiteral, lapsoActivo, celdasConError, onValorChange }) {
  const items = bloques.flatMap(b => (b.items || []).map(it => ({ ...it, bloqueId: b.id, modo: b.modo })));

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
      </div>
    );
  }

  if (!notasLocal.length) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 text-center text-[var(--ash)]">
        <p className="text-sm">No hay alumnos registrados en esta sección.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--surface-sunken)]">
              <th className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--ash)] sticky left-0 bg-[var(--surface-sunken)]">Alumno</th>
              {items.map(it => (
                <th key={it.id} className="px-2 py-2.5 text-xs uppercase tracking-wide text-[var(--ash)] whitespace-nowrap">
                  {it.nombre}
                </th>
              ))}
              {!esLiteral && <th className="px-3 py-2.5 text-xs uppercase tracking-wide text-[var(--ash)]">Total</th>}
            </tr>
          </thead>
          <tbody>
            {notasLocal.map(al => (
              <tr key={al.alumno_id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-sm font-medium text-[var(--jet-mid)] whitespace-nowrap sticky left-0 bg-[var(--surface)]">
                  {al.alumno_nombre}
                </td>
                {items.map(it => {
                  const tieneError = celdasConError?.has(`${al.alumno_id}-${it.id}`);
                  const claseError = tieneError ? 'border-[var(--red)] ring-1 ring-[var(--red)]' : 'border-[var(--border)]';
                  return (
                  <td key={it.id} className="px-2 py-2">
                    {esLiteral ? (
                      <select
                        className={`w-14 border rounded-lg px-1 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 ${claseError}`}
                        value={al.valores[it.id] ?? ''}
                        onChange={e => onValorChange(al.alumno_id, it.id, e.target.value)}
                        disabled={!lapsoActivo}
                        title={tieneError ? 'No se pudo guardar esta nota — revisa el valor e intenta de nuevo.' : undefined}
                      >
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max={it.valor_maximo || undefined}
                        step="0.25"
                        placeholder="—"
                        className={`w-16 border rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 ${claseError}`}
                        title={tieneError ? 'No se pudo guardar esta nota — revisa el valor e intenta de nuevo.' : undefined}
                        value={al.valores[it.id] ?? ''}
                        onChange={e => onValorChange(al.alumno_id, it.id, e.target.value)}
                        disabled={!lapsoActivo}
                      />
                    )}
                  </td>
                  );
                })}
                {!esLiteral && (
                  <td className="px-3 py-2 text-sm font-bold text-[var(--jet-mid)]">
                    {al.pendiente
                      ? <span className="text-xs font-medium text-amber-700">Sin guardar</span>
                      : obtenerTotalCanonicoVisible(al) ?? '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
