import { useEffect, useId, useState } from 'react';
import { toast } from 'react-toastify';
import { Ban, Clock, DollarSign, Loader2, Percent, RotateCcw, Save, SlidersHorizontal, Tag } from 'lucide-react';
import { parseApiError } from '../../../utils/apiError';
import { actualizarParametrosAuditoria, getParametrosAuditoria } from '../api/auditoriaApi';
import { ESTILO_CAMPO, ESTILO_TARJETA, esCancelacion, fmtFechaHora } from './CierreFormato';
import { CLASE_CAMPO, ESTILO_BOTON_PRIMARIO, ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

// Campos editables de §7. `tipo` decide validación y cómo se envía:
// decimal → string con 2 decimales; entero → número; hora → "HH:MM".
const CAMPOS = [
  {
    clave: 'tolerancia_diferencia_caja', tipo: 'decimal', etiqueta: 'Tolerancia de diferencia de caja',
    ayuda: 'Faltante o sobrante (USD) que no genera alerta. Más de 5× la tolerancia es crítica.',
    icono: DollarSign, sufijo: 'USD', min: 0, max: 10000,
  },
  {
    clave: 'limite_anulaciones_dia_cajero', tipo: 'entero', etiqueta: 'Anulaciones por cajero al día',
    ayuda: 'Al superarlo se alerta por ese cajero.', icono: Ban, min: 0, max: 1000,
  },
  {
    clave: 'limite_anulaciones_dia_total', tipo: 'entero', etiqueta: 'Anulaciones totales al día',
    ayuda: 'Suma de todos los cajeros.', icono: Ban, min: 0, max: 10000,
  },
  {
    clave: 'limite_descuentos_dia_cajero', tipo: 'entero', etiqueta: 'Descuentos por cajero al día',
    ayuda: 'Ventas con descuento de un mismo cajero.', icono: Tag, min: 0, max: 1000,
  },
  {
    clave: 'limite_descuento_porcentaje', tipo: 'decimal', etiqueta: 'Descuento máximo por venta',
    ayuda: 'Una venta con un descuento mayor genera alerta.', icono: Percent, sufijo: '%', min: 0, max: 100,
  },
  {
    clave: 'hora_tope_cierre', tipo: 'hora', etiqueta: 'Hora tope de cierre',
    ayuda: 'Después de esta hora, una caja aún abierta genera alerta.', icono: Clock,
  },
];

// El backend puede devolver la hora como "18:00:00"; el input usa "HH:MM".
const aFormulario = (datos) =>
  Object.fromEntries(CAMPOS.map((c) => {
    const valor = datos?.[c.clave];
    if (valor == null) return [c.clave, ''];
    return [c.clave, c.tipo === 'hora' ? String(valor).slice(0, 5) : String(valor)];
  }));

const validar = (form) => {
  const errores = {};
  CAMPOS.forEach((c) => {
    const valor = String(form[c.clave] ?? '').trim();
    if (valor === '') { errores[c.clave] = 'Obligatorio.'; return; }
    if (c.tipo === 'hora') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)) errores[c.clave] = 'Usa el formato HH:MM.';
      return;
    }
    const patron = c.tipo === 'entero' ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
    if (!patron.test(valor)) {
      errores[c.clave] = c.tipo === 'entero' ? 'Debe ser un número entero sin signo.' : 'Número positivo con hasta 2 decimales.';
      return;
    }
    const n = Number(valor);
    if (n < c.min || n > c.max) errores[c.clave] = `Debe estar entre ${c.min} y ${c.max}.`;
  });
  if (!errores.limite_anulaciones_dia_total && !errores.limite_anulaciones_dia_cajero
    && Number(form.limite_anulaciones_dia_total) < Number(form.limite_anulaciones_dia_cajero)) {
    errores.limite_anulaciones_dia_total = 'No puede ser menor que el límite por cajero.';
  }
  return errores;
};

const aPayload = (form) =>
  Object.fromEntries(CAMPOS.map((c) => {
    const valor = String(form[c.clave]).trim();
    if (c.tipo === 'entero') return [c.clave, Number(valor)];
    if (c.tipo === 'decimal') return [c.clave, Number(valor).toFixed(2)];
    return [c.clave, valor];
  }));

