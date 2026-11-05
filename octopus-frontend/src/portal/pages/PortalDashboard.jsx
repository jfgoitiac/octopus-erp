import { useState, useEffect, useContext, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { PortalAuthContext } from '../context/PortalAuthContext';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
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
import FiltroDeudaEstudiante from '../components/FiltroDeudaEstudiante';

const PortalDashboard = () => {
  const { user } = useContext(PortalAuthContext);
  const {
    logoColegio,
    dashboardData,
    loadingDashboard: loading = true,
    recargarResumen,
  } = useOutletContext() || {};
  const { alumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [modalOpen, setModalOpen] = useState(false);
  const [mensualidadesInicialesIds, setMensualidadesInicialesIds] = useState([]);
  const [alumnoFinancieroId, setAlumnoFinancieroId] = useState(null);
  const { comprobantes, ultimoPorMensualidad, recargar: recargarComprobantes } = useComprobantesPortal();

  useEffect(() => {
    if (dashboardData?.alumnos) sincronizarConLista(dashboardData.alumnos);
  }, [dashboardData, sincronizarConLista]);

  const { avisosSinLeer, alertaRendimiento, loadingAvisos, loadingRendimiento } =
    usePortalHeroExtra(dashboardData?.alumnos);

  const resumen = dashboardData?.resumen_financiero;
  const alumnos = dashboardData?.alumnos || [];
  const variosAlumnos = (dashboardData?.alumnos?.length || 0) > 1;
  // Si el hijo elegido ya no está en la lista (o queda uno solo y el filtro
  // se oculta), se vuelve a la vista familiar en vez de mostrar "al día".
  const alumnoFiltroId = variosAlumnos && alumnos.some((a) => String(a.id) === String(alumnoFinancieroId))
    ? alumnoFinancieroId
    : null;
  const deudaVisible = alumnoFiltroId === null
    ? Number(resumen?.total_deuda_usd || 0)
    : Number(resumen?.deuda_por_alumno?.find((item) => String(item.alumno_id) === String(alumnoFiltroId))?.deuda_usd || 0);
  const tieneDeuda = deudaVisible > 0;

  // El inicio conserva el total familiar, pero el bloque financiero permite
  // consultar el detalle de un hijo sin afectar comprobantes ni pagos.
  const ultimosPagos = dashboardData?.ultimos_pagos || [];

  // El portal solo acepta mensualidades vencidas. Los próximos vencimientos
  // se muestran como información, sin posibilidad de adelantar el pago.
  const pagables = useMemo(() => {
    const vistas = new Set();
    return (resumen?.mensualidades_vencidas || [])
      .filter((m) => (vistas.has(m.id) ? false : vistas.add(m.id)));
  }, [resumen]);
  const pagablesVisibles = useMemo(() => pagables.filter(
    (mensualidad) => alumnoFiltroId === null || String(mensualidad.alumno_id) === String(alumnoFiltroId),
  ), [pagables, alumnoFiltroId]);
  const idsPagables = useMemo(() => new Set(pagables.map((m) => m.id)), [pagables]);
  const hayPorReportar = pagables.some((m) => ultimoPorMensualidad[m.id]?.estatus !== 'pendiente');
  // Rechazos vigentes: el último comprobante de una mensualidad que sigue sin pagar.
  const rechazados = useMemo(() => {
    const vistos = new Set();
    return pagables
      .map((m) => ultimoPorMensualidad[m.id])
      .filter((c) => c?.estatus === 'rechazado' && !vistos.has(c.id) && vistos.add(c.id));
  }, [pagables, ultimoPorMensualidad]);

  const abrirPago = (mensualidad = null) => {
    const valores = Array.isArray(mensualidad) ? mensualidad : mensualidad ? [mensualidad] : [];
    setMensualidadesInicialesIds(valores.map((item) => item?.id ?? item).filter(Boolean));
    setModalOpen(true);
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <WidgetHeroPortal
        nombre={user?.nombre}
        resumen={resumen}
        logoColegio={logoColegio}
        variosAlumnos={variosAlumnos}
        loadingResumen={loading}
        onPagar={hayPorReportar ? () => abrirPago() : null}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
        <div className="lg:col-span-7">
          {loading || loadingAvisos || loadingRendimiento ? (
            <div className="portal-skeleton h-40 rounded-[var(--portal-radius)] animate-pulse" aria-hidden="true" />
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

        <div className="lg:col-span-5">
          <WidgetAccionesRapidas onPagar={hayPorReportar ? () => abrirPago() : null} />
        </div>
      </div>

      <section className="space-y-5" aria-labelledby="pagos-vencimientos">
        <div>
          <h2 id="pagos-vencimientos" className="portal-section-title text-xl sm:text-2xl">Pagos y vencimientos</h2>
          {variosAlumnos && (
            <p className="mt-1 text-sm text-[var(--portal-muted)]">Reúne a todos tus hijos. El detalle de cada uno está en Historial.</p>
          )}
        </div>

        <FiltroDeudaEstudiante
          alumnos={alumnos}
          resumen={resumen}
          alumnoId={alumnoFiltroId}
          onChange={setAlumnoFinancieroId}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6 lg:items-start">
          <WidgetResumenFinanciero
            resumen={resumen}
            tieneDeuda={tieneDeuda}
            loading={loading}
            onPagar={abrirPago}
            variosAlumnos={variosAlumnos}
            alumnoId={alumnoFiltroId}
            comprobantePorMensualidad={ultimoPorMensualidad}
          />

          <div className="space-y-5 lg:space-y-6">
            <WidgetMisComprobantes
              comprobantes={comprobantes}
              variosAlumnos={variosAlumnos}
              onSubirNuevo={(mensualidadIds) => abrirPago(mensualidadIds)}
              puedeResubir={(c) => {
                const ids = c.mensualidad_ids?.length ? c.mensualidad_ids : [c.mensualidad];
                return ids.every((id) => idsPagables.has(id) && ultimoPorMensualidad[id]?.id === c.id);
              }}
            />
            <WidgetProximosVencimientos
              resumen={resumen}
              loading={loading}
              variosAlumnos={variosAlumnos}
              alumnoId={alumnoFiltroId}
            />
            <WidgetUltimosPagos ultimosPagos={ultimosPagos} loading={loading} />
          </div>
        </div>
      </section>

      {/* Acceso de pago fijo en móvil, solo si hay algo que reportar. Va sobre
          la barra inferior (64px + zona segura del iPhone) sin taparla. */}
      {!loading && hayPorReportar && (
        <div className="fixed left-0 right-0 bottom-[calc(76px+env(safe-area-inset-bottom))] px-4 z-20 sm:hidden">
          <button
            type="button"
            onClick={() => abrirPago()}
            className="w-full max-w-[480px] mx-auto flex items-center justify-center gap-2 bg-[var(--portal-hero)] text-white font-semibold py-3.5 rounded-2xl text-base hover:bg-[color-mix(in_srgb,var(--portal-hero)_85%,black)] transition-colors shadow-[0_10px_24px_color-mix(in_srgb,var(--portal-hero)_35%,transparent)]"
          >
            <Upload size={18} aria-hidden="true" />
            Reportar un pago
          </button>
        </div>
      )}

      {modalOpen && (
        <ComprobantePagoModal
          isOpen
          onClose={() => setModalOpen(false)}
          opciones={pagablesVisibles}
          mensualidadesInicialesIds={mensualidadesInicialesIds}
          comprobantePorMensualidad={ultimoPorMensualidad}
          tasaBcv={resumen?.tasa_bcv}
          variosAlumnos={variosAlumnos}
          onSuccess={() => {
            recargarComprobantes();
            recargarResumen?.();
          }}
        />
      )}
    </div>
  );
};

export default PortalDashboard;
