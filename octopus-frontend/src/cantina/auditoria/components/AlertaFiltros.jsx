import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import { ESTILO_CAMPO, ESTILO_TARJETA } from './CierreFormato';
import { CLASE_CAMPO, CLASE_ETIQUETA, TIPOS_ALERTA } from './BitacoraFormato';
import BitacoraRangoFechas from './BitacoraRangoFechas';

const ESTADOS = [
  { valor: 'abierta', etiqueta: 'Abiertas' },
  { valor: 'atendida', etiqueta: 'Atendidas' },
  { valor: '', etiqueta: 'Todas' },
];

// Filtros de la bandeja de alertas (§6 GET alertas/).
// filtros: { estado, tipo, fecha_inicio, fecha_fin }
export default function AlertaFiltros({ filtros, onCambio, onLimpiar }) {
  const id = useId();
  const cambiar = (campo) => (valor) => onCambio({ ...filtros, [campo]: valor });

  return (
    <div className="rounded-2xl p-3 sm:p-4 flex flex-col gap-3" style={ESTILO_TARJETA}>
      <div role="radiogroup" aria-label="Estado de las alertas" className="grid grid-cols-3 gap-1 p-1 rounded-xl sm:max-w-sm" style={{ background: 'var(--surface-sunken)' }}>
        {ESTADOS.map((e) => {
          const activo = filtros.estado === e.valor;
          return (
            <button
              key={e.valor || 'todas'}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => cambiar('estado')(e.valor)}
              className="min-h-[40px] px-2 rounded-lg text-sm font-medium transition-colors"
              style={activo
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 2px rgba(43,48,58,0.08)' }
                : { color: 'var(--jet-mid)' }}
            >
              {e.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <BitacoraRangoFechas
          idBase={`${id}-alertas`}
          desde={filtros.fecha_inicio}
          hasta={filtros.fecha_fin}
          onCambio={(rango) => onCambio({ ...filtros, ...rango })}
        />
        <div>
          <label htmlFor={`${id}-tipo`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Tipo</label>
          <select id={`${id}-tipo`} value={filtros.tipo} onChange={(e) => cambiar('tipo')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
            <option value="">Todos los tipos</option>
            {TIPOS_ALERTA.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={onLimpiar}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-medium hover:bg-[var(--jet-light)] w-full"
          style={{ color: 'var(--jet-mid)' }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
