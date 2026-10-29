import { useRef, useState } from 'react';
import { Eye, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card } from '../ui/Card';
import { ErrorCampo } from '../ui/ErrorCampo';
import { actualizarPlantillaAviso } from '../../services/comprobantesRevisionService';
import { DATOS_EJEMPLO_AVISO, mensajeError, renderizarPlantilla } from './comprobantesUtils';

const inputStyle = (conError) => ({
  border: `0.5px solid ${conError ? '#dc2626' : 'var(--border-md)'}`,
  background: 'var(--porcelain)',
  color: 'var(--jet)',
});

/**
 * Edición de una plantilla de aviso del portal (asunto + cuerpo). Los botones
 * de token insertan en la posición del cursor del último campo enfocado.
 */
export default function EditorPlantillaAviso({ plantilla, tokens, onGuardada }) {
  const [form, setForm] = useState({ asunto: plantilla.asunto || '', cuerpo: plantilla.cuerpo || '', activa: plantilla.activa !== false });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const asuntoRef = useRef(null);
  const cuerpoRef = useRef(null);
  const ultimoCampo = useRef('cuerpo');
  const seleccion = useRef({ asunto: null, cuerpo: null });

  const modificado = form.asunto !== (plantilla.asunto || '')
    || form.cuerpo !== (plantilla.cuerpo || '')
    || form.activa !== (plantilla.activa !== false);

  function recordarCursor(campo, event) {
    ultimoCampo.current = campo;
    seleccion.current[campo] = { inicio: event.target.selectionStart, fin: event.target.selectionEnd };
  }

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const insertarToken = (token) => {
    const campo = ultimoCampo.current;
    const texto = form[campo];
    const sel = seleccion.current[campo] || { inicio: texto.length, fin: texto.length };
    const nuevo = `${texto.slice(0, sel.inicio)}${token}${texto.slice(sel.fin)}`;
    cambiar(campo, nuevo);
    const cursor = sel.inicio + token.length;
    seleccion.current[campo] = { inicio: cursor, fin: cursor };
    requestAnimationFrame(() => {
      const nodo = campo === 'asunto' ? asuntoRef.current : cuerpoRef.current;
      nodo?.focus();
      nodo?.setSelectionRange(cursor, cursor);
    });
  };

  const guardar = async (event) => {
    event.preventDefault();
    const e = {};
    if (!form.asunto.trim()) e.asunto = 'Escribe el asunto del aviso.';
    if (!form.cuerpo.trim()) e.cuerpo = 'Escribe el mensaje del aviso.';
    if (Object.keys(e).length) { setErrores(e); return; }
    setGuardando(true);
    try {
      const { data } = await actualizarPlantillaAviso(plantilla.id, form);
      toast.success(`Plantilla "${plantilla.nombre}" guardada.`);
      onGuardada?.({ ...plantilla, ...form, ...(data && typeof data === 'object' && data.id ? data : {}) });
    } catch (error) {
      const data = error?.response?.data || {};
      const campos = data.campos || data;
      setErrores({
        asunto: Array.isArray(campos.asunto) ? campos.asunto.join(' ') : campos.asunto,
        cuerpo: Array.isArray(campos.cuerpo) ? campos.cuerpo.join(' ') : campos.cuerpo,
      });
      toast.error(mensajeError(error, 'No se pudo guardar la plantilla.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold sm:text-base" style={{ color: 'var(--jet)' }}>{plantilla.nombre}</h3>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Clave: {plantilla.clave}</p>
          </div>
          <label className="flex min-h-[40px] items-center gap-2 text-sm" style={{ color: 'var(--jet)' }}>
            <input type="checkbox" className="h-4 w-4" checked={form.activa} onChange={(e) => cambiar('activa', e.target.checked)} />
            Usar esta plantilla
          </label>
        </div>
        {!form.activa && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Inactiva: se enviará el texto por defecto del sistema.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium sm:text-sm" style={{ color: 'var(--jet)' }}>Insertar dato</p>
              <div className="flex flex-wrap gap-2">
                {tokens.map(({ token, etiqueta }) => (
                  <button
                    key={token}
                    type="button"
                    title={token}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertarToken(token)}
                    className="min-h-[36px] rounded-xl px-3 text-xs font-medium"
                    style={{ border: '0.5px solid var(--pb)', color: 'var(--pb-mid)', background: 'var(--pb-light)' }}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
              Asunto
              <input
                ref={asuntoRef}
                className="mt-1 w-full min-h-[44px] rounded-xl px-3 text-sm"
                style={inputStyle(errores.asunto)}
                value={form.asunto}
                onChange={(e) => { cambiar('asunto', e.target.value); recordarCursor('asunto', e); }}
                onSelect={(e) => recordarCursor('asunto', e)}
                onFocus={() => { ultimoCampo.current = 'asunto'; }}
              />
              <ErrorCampo msg={errores.asunto} />
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
              Mensaje
              <textarea
                ref={cuerpoRef}
                rows={7}
                className="mt-1 w-full rounded-xl px-3 py-2 text-sm leading-relaxed"
                style={inputStyle(errores.cuerpo)}
                value={form.cuerpo}
                onChange={(e) => { cambiar('cuerpo', e.target.value); recordarCursor('cuerpo', e); }}
                onSelect={(e) => recordarCursor('cuerpo', e)}
                onFocus={() => { ultimoCampo.current = 'cuerpo'; }}
              />
              <ErrorCampo msg={errores.cuerpo} />
            </label>
          </div>

          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium sm:text-sm" style={{ color: 'var(--jet)' }}>
              <Eye size={15} aria-hidden="true" /> Vista previa con datos de ejemplo
            </p>
            <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }}>
              <p className="break-words text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                {renderizarPlantilla(form.asunto, DATOS_EJEMPLO_AVISO) || 'Sin asunto'}
              </p>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed" style={{ color: 'var(--jet-mid)' }}>
                {renderizarPlantilla(form.cuerpo, DATOS_EJEMPLO_AVISO) || 'Sin mensaje'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={guardando || !modificado}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            style={{ background: 'var(--pb)' }}
          >
            {guardando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Guardar plantilla
          </button>
        </div>
      </form>
    </Card>
  );
}
