import { useState, useEffect, useContext, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PortalAuthContext } from '../context/PortalAuthContext';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
import { getDashboard } from '../api/portal.service';
import { usePortalHeroExtra } from '../hooks/usePortalHeroExtra';
import EstudianteSelector from '../components/EstudianteSelector';
import ComprobantePagoModal from '../components/ComprobantePagoModal';
import WidgetHeroPortal from '../components/widgets/WidgetHeroPortal';
import WidgetAccionesRapidas from '../components/widgets/WidgetAccionesRapidas';
import WidgetResumenFinanciero from '../components/widgets/WidgetResumenFinanciero';
import WidgetProximosVencimientos from '../components/widgets/WidgetProximosVencimientos';
import WidgetUltimosPagos from '../components/widgets/WidgetUltimosPagos';
import WidgetFamiliaHoy from '../components/widgets/WidgetFamiliaHoy';

const PortalDashboard = () => {
  const { user } = useContext(PortalAuthContext);
  const { logoColegio } = useOutletContext() || {};

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const { alumnoActivo, setAlumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [modalOpen, setModalOpen] = useState(false);
  const [mensualidadSeleccionada, setMensualidadSeleccionada] = useState(null);

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

  // Resumen financiero del alumno activo (o global si solo hay uno)
  const ultimosPagos = alumnoActivo && dashboardData?.alumnos?.length > 1
    ? (dashboardData?.ultimos_pagos || []).filter(p => p.alumno_id === alumnoActivo.id)
    : (dashboardData?.ultimos_pagos || []);

  const resumen = dashboardData?.resumen_financiero;
  const variosAlumnos = (dashboardData?.alumnos?.length || 0) > 1;
  const tieneDeuda = resumen && Number(resumen.total_deuda_usd) > 0;

  const abrirModalComprobante = (mensualidad) => {
    setMensualidadSeleccionada(mensualidad);
    setModalOpen(true);
  };

  const handlePagarRapido = () => {
    const primeraVencida = resumen?.mensualidades_vencidas?.[0];
    if (primeraVencida) {
      abrirModalComprobante(primeraVencida);
    } else {
      toast.info('No tienes mensualidades vencidas pendientes.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ash)]">Mi familia</p>
      {/* Selector de estudiantes */}
      {loading ? (
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-[var(--surface-sunken)] rounded-full animate-pulse" />
          <div className="h-10 w-28 bg-[var(--surface-sunken)] rounded-full animate-pulse" />
        </div>
      ) : (
        <EstudianteSelector
          alumnos={dashboardData?.alumnos || []}
          alumnoActivo={alumnoActivo}
          onSelect={setAlumnoActivo}
        />
      )}
      </div>

      {/* Con varios hijos la deuda suma a todos; el hijo seleccionado solo
          filtra los últimos pagos. */}
      {alumnoActivo && variosAlumnos && (
        <p className="text-sm text-[var(--ash)]">
          La deuda incluye a todos tus hijos. Últimos pagos de{' '}
          <span className="font-medium text-[var(--jet-mid)]">
            {alumnoActivo.nombre} {alumnoActivo.apellido}
          </span>
          {' '}· {alumnoActivo.grado_seccion}
        </p>
      )}

      <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-12 md:gap-5 md:items-stretch">
        <div className="md:col-span-12">
          <WidgetHeroPortal
            nombre={user?.nombre}
            resumen={resumen}
            logoColegio={logoColegio}
            variosAlumnos={variosAlumnos}
            loadingResumen={loading}
          />
        </div>

        <div className="md:col-span-12">
          {loading || loadingAvisos || loadingRendimiento ? <div className="h-28 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" /> : <WidgetFamiliaHoy deuda={Number(resumen?.total_deuda_usd || 0)} avisos={avisosSinLeer} alertas={alertaRendimiento} alumnoActivo={alumnoActivo} onPagar={handlePagarRapido} />}
        </div>

        <div className="md:col-span-12">
          <p className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--ash)]">Acciones frecuentes</p>
          <WidgetAccionesRapidas onPagar={handlePagarRapido} />
        </div>

        <div className="md:col-span-12"><p className="px-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--ash)]">Pagos y vencimientos</p></div>
        <div className="md:col-span-4">
          <WidgetResumenFinanciero
            resumen={resumen}
            tieneDeuda={tieneDeuda}
            loading={loading}
            onPagar={abrirModalComprobante}
            variosAlumnos={variosAlumnos}
          />
        </div>

        <div className="md:col-span-4">
          <WidgetProximosVencimientos resumen={resumen} loading={loading} variosAlumnos={variosAlumnos} />
        </div>

        <div className="md:col-span-4">
          <WidgetUltimosPagos ultimosPagos={ultimosPagos} loading={loading} />
        </div>
      </div>

      {/* Botón de pago — en flujo (solo desktop sm:) */}
      {!loading && (
        <div className="hidden sm:block pt-2">
          <button
            onClick={handlePagarRapido}
            className="w-full flex items-center justify-center gap-2 bg-[var(--portal-primary,#0fa3b1)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--portal-primary,#0fa3b1)_85%,black)] transition-colors"
          >
            Pagar por transferencia
          </button>
        </div>
      )}

      {/* Botón flotante móvil — siempre accesible sin scroll */}
      {!loading && (
        <div className="fixed bottom-16 left-0 right-0 px-4 z-20 sm:hidden">
          <button
            onClick={handlePagarRapido}
            className="w-full max-w-[480px] mx-auto flex items-center justify-center gap-2 bg-[var(--portal-primary,#0fa3b1)] text-white font-semibold py-3.5 rounded-xl text-base hover:bg-[color-mix(in_srgb,var(--portal-primary,#0fa3b1)_85%,black)] transition-colors shadow-lg shadow-[var(--portal-primary,#0fa3b1)]/30"
          >
            Pagar por transferencia
          </button>
        </div>
      )}

      {/* Modal comprobante */}
      <ComprobantePagoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mensualidad={mensualidadSeleccionada}
        tasaBcv={resumen?.tasa_bcv}
        onSuccess={() => {
          setModalOpen(false);
          cargarDashboard();
        }}
      />
    </div>
  );
};

export default PortalDashboard;
