import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Upload } from 'lucide-react';
import { PortalAuthContext } from '../context/PortalAuthContext';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
import { getDashboard } from '../api/portal.service';
import { usePortalHeroExtra } from '../hooks/usePortalHeroExtra';
import { useComprobantesPortal } from '../hooks/useComprobantesPortal';
import ComprobantePagoModal from '../components/ComprobantePagoModal';
import WidgetHeroPortal from '../components/widgets/WidgetHeroPortal';
import WidgetAccionesRapidas from '../components/widgets/WidgetAccionesRapidas';
import WidgetResumenFinanciero from '../components/widgets/WidgetResumenFinanciero';
import WidgetProximosVencimientos from '../components/widgets/WidgetProximosVencimientos';
import WidgetMisComprobantes from '../components/widgets/WidgetMisComprobantes';
import WidgetUltimosPagos from '../components/widgets/WidgetUltimosPagos';
import WidgetFamiliaHoy from '../components/widgets/WidgetFamiliaHoy';

const PortalDashboard = () => {
  const { user } = useContext(PortalAuthContext);
  const { logoColegio } = useOutletContext() || {};

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const { alumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [modalOpen, setModalOpen] = useState(false);
  const [mensualidadInicialId, setMensualidadInicialId] = useState(null);
  const { comprobantes, ultimoPorMensualidad, recargar: recargarComprobantes } = useComprobantesPortal();

  const cargarDashboard = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getDashboard(signal);
      const data = res.data;
      setDashboardData(data);
      sincronizarConLista(data.alumnos);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar la información. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, [sincronizarConLista]);

  useEffect(() => {
    const controller = new AbortController();
    cargarDashboard(controller.signal);
    return () => controller.abort();
  }, [cargarDashboard]);

  const { avisosSinLeer, alertaRendimiento, loadingAvisos, loadingRendimiento } =
    usePortalHeroExtra(dashboardData?.alumnos);

  const resumen = dashboardData?.resumen_financiero;
  const variosAlumnos = (dashboardData?.alumnos?.length || 0) > 1;
  const tieneDeuda = resumen && Number(resumen.total_deuda_usd) > 0;

  // El inicio es de toda la familia: deuda, comprobantes y últimos pagos
  // suman a todos los hijos. El detalle por hijo vive en Historial.
  const ultimosPagos = dashboardData?.ultimos_pagos || [];

  // Todo lo que se puede reportar desde el portal: las vencidas primero y
  // luego las próximas (pagar por adelantado también se permite).
  const pagables = useMemo(() => {
    const vistas = new Set();
    return [...(resumen?.mensualidades_vencidas || []), ...(resumen?.proximos_vencimientos || [])]
      .filter((m) => (vistas.has(m.id) ? false : vistas.add(m.id)));
  }, [resumen]);
  const hayPorReportar = pagables.some((m) => ultimoPorMensualidad[m.id]?.estatus !== 'pendiente');
  // Rechazos vigentes: el último comprobante de una mensualidad que sigue sin pagar.
  const rechazados = pagables
    .map((m) => ultimoPorMensualidad[m.id])
    .filter((c) => c?.estatus === 'rechazado');

  const abrirPago = (mensualidad = null) => {
    setMensualidadInicialId(mensualidad?.id ?? null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-12 md:gap-5 md:items-start">
        <div className="md:col-span-12">
          <WidgetHeroPortal
            nombre={user?.nombre}
            resumen={resumen}
            logoColegio={logoColegio}
            variosAlumnos={variosAlumnos}
            loadingResumen={loading}
            onPagar={hayPorReportar ? () => abrirPago() : null}
          />
        </div>

        <div className="md:col-span-12">
          {loading || loadingAvisos || loadingRendimiento ? (
            <div className="h-28 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" aria-hidden="true" />
          ) : (
            <WidgetFamiliaHoy
              hayPorReportar={hayPorReportar}
              rechazados={rechazados}
              avisos={avisosSinLeer}
              alertas={alertaRendimiento}
              alumnoActivo={alumnoActivo}
              onPagar={abrirPago}
            />
          )}
        </div>

        <div className="md:col-span-12">
          <WidgetAccionesRapidas onPagar={hayPorReportar ? () => abrirPago() : null} />
        </div>

        <div className="md:col-span-12 pt-2">
          <h2 className="text-base font-semibold text-[var(--jet)]">Pagos y vencimientos</h2>
          {variosAlumnos && (
            <p className="mt-0.5 text-xs text-[var(--ash)]">Reúne a todos tus hijos. El detalle de cada uno está en Historial.</p>
          )}
        </div>

        <div className="md:col-span-6">
          <WidgetResumenFinanciero
            resumen={resumen}
            tieneDeuda={tieneDeuda}
            loading={loading}
            onPagar={abrirPago}
            variosAlumnos={variosAlumnos}
            comprobantePorMensualidad={ultimoPorMensualidad}
          />
        </div>

        <div className="md:col-span-6 space-y-4 md:space-y-5">
          <WidgetMisComprobantes comprobantes={comprobantes} variosAlumnos={variosAlumnos} />
          <WidgetProximosVencimientos
            resumen={resumen}
            loading={loading}
            variosAlumnos={variosAlumnos}
            comprobantePorMensualidad={ultimoPorMensualidad}
            onPagar={abrirPago}
          />
          <WidgetUltimosPagos ultimosPagos={ultimosPagos} loading={loading} />
        </div>
      </div>

      {/* Acceso de pago fijo en móvil, solo si hay algo que reportar. Va sobre
          la barra inferior (60px + zona segura del iPhone) sin taparla. */}
      {!loading && hayPorReportar && (
        <div className="fixed left-0 right-0 bottom-[calc(68px+env(safe-area-inset-bottom))] px-4 z-20 sm:hidden">
          <button
            type="button"
            onClick={() => abrirPago()}
            className="w-full max-w-[480px] mx-auto flex items-center justify-center gap-2 bg-[var(--portal-primary)] text-white font-semibold py-3.5 rounded-xl text-base hover:bg-[color-mix(in_srgb,var(--portal-primary)_85%,black)] transition-colors shadow-lg shadow-[var(--portal-primary)]/30"
          >
            <Upload size={18} aria-hidden="true" />
            Reportar un pago
          </button>
        </div>
      )}

      <ComprobantePagoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        opciones={pagables}
        mensualidadInicialId={mensualidadInicialId}
        comprobantePorMensualidad={ultimoPorMensualidad}
        tasaBcv={resumen?.tasa_bcv}
        variosAlumnos={variosAlumnos}
        onSuccess={() => {
          recargarComprobantes();
          cargarDashboard();
        }}
      />
    </div>
  );
};

export default PortalDashboard;
