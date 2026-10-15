import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CloudOff, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { parseApiError } from '../../../utils/apiError';
import { getPanel } from '../api/auditoriaApi';
import KpiVenta from '../components/KpiVenta';
import PanelAlertas from '../components/PanelAlertas';
import PanelBajoInventario from '../components/PanelBajoInventario';
import PanelCajaHoy from '../components/PanelCajaHoy';
import PanelDiferencias from '../components/PanelDiferencias';
import PanelFiltroArea from '../components/PanelFiltroArea';
import PanelSkeleton from '../components/PanelSkeleton';
import PanelTopProductos from '../components/PanelTopProductos';
import { fmtFecha } from '../components/PanelFormato';

const esCancelacion = (err) => err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

// Panel ejecutivo de la Auditoría de Cantina (Fase 1 · F1).
// Datos: GET panel/?area= — forma en CONTRATO_AUDITORIA_CANTINA.md §2.
const AuditoriaPanel = () => {
  const [area, setArea] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [panel, setPanel] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const { data } = await getPanel(area ? { area } : undefined, controller.signal);
        // Con mocks la promesa no se cancela: se descarta si ya se abortó.
        if (controller.signal.aborted) return;
        setPanel(data ?? null);
      } catch (err) {
        if (esCancelacion(err) || controller.signal.aborted) return;
        // No se dejan a la vista datos de otra área bajo el filtro nuevo.
        setPanel(null);
        toast.error(parseApiError(err) || 'No se pudo cargar el panel de auditoría.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    })();
    return () => controller.abort();
  }, [area, recarga]);

  const cambiarArea = useCallback((valor) => {
    setCargando(true);
    setArea(valor);
  }, []);

  const recargar = useCallback(() => {
    setCargando(true);
    setRecarga((n) => n + 1);
  }, []);

  const ventas = panel?.ventas ?? {};

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col">
      <PageHeader
        titulo="Panel ejecutivo"
        descripcion={
          panel?.generado_en
            ? `Actualizado el ${fmtFecha(panel.generado_en, "d 'de' MMMM, HH:mm")}`
            : 'Ventas, caja, diferencias, inventario y alertas.'
        }
        acciones={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <PanelFiltroArea valor={area} onCambio={cambiarArea} deshabilitado={cargando} />
            <button
              type="button"
              onClick={recargar}
              disabled={cargando}
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-3 text-sm transition-colors hover:bg-[var(--pb-light)] disabled:opacity-60 sm:w-auto"
              style={{ border: '1px solid var(--border-md)', color: 'var(--jet-mid)', fontWeight: 'var(--fw-medium)' }}
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        }
      />

      {cargando && !panel ? (
        <PanelSkeleton />
      ) : !panel ? (
        <div
          className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] p-6 text-center sm:p-10"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
        >
          <CloudOff size={28} aria-hidden="true" />
          <p className="text-sm sm:text-base">No se pudo cargar el panel.</p>
          <button
            type="button"
            onClick={recargar}
            className="min-h-[40px] w-full rounded-xl px-4 text-sm text-white sm:w-auto"
            style={{ background: 'var(--pb)', fontWeight: 'var(--fw-medium)' }}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div
          className={`flex flex-col gap-4 transition-opacity sm:gap-5 ${cargando ? 'pointer-events-none opacity-60' : ''}`}
          aria-busy={cargando}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            <KpiVenta etiqueta="Ventas de hoy" comparacion="vs. ayer" datos={ventas.hoy} destacado />
            <KpiVenta etiqueta="Esta semana" comparacion="vs. semana pasada" datos={ventas.semana} />
            <KpiVenta etiqueta="Este mes" comparacion="vs. mes pasado" datos={ventas.mes} className="sm:col-span-2 lg:col-span-1" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PanelCajaHoy caja={panel.caja_hoy} />
            <PanelDiferencias diferencias={panel.diferencias_pendientes} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PanelTopProductos productos={panel.top_productos ?? []} />
            <PanelBajoInventario productos={panel.bajo_inventario ?? []} />
            <PanelAlertas alertas={panel.alertas} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditoriaPanel;
