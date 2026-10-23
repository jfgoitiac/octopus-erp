import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BellRing, ScrollText, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import BitacoraTab from '../components/BitacoraTab';
import AlertaTab from '../components/AlertaTab';
import ParametrosFormulario from '../components/ParametrosFormulario';

const PESTANAS = [
  { id: 'bitacora', texto: 'Bitácora', icono: ScrollText },
  { id: 'alertas', texto: 'Alertas', icono: BellRing },
  { id: 'parametros', texto: 'Parámetros', icono: SlidersHorizontal },
];

// Carril Fase 2 · F5 — bitácora, alertas y parámetros (CONTRATO §5–§7).
// La pestaña vive en la URL (?tab=) para que el panel y las alertas puedan
// enlazar directo; la bitácora acepta además ?usuario= y ?objeto_tipo=&objeto_id=.
const AuditoriaBitacora = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabUrl = searchParams.get('tab');
  const activa = PESTANAS.some((p) => p.id === tabUrl) ? tabUrl : 'bitacora';

  const objetoTipo = searchParams.get('objeto_tipo');
  const objetoId = searchParams.get('objeto_id');
  const usuario = searchParams.get('usuario') ?? '';
  const objeto = useMemo(
    () => (objetoTipo && objetoId ? { tipo: objetoTipo, id: objetoId } : null),
    [objetoTipo, objetoId],
  );

  const cambiarPestana = (id) => setSearchParams(id === 'bitacora' ? {} : { tab: id });
  const quitarObjeto = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('objeto_tipo');
    next.delete('objeto_id');
    setSearchParams(next, { replace: true });
  };

  const alTeclear = (e, indice) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const paso = e.key === 'ArrowRight' ? 1 : -1;
    const siguiente = PESTANAS[(indice + paso + PESTANAS.length) % PESTANAS.length];
    cambiarPestana(siguiente.id);
    document.getElementById(`auditoria-tab-${siguiente.id}`)?.focus();
  };

  return (
    <div className="w-full max-w-7xl min-w-0 mx-auto flex flex-col gap-4">
      <PageHeader
        titulo="Bitácora y alertas"
        descripcion="Acciones críticas registradas, alertas automáticas y sus umbrales."
      />

      <div
        role="tablist"
        aria-label="Secciones de la bitácora"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl w-full sm:w-auto sm:self-start"
        style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }}
      >
        {PESTANAS.map((p, i) => {
          const seleccionada = p.id === activa;
          const Icono = p.icono;
          return (
            <button
              key={p.id}
              id={`auditoria-tab-${p.id}`}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              aria-controls={`auditoria-panel-${p.id}`}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => cambiarPestana(p.id)}
              onKeyDown={(e) => alTeclear(e, i)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              style={seleccionada
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,0.10)' }
                : { color: 'var(--jet-mid)' }}
            >
              <Icono size={16} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{p.texto}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`auditoria-panel-${activa}`}
        role="tabpanel"
        aria-labelledby={`auditoria-tab-${activa}`}
        className="min-w-0"
      >
        {activa === 'bitacora' && (
          <BitacoraTab
            key={`${usuario}|${objeto?.tipo ?? ''}|${objeto?.id ?? ''}`}
            objeto={objeto}
            usuarioInicial={usuario}
            onQuitarObjeto={quitarObjeto}
          />
        )}
        {activa === 'alertas' && <AlertaTab />}
        {activa === 'parametros' && <ParametrosFormulario />}
      </div>
    </div>
  );
};

export default AuditoriaBitacora;
