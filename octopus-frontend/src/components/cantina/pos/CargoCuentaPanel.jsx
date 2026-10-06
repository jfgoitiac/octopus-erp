import { UserRound, AlertTriangle, RotateCcw } from 'lucide-react';
import BuscadorRepresentanteCxc from '../cxc/BuscadorRepresentanteCxc';
import { evaluarCredito } from './evaluarCredito';

/**
 * Bloque "Cargar a cuenta" del POS (CxC): busca al representante, muestra su
 * saldo/límite y deja elegir qué alumno consumió. La decisión de bloquear el
 * cobro la toma CantinaPOS con `evaluarCredito` (misma función); este
 * componente solo muestra el motivo.
 */

export default function CargoCuentaPanel({
  representante, onSeleccionar, onCambiar, alumnoId, onCambiarAlumno, totalUsd, disabled,
}) {
  if (!representante) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
          Representante responsable del cargo
        </p>
        <BuscadorRepresentanteCxc onSelect={onSeleccionar} placeholder="Nombre, cédula o alumno…" />
      </div>
    );
  }

  const ev = evaluarCredito(representante, totalUsd);
  const alumnos = representante.alumnos ?? [];

  return (
    <div className="space-y-3 rounded-xl p-3 sm:p-4" style={{ border: '1.5px solid var(--pb, #0fa3b1)', background: 'var(--pb-light, #e6f7f9)' }}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
          style={{ background: '#fff', color: 'var(--pb-mid, #0c7a86)' }}
        >
          <UserRound size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--jet)' }}>
            {`${representante.nombre ?? ''} ${representante.apellido ?? ''}`.trim()}
          </p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>C.I. {representante.cedula}</p>
        </div>
        <button
          type="button"
          onClick={onCambiar}
          disabled={disabled}
          className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg min-h-[32px]"
          style={{ color: 'var(--pb-mid, #0c7a86)' }}
        >
          <RotateCcw size={12} /> Cambiar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Deuda actual</p>
          <p className="font-semibold" style={{ color: ev.saldo > 0 ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
            ${Number(representante.saldo_usd ?? 0).toFixed(2)}
            <span className="text-xs font-normal" style={{ color: 'var(--ash)' }}> / límite ${Number(representante.limite_usd ?? 0).toFixed(2)}</span>
          </p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Deuda después</p>
          <p className="font-semibold" style={{ color: ev.ok ? 'var(--jet)' : 'var(--red, #dc2626)' }}>
            ${Number(ev.saldoDespues ?? ev.saldo ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      {!ev.ok && (
        <p className="flex items-start gap-1.5 text-sm font-medium rounded-lg px-3 py-2" style={{ color: 'var(--red, #dc2626)', background: '#fef2f2' }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {ev.motivo}
        </p>
      )}

      <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          Alumno que consumió
        </label>
        <select
          value={alumnoId}
          onChange={e => onCambiarAlumno(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
        >
          <option value="">Sin especificar</option>
          {alumnos.map(a => (
            <option key={a.id} value={a.id}>
              {`${a.nombre} ${a.apellido}`.trim()}{a.grado_seccion ? ` — ${a.grado_seccion}` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