function ParametrosSkeleton() {
  return (
    <div className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={ESTILO_TARJETA} aria-busy="true" aria-label="Cargando parámetros">
      <div className="h-4 w-1/2 sm:w-1/4 rounded-md animate-pulse" style={{ background: 'var(--border)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CAMPOS.map((c) => (
          <div key={c.clave} className="flex flex-col gap-2">
            <div className="h-3 w-2/3 rounded-md animate-pulse" style={{ background: 'var(--border)' }} />
            <div className="h-11 w-full rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Pestaña Parámetros (§7): umbrales del motor de alertas.
export default function ParametrosFormulario() {
  const id = useId();
  const [estado, setEstado] = useState({ cargado: false, datos: null, error: false });
  const [form, setForm] = useState(() => aFormulario(null));
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getParametrosAuditoria(controller.signal)
      .then(({ data }) => {
        setEstado({ cargado: true, datos: data, error: false });
        setForm(aFormulario(data));
        setErrores({});
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudieron cargar los parámetros: ${parseApiError(err)}`);
        setEstado({ cargado: true, datos: null, error: true });
      });
    return () => controller.abort();
  }, [intento]);

  const original = aFormulario(estado.datos);
  const modificado = CAMPOS.some((c) => String(form[c.clave]).trim() !== original[c.clave]);

  const cambiar = (clave) => (e) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, [clave]: valor }));
    if (errores[clave]) setErrores((prev) => ({ ...prev, [clave]: undefined }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    const nuevos = validar(form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    setGuardando(true);
    try {
      const { data } = await actualizarParametrosAuditoria(aPayload(form));
      setEstado({ cargado: true, datos: data, error: false });
      setForm(aFormulario(data));
      toast.success('Parámetros actualizados.');
    } catch (err) {
      toast.error(`No se pudieron guardar los parámetros: ${parseApiError(err)}`);
    } finally {
      setGuardando(false);
    }
  };

  if (!estado.cargado) return <ParametrosSkeleton />;

  if (estado.error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-12 text-center" style={ESTILO_TARJETA}>
        <SlidersHorizontal size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>No se pudieron cargar los parámetros.</p>
        <button
          type="button"
          onClick={() => { setEstado({ cargado: false, datos: null, error: false }); setIntento((n) => n + 1); }}
          className="mt-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto"
          style={ESTILO_BOTON_PRIMARIO}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { datos } = estado;

  return (
    <form onSubmit={guardar} noValidate className="rounded-2xl p-4 sm:p-5 flex flex-col gap-5" style={ESTILO_TARJETA}>
      <div className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-1.5 font-semibold text-sm sm:text-base" style={{ color: 'var(--jet)' }}>
          <SlidersHorizontal size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
          Umbrales de las alertas
        </h2>
        <p className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>
          El motor revisa estos límites cada día y al cerrar cada caja. Cada cambio queda en la bitácora.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CAMPOS.map((c) => {
          const Icono = c.icono;
          const error = errores[c.clave];
          const inputId = `${id}-${c.clave}`;
          return (
            <div key={c.clave} className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor={inputId} className="text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>{c.etiqueta}</label>
              <div className="relative">
                <Icono size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
                <input
                  id={inputId}
                  type={c.tipo === 'hora' ? 'time' : 'text'}
                  inputMode={c.tipo === 'entero' ? 'numeric' : c.tipo === 'decimal' ? 'decimal' : undefined}
                  value={form[c.clave]}
                  onChange={cambiar(c.clave)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${inputId}-ayuda`}
                  className={`${CLASE_CAMPO} pl-9 ${c.sufijo ? 'pr-12' : ''}`}
                  style={{ ...ESTILO_CAMPO, border: error ? '0.5px solid var(--red)' : ESTILO_CAMPO.border }}
                />
                {c.sufijo && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--ash)' }}>
                    {c.sufijo}
                  </span>
                )}
              </div>
              <p id={`${inputId}-ayuda`} className="text-xs" role={error ? 'alert' : undefined} style={{ color: error ? 'var(--red)' : 'var(--ash)' }}>
                {error ?? c.ayuda}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: '0.5px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          {datos?.actualizado_en
            ? `Última actualización: ${datos.actualizado_por?.nombre ?? '—'} · ${fmtFechaHora(datos.actualizado_en)}`
            : 'Valores por defecto: aún no se han modificado.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => { setForm(original); setErrores({}); }}
            disabled={!modificado || guardando}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-medium w-full sm:w-auto disabled:opacity-50"
            style={ESTILO_BOTON_SECUNDARIO}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Descartar
          </button>
          <button
            type="submit"
            disabled={!modificado || guardando}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto disabled:opacity-50"
            style={ESTILO_BOTON_PRIMARIO}
          >
            {guardando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </form>
  );
}
