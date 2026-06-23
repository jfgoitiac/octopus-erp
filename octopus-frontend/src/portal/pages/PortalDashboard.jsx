import { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, Clock, Banknote, ArrowRight, CalendarDays } from 'lucide-react';
import { toast } from 'react-toastify';
import { PortalAuthContext } from '../context/PortalAuthContext';
import { getDashboard } from '../api/portal.service';
import EstudianteSelector from '../components/EstudianteSelector';
import SkeletonCard from '../components/SkeletonCard';
import ComprobantePagoModal from '../components/ComprobantePagoModal';

// Formatea fecha como "12 de mayo"
const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM", { locale: es });
  } catch {
    return fechaStr;
  }
};

// Formatea fecha con año: "12 de mayo 2025"
const formatFechaConAnio = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

// Badge de estatus de pago
const EstatusBadge = ({ estatus }) => {
  const config = {
    completado: 'bg-green-100 text-green-700',
    anulado: 'bg-red-100 text-red-700',
    en_revision: 'bg-yellow-100 text-yellow-700',
  };
  const labels = {
    completado: 'Pagado',
    anulado: 'Anulado',
    en_revision: 'En revisión',
  };
  const cls = config[estatus] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {labels[estatus] || estatus}
    </span>
  );
};

const PortalDashboard = () => {
  const { user } = useContext(PortalAuthContext);

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [alumnoActivo, setAlumnoActivo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mensualidadSeleccionada, setMensualidadSeleccionada] = useState(null);

  const fechaHoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const cargarDashboard = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getDashboard(signal);
      const data = res.data;
      setDashboardData(data);
      if (data.alumnos?.length > 0) {
        setAlumnoActivo(data.alumnos[0]);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar la información. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargarDashboard(controller.signal);
    return () => controller.abort();
  }, [cargarDashboard]);

  // Resumen financiero del alumno activo (o global si solo hay uno)
  const ultimosPagos = alumnoActivo && dashboardData?.alumnos?.length > 1
    ? (dashboardData?.ultimos_pagos || []).filter(p => p.alumno_id === alumnoActivo.id)
    : (dashboardData?.ultimos_pagos || []);

  const resumen = dashboardData?.resumen_financiero;
  const tieneDeuda = resumen && Number(resumen.total_deuda_usd) > 0;

  const abrirModalComprobante = (mensualidad) => {
    setMensualidadSeleccionada(mensualidad);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Saludo */}
      <div>
        <p className="text-xs text-gray-400 capitalize">{fechaHoy}</p>
        <h1 className="text-xl font-bold text-gray-800 mt-0.5">
          Hola, {user?.nombre} 👋
        </h1>
      </div>

      {/* Selector de estudiantes */}
      {loading ? (
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
        </div>
      ) : (
        <EstudianteSelector
          alumnos={dashboardData?.alumnos || []}
          alumnoActivo={alumnoActivo}
          onSelect={setAlumnoActivo}
        />
      )}

      {/* Nombre del alumno activo (si hay varios) */}
      {alumnoActivo && dashboardData?.alumnos?.length > 1 && (
        <p className="text-sm text-gray-500">
          Mostrando información de{' '}
          <span className="font-medium text-gray-700">
            {alumnoActivo.nombre} {alumnoActivo.apellido}
          </span>
          {' '}· {alumnoActivo.grado_seccion}
        </p>
      )}

      {/* Card Resumen Financiero */}
      {loading ? (
        <SkeletonCard lines={3} />
      ) : resumen ? (
        <div className={`rounded-2xl p-4 border ${tieneDeuda ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            {tieneDeuda ? (
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
            ) : (
              <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
            )}
            <span className={`font-semibold text-sm ${tieneDeuda ? 'text-red-700' : 'text-green-700'}`}>
              {tieneDeuda
                ? `Deuda pendiente: $${Number(resumen.total_deuda_usd).toFixed(2)} USD`
                : 'Solvente — al día con los pagos'}
            </span>
          </div>

          {/* Mensualidades vencidas */}
          {resumen.mensualidades_vencidas?.length > 0 && (
            <div className="space-y-2">
              {resumen.mensualidades_vencidas.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {m.mes_nombre} {m.anio}
                    </p>
                    <p className="text-xs text-red-500">{m.dias_mora} días de mora</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="text-sm font-semibold text-gray-800">${Number(m.monto_usd).toFixed(2)}</p>
                    <button
                      onClick={() => abrirModalComprobante(m)}
                      className="px-3 py-1.5 rounded-lg bg-[#0fa3b1]/10 text-[#0fa3b1] text-sm font-medium min-h-[44px] flex items-center hover:bg-[#0fa3b1]/20 transition-colors"
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Card Próximos Vencimientos */}
      {loading ? (
        <SkeletonCard lines={2} />
      ) : resumen?.proximos_vencimientos?.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={16} className="text-[#0fa3b1]" />
            <h2 className="text-sm font-semibold text-gray-700">Próximos vencimientos</h2>
          </div>
          <div className="space-y-2">
            {resumen.proximos_vencimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{m.mes_nombre} {m.anio}</p>
                  {m.fecha_vencimiento && (
                    <p className="text-xs text-gray-400">Vence: {formatFecha(m.fecha_vencimiento)}</p>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800">${Number(m.monto_usd).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Card Últimos Pagos */}
      {loading ? (
        <SkeletonCard lines={3} />
      ) : ultimosPagos.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#0fa3b1]" />
              <h2 className="text-sm font-semibold text-gray-700">Últimos pagos</h2>
            </div>
            <Link
              to="/portal/historial"
              className="flex items-center gap-1 text-sm text-[#0fa3b1] py-2 px-1 -mx-1 min-h-[44px] hover:underline"
            >
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {ultimosPagos.slice(0, 3).map((pago) => (
              <div key={pago.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm text-gray-700">{pago.concepto}</p>
                  <p className="text-xs text-gray-400">{formatFechaConAnio(pago.fecha_pago)}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-sm font-semibold text-gray-800">${Number(pago.monto_usd).toFixed(2)}</p>
                  <EstatusBadge estatus={pago.estatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Botón de pago — en flujo (solo desktop sm:) */}
      {!loading && (
        <div className="hidden sm:block pt-2">
          <button
            onClick={() => {
              const primeraVencida = resumen?.mensualidades_vencidas?.[0];
              if (primeraVencida) {
                abrirModalComprobante(primeraVencida);
              } else {
                toast.info('No tienes mensualidades vencidas pendientes.');
              }
            }}
            className="w-full flex items-center justify-center gap-2 bg-[#0fa3b1] text-white font-medium py-3 rounded-xl text-sm hover:bg-[#0d93a0] transition-colors"
          >
            <Banknote size={16} />
            Pagar por transferencia
          </button>
        </div>
      )}

      {/* Botón flotante móvil — siempre accesible sin scroll */}
      {!loading && (
        <div className="fixed bottom-16 left-0 right-0 px-4 z-20 sm:hidden">
          <button
            onClick={() => {
              const primeraVencida = resumen?.mensualidades_vencidas?.[0];
              if (primeraVencida) {
                abrirModalComprobante(primeraVencida);
              } else {
                toast.info('No tienes mensualidades vencidas pendientes.');
              }
            }}
            className="w-full max-w-[480px] mx-auto flex items-center justify-center gap-2 bg-[#0fa3b1] text-white font-semibold py-3.5 rounded-xl text-base hover:bg-[#0d93a0] transition-colors shadow-lg shadow-[#0fa3b1]/30"
          >
            <Banknote size={18} />
            Pagar por transferencia
          </button>
        </div>
      )}

      {/* Modal comprobante */}
      <ComprobantePagoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mensualidad={mensualidadSeleccionada}
        onSuccess={() => {
          setModalOpen(false);
          cargarDashboard();
        }}
      />
    </div>
  );
};

export default PortalDashboard;
