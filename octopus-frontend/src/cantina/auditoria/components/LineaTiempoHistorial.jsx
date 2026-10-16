import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ArrowRight, History } from 'lucide-react';
import { parseApiError } from '../../../utils/apiError';
import { getHistorialCierre } from '../api/auditoriaApi';
import { ESTADOS_REVISION, ESTILO_TARJETA, esCancelacion, fmtFechaHora, usd } from './CierreFormato';

const CLAVES_MONTO = /(_usd|^precio$|^costo$|^monto|^total|^diferencia|^conteo_fisico)/;

const ETIQUETA_CAMPO = {
  estado: 'Estado', precio: 'Precio', costo: 'Costo', stock: 'Stock', stock_actual: 'Stock',
  total_usd: 'Total', subtotal_usd: 'Subtotal', descuento_usd: 'Descuento', metodo_pago: 'Método',
  monto_inicial: 'Monto inicial', total_ventas: 'Total ventas', total_efectivo: 'Efectivo',
  conteo_fisico: 'Conteo físico', diferencia: 'Diferencia', nombre: 'Archivo', adjunto_id: 'Adjunto',
  apertura_id: 'Apertura', apertura_nueva_id: 'Apertura nueva', cierre_id: 'Cierre', area: 'Área',
};

const COLOR_TIPO = {
  revision_cierre: 'var(--pb)', adjunto_cierre: 'var(--teal)', reapertura_caja: 'var(--violet)',
  anulacion_venta: 'var(--red)', cierre_caja: 'var(--jet-mid)', apertura_caja: 'var(--green)',
  descuento_venta: 'var(--amber-ink)', venta_manual: 'var(--amber-ink)', cierre_modificado: 'var(--orange)',
};

const formatearValor = (clave, valor) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (clave === 'estado' && ESTADOS_REVISION[valor]) return ESTADOS_REVISION[valor].etiqueta;
  if (CLAVES_MONTO.test(clave) && !Number.isNaN(Number(valor))) return usd(valor);
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor).replace(/_/g, ' ');
};

// Filas antes → después de un evento, con la unión de claves de ambos lados.
function Cambios({ antes, despues }) {
  const a = antes ?? {};
  const d = despues ?? {};
  const claves = [...new Set([...Object.keys(a), ...Object.keys(d)])];
  if (claves.length === 0) return null;
  return (
    <dl className="flex flex-col gap-1 mt-2 rounded-xl p-2.5 text-xs" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border)' }}>
      {claves.map((clave) => {
        const tieneAntes = clave in a;
        const tieneDespues = clave in d;
        const cambio = tieneAntes && tieneDespues && String(a[clave]) !== String(d[clave]);
        return (
          <div key={clave} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
            <dt className="font-medium" style={{ color: 'var(--ash)' }}>{ETIQUETA_CAMPO[clave] ?? clave.replace(/_/g, ' ')}:</dt>
            <dd className="flex flex-wrap items-center gap-1.5 min-w-0 break-all" style={{ color: 'var(--jet)' }}>
              {tieneAntes && (
                <span className={cambio ? 'line-through' : ''} style={cambio ? { color: 'var(--ash)' } : undefined}>
                  {formatearValor(clave, a[clave])}
                </span>
              )}
              {cambio && <ArrowRight size={12} aria-label="cambió a" style={{ color: 'var(--ash)' }} />}
              {tieneDespues && (cambio || !tieneAntes) && (
                <span className="font-semibold">{formatearValor(clave, d[clave])}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function HistorialSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando historial">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="w-3 h-3 mt-1 rounded-full motion-safe:animate-pulse shrink-0" style={{ background: 'var(--border-md)' }} />
          <div className="flex-1 h-16 rounded-xl motion-safe:animate-pulse" style={{ background: 'var(--border)' }} />
        </div>
      ))}
    </div>
  );
}

// Línea de tiempo de la bitácora del cierre, su apertura y sus reaperturas
// (§3 GET cierres/<id>/historial/, formato de evento de §5). Lo más reciente arriba.
// `version` cambia cuando el detalle se refresca (revisión o adjunto nuevo).
export default function LineaTiempoHistorial({ cierreId, version = 0 }) {
  const clave = `${cierreId}:${version}`;
  const [estado, setEstado] = useState({ clave: null, eventos: [] });
  const cargando = estado.clave !== clave;

  useEffect(() => {
    const controller = new AbortController();
    getHistorialCierre(cierreId, controller.signal)
      .then(({ data }) => {
        const lista = Array.isArray(data) ? data : (data?.results ?? []);
        const ordenados = [...lista].sort((x, y) => new Date(y.creado_en) - new Date(x.creado_en));
        setEstado({ clave, eventos: ordenados });
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudo cargar el historial: ${parseApiError(err)}`);
        setEstado((prev) => ({ clave, eventos: prev.eventos }));
      });
    return () => controller.abort();
  }, [cierreId, clave]);

  return (
    <section className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={ESTILO_TARJETA} aria-labelledby="cierre-historial">
      <h2 id="cierre-historial" className="inline-flex items-center gap-1.5 font-semibold text-sm" style={{ color: 'var(--jet)' }}>
        <History size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
        Historial
      </h2>

      {cargando && estado.eventos.length === 0 && <HistorialSkeleton />}

      {!cargando && estado.eventos.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay eventos registrados para este cierre.</p>
      )}

      {estado.eventos.length > 0 && (
        <ol className="relative flex flex-col gap-4 pl-5" aria-busy={cargando}>
          <span aria-hidden="true" className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'var(--border-md)' }} />
          {estado.eventos.map((ev) => (
            <li key={ev.id} className="relative min-w-0">
              <span
                aria-hidden="true"
                className="absolute -left-5 top-1 w-3 h-3 rounded-full ring-4 ring-white"
                style={{ background: COLOR_TIPO[ev.tipo] ?? 'var(--ash)' }}
              />
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>
                  {ev.tipo_etiqueta ?? ev.tipo}
                  {ev.objeto_etiqueta && <span className="font-normal" style={{ color: 'var(--jet-mid)' }}> · {ev.objeto_etiqueta}</span>}
                </p>
                <time dateTime={ev.creado_en} className="text-xs shrink-0" style={{ color: 'var(--ash)' }}>
                  {fmtFechaHora(ev.creado_en)}
                </time>
              </div>
              <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
                {ev.usuario?.nombre ?? 'Sistema'}
                {ev.usuario_rol && <span style={{ color: 'var(--ash)' }}> · {ev.usuario_rol}</span>}
              </p>
              <Cambios antes={ev.antes} despues={ev.despues} />
              {ev.motivo && (
                <p className="text-xs mt-1.5 italic break-words" style={{ color: 'var(--jet-mid)' }}>
                  “{ev.motivo}”
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
