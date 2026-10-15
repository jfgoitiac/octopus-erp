import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import TotalesPorMetodo from '../../../components/cantina/cierre/TotalesPorMetodo';
import { parseApiError } from '../../../utils/apiError';
import { getCierre } from '../api/auditoriaApi';
import CierreCabecera from '../components/CierreCabecera';
import CierreResumenVentas from '../components/CierreResumenVentas';
import EstadoRevisionPanel from '../components/EstadoRevisionPanel';
import { ESTILO_TARJETA, esCancelacion, fmtFecha } from '../components/CierreFormato';

// TotalesPorMetodo (cierre del cajero) recibe { metodo: valor }; el contrato
// entrega una lista normalizada, así que se adapta sin tocar el componente.
const totalesComoObjeto = (lista = []) =>
  Object.fromEntries(lista.map((m) => [m.metodo, { total_usd: m.total_usd }]));

function DetalleSkeleton() {
  const bloque = (clase) => <div className={`rounded-2xl animate-pulse ${clase}`} style={{ background: 'var(--border)' }} />;
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando cierre">
      {bloque('h-32 sm:h-28')}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {bloque('h-24')}{bloque('h-24')}{bloque('h-24')}{bloque('h-24')}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 flex flex-col gap-3">{bloque('h-56')}{bloque('h-48')}</div>
        <div className="flex flex-col gap-3">{bloque('h-44')}{bloque('h-40')}</div>
      </div>
    </div>
  );
}

const VolverALista = () => (
  <Link
    to=".."
    relative="path"
    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-sm font-medium hover:bg-[var(--jet-light)] w-full sm:w-auto justify-center sm:justify-start"
    style={{ color: 'var(--jet-mid)' }}
  >
    <ArrowLeft size={16} aria-hidden="true" />
    Volver a cierres
  </Link>
);

// Carril Fase 1 · F2 — detalle de un cierre (CONTRATO_AUDITORIA_CANTINA.md §3).
const AuditoriaCierreDetalle = () => {
  const { id } = useParams();
  // `clave` = id del cierre cargado; `version` fuerza la recarga tras revisar.
  const [estado, setEstado] = useState({ clave: null, cierre: null, error: null });
  const [version, setVersion] = useState(0);

  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    getCierre(id, controller.signal)
      .then(({ data }) => setEstado({ clave: id, cierre: data, error: null }))
      .catch((err) => {
        if (esCancelacion(err)) return;
        const noExiste = err.response?.status === 404;
        if (!noExiste) toast.error(`No se pudo cargar el cierre: ${parseApiError(err)}`);
        setEstado((prev) => ({ clave: id, cierre: prev.clave === id ? prev.cierre : null, error: noExiste ? 'no_existe' : 'error' }));
      });
    return () => controller.abort();
  }, [id, version]);

  const cargando = estado.clave !== id;
  const { cierre } = estado;

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-5 flex flex-col gap-4">
      <PageHeader
        titulo={`Cierre #${id}`}
        descripcion={cierre ? `${cierre.cajero?.nombre ?? 'Cajero'} · ${fmtFecha(cierre.fecha)}` : 'Detalle del cierre de caja'}
        acciones={<VolverALista />}
      />

      {cargando && <DetalleSkeleton />}

      {!cargando && !cierre && (
        <div className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-12 text-center" style={ESTILO_TARJETA}>
          <FileQuestion size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
            {estado.error === 'no_existe' ? 'Este cierre no existe.' : 'No se pudo cargar el cierre.'}
          </p>
          {estado.error !== 'no_existe' && (
            <button
              type="button"
              onClick={refrescar}
              className="mt-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto"
              style={{ background: 'var(--pb)', color: '#fff' }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {!cargando && cierre && (
        <>
          <CierreCabecera cierre={cierre} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
              <TotalesPorMetodo totales={totalesComoObjeto(cierre.totales_por_metodo)} />
              <CierreResumenVentas
                resumen={cierre.resumen_ventas}
                observaciones={cierre.observaciones_cajero}
                reaperturas={cierre.reaperturas}
              />
            </div>
            <div className="flex flex-col gap-4 min-w-0">
              <EstadoRevisionPanel cierreId={cierre.id ?? id} revision={cierre.revision} onRevisado={refrescar} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditoriaCierreDetalle;
