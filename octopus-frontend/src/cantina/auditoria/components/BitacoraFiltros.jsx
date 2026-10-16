import { useId, useState } from 'react';
import { Check, ChevronDown, ListFilter, RotateCcw } from 'lucide-react';
import { ESTILO_CAMPO, ESTILO_TARJETA } from './CierreFormato';
import { CLASE_CAMPO, CLASE_ETIQUETA, TIPOS_EVENTO } from './BitacoraFormato';
import BitacoraRangoFechas from './BitacoraRangoFechas';

// Barra de filtros de la bitácora (§5 GET bitacora/).
// filtros: { fecha_inicio, fecha_fin, tipos: string[], usuario, area }
// El selector de tipos se despliega dentro de la tarjeta (no como popover)
// para que en el celular no quede recortado ni tape la lista.
export default function BitacoraFiltros({ filtros, usuarios, onCambio, onLimpiar }) {
  const id = useId();
  const [tiposAbiertos, setTiposAbiertos] = useState(false);
  const cambiar = (campo) => (valor) => onCambio({ ...filtros, [campo]: valor });

  const alternarTipo = (valor) => {
    const tipos = filtros.tipos.includes(valor)
      ? filtros.tipos.filter((t) => t !== valor)
      : [...filtros.tipos, valor];
    onCambio({ ...filtros, tipos });
  };

  const resumenTipos = filtros.tipos.length === 0
    ? 'Todos'
    : filtros.tipos.length === 1
      ? (TIPOS_EVENTO.find((t) => t.valor === filtros.tipos[0])?.etiqueta ?? '1 tipo')
      : `${filtros.tipos.length} tipos`;

  return (
    <div className="rounded-2xl p-3 sm:p-4 flex flex-col gap-3" style={ESTILO_TARJETA}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
        <BitacoraRangoFechas
          idBase={`${id}-bitacora`}
          desde={filtros.fecha_inicio}
          hasta={filtros.fecha_fin}
          onCambio={(rango) => onCambio({ ...filtros, ...rango })}
        />
        <div>
          <span id={`${id}-tipos-etq`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Tipo de evento</span>
          <button
            type="button"
            onClick={() => setTiposAbiertos((v) => !v)}
            aria-expanded={tiposAbiertos}
            aria-controls={`${id}-tipos`}
            aria-labelledby={`${id}-tipos-etq`}
            className={`${CLASE_CAMPO} inline-flex items-center justify-between gap-2 text-left`}
            style={ESTILO_CAMPO}
          >
            <span className="truncate">{resumenTipos}</span>
            <ChevronDown size={16} aria-hidden="true" className={`shrink-0 transition-transform ${tiposAbiertos ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <div>
          <label htmlFor={`${id}-usuario`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Usuario</label>
          <select id={`${id}-usuario`} value={filtros.usuario} onChange={(e) => cambiar('usuario')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={String(u.id)}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-area`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Área</label>
          <select id={`${id}-area`} value={filtros.area} onChange={(e) => cambiar('area')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
            <option value="">Ambas</option>
            <option value="cantina">Cantina</option>
            <option value="libreria">Librería</option>
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

      {tiposAbiertos && (
        <fieldset id={`${id}-tipos`} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border)' }}>
          <legend className="sr-only">Tipos de evento</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--ash)' }}>
              <ListFilter size={14} aria-hidden="true" />
              Marca uno o varios; sin marcar se muestran todos.
            </p>
            {filtros.tipos.length > 0 && (
              <button
                type="button"
                onClick={() => cambiar('tipos')([])}
                className="self-start sm:self-auto min-h-[36px] px-2.5 rounded-lg text-xs font-medium hover:bg-[var(--jet-light)]"
                style={{ color: 'var(--pb-mid)' }}
              >
                Quitar selección
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {TIPOS_EVENTO.map((t) => {
              const activo = filtros.tipos.includes(t.valor);
              return (
                <button
                  key={t.valor}
                  type="button"
                  role="checkbox"
                  aria-checked={activo}
                  onClick={() => alternarTipo(t.valor)}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full text-xs font-medium transition-colors"
                  style={activo
                    ? { background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px solid var(--pb)' }
                    : { background: '#fff', color: 'var(--jet-mid)', border: '0.5px solid var(--border-md)' }}
                >
                  {activo && <Check size={13} aria-hidden="true" />}
                  {t.etiqueta}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
