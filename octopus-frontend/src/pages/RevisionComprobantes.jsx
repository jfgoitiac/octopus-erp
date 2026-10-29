import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, FileSearch, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { TablaScroll } from '../components/ui/TablaScroll';
import { TableRowSkeleton } from '../components/shared/Skeleton';
import { listarComprobantes } from '../services/comprobantesRevisionService';
import {
  ESTATUS_COMPROBANTE, ESTILO_ESTATUS, formatearFechaHora, formatearMonto,
} from '../components/comprobantes/comprobantesUtils';

const ICONOS_ESTATUS = { pendiente: Clock, aprobado: CheckCircle2, rechazado: XCircle };
const VACIO = {
  pendiente: 'No hay comprobantes pendientes por revisar.',
  aprobado: 'Aún no hay comprobantes aprobados.',
  rechazado: 'No hay comprobantes rechazados.',
};

const RevisionComprobantes = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const estatusParam = searchParams.get('estatus');
  const estatus = ESTATUS_COMPROBANTE.some((e) => e.value === estatusParam) ? estatusParam : 'pendiente';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async (signal) => {
    setLoading(true);
    try {
      const { data } = await listarComprobantes(estatus, signal);
      setItems(Array.isArray(data) ? data : data?.results || []);
    } catch (error) {
      if (error?.code === 'ERR_CANCELED') return;
      toast.error('No se pudieron cargar los comprobantes.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [estatus]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial tras respuesta HTTP
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const cambiarEstatus = (valor) => setSearchParams(valor === 'pendiente' ? {} : { estatus: valor }, { replace: true });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        titulo="Revisión de comprobantes"
        descripcion="Revisa los pagos enviados desde el portal de representantes: procésalos en caja para aprobarlos o recházalos con un motivo."
        acciones={
          <button
            type="button"
            onClick={() => cargar()}
            disabled={loading}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-4 min-h-[40px] text-sm font-medium disabled:opacity-60"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
        }
      />

      <div
        role="tablist"
        aria-label="Estatus del comprobante"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl w-full sm:w-auto sm:inline-grid"
        style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }}
      >
        {ESTATUS_COMPROBANTE.map((opcion) => {
          const activa = opcion.value === estatus;
          const Icono = ICONOS_ESTATUS[opcion.value];
          return (
            <button
              key={opcion.value}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => cambiarEstatus(opcion.value)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              style={activa
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,0.10)' }
                : { color: 'var(--jet-mid)' }}
            >
              <Icono size={16} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{opcion.label}</span>
            </button>
          );
        })}
      </div>

      {!loading && items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 p-4 sm:p-6 text-center">
            <FileSearch size={28} style={{ color: 'var(--ash)' }} aria-hidden="true" />
            <p className="text-sm" style={{ color: 'var(--ash)' }}>{VACIO[estatus]}</p>
          </div>
        </Card>
      ) : (
        <TablaScroll>
          <div className="min-w-[860px] rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                  <th className="px-4 py-3 font-medium">Alumno</th>
                  <th className="px-4 py-3 font-medium">Representante</th>
                  <th className="px-4 py-3 font-medium">Mensualidad</th>
                  <th className="px-4 py-3 font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Enviado</th>
                  <th className="px-4 py-3 font-medium">Estatus</th>
                  <th className="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <TableRowSkeleton cols={7} rows={5} /> : items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '0.5px solid var(--border)', color: 'var(--jet)' }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{item.alumno}</p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{item.grado || 'Sin grado'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{item.representante}</p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{item.representante_cedula}</p>
                    </td>
                    <td className="px-4 py-3">{item.mensualidad}</td>
                    <td className="px-4 py-3 font-medium">{formatearMonto(item.monto_usd)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatearFechaHora(item.fecha_subida)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${ESTILO_ESTATUS[item.estatus] || 'bg-gray-100 text-gray-600'}`}>
                        {item.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/comprobantes/revision/${item.id}`)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-3 min-h-[36px] text-sm font-semibold text-white"
                        style={{ background: 'var(--pb)' }}
                      >
                        <FileSearch size={15} aria-hidden="true" />
                        {item.estatus === 'pendiente' ? 'Revisar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TablaScroll>
      )}
    </div>
  );
};

export default RevisionComprobantes;
