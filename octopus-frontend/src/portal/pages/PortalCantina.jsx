import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getSaldoTarjetaCantina, getConsumosCantina, getCuentaCantina } from '../api/portal.service';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
import EstudianteSelector from '../components/EstudianteSelector';
import SaldoTarjetaCard from '../components/SaldoTarjetaCard';
import EstadoCuentaConsumos from '../components/EstadoCuentaConsumos';
import DetalleConsumoModal from '../components/DetalleConsumoModal';
import RecargarTarjetaModal from '../components/RecargarTarjetaModal';
import CuentaCantinaCard from '../components/CuentaCantinaCard';

const PortalCantina = () => {
  const [alumnos, setAlumnos] = useState([]);
  const { dashboardData, loadingDashboard } = useOutletContext() || {};
  const { alumnoActivo, setAlumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);

  const [saldoTarjeta, setSaldoTarjeta] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [loadingConsumos, setLoadingConsumos] = useState(false);
  const [consumoAbierto, setConsumoAbierto] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);

  // Cuenta por cobrar de cantina/librería (es del representante, no de un alumno)
  const [cuenta, setCuenta] = useState(null);
  const [loadingCuenta, setLoadingCuenta] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const cargarCuenta = async () => {
      setLoadingCuenta(true);
      try {
        const res = await getCuentaCantina(controller.signal);
        setCuenta(res.data);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar la cuenta de cantina y librería.');
      } finally {
        setLoadingCuenta(false);
      }
    };
    cargarCuenta();
    return () => controller.abort();
  }, []);

  // La lista ya fue solicitada por PortalLayout; compartirla evita repetir el
  // endpoint de dashboard en cada pantalla.
  useEffect(() => {
    if (!dashboardData) {
      setLoadingAlumnos(Boolean(loadingDashboard));
      return;
    }
    const lista = dashboardData.alumnos || [];
    setAlumnos(lista);
    sincronizarConLista(lista);
    setLoadingAlumnos(false);
  }, [dashboardData, loadingDashboard, sincronizarConLista]);

  // PortalSaldoTarjetaView SIEMPRE responde un arreglo (uno por alumno,
  // filtrado a 1 elemento cuando se pasa alumno_id) — nunca un objeto suelto.
  const cargarSaldo = useCallback(async (alumnoId, signal) => {
    setLoadingSaldo(true);
    try {
      const res = await getSaldoTarjetaCantina(alumnoId, signal);
      const lista = Array.isArray(res.data) ? res.data : [];
      setSaldoTarjeta(lista.find((r) => String(r.alumno_id) === String(alumnoId)) || lista[0] || null);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar el saldo de la tarjeta.');
    } finally {
      setLoadingSaldo(false);
    }
  }, []);

  const cargarConsumos = useCallback(async (alumnoId, paginaActual, signal) => {
    setLoadingConsumos(true);
    try {
      const res = await getConsumosCantina(alumnoId, paginaActual, 10, signal);
      setEstadoCuenta(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar el estado de cuenta de consumos.');
    } finally {
      setLoadingConsumos(false);
    }
  }, []);

  // Cargar saldo cuando cambia el alumno activo
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();
    cargarSaldo(alumnoActivo.id, controller.signal);
    return () => controller.abort();
  }, [alumnoActivo, cargarSaldo]);

  // Cargar consumos cuando cambia el alumno activo o la página
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();
    cargarConsumos(alumnoActivo.id, pagina, controller.signal);
    return () => controller.abort();
  }, [alumnoActivo, pagina, cargarConsumos]);

  const handleSelectAlumno = (alumno) => {
    setAlumnoActivo(alumno);
    setPagina(1);
  };

  const handleRecargaExitosa = () => {
    setModalOpen(false);
    if (alumnoActivo) {
      cargarSaldo(alumnoActivo.id);
      cargarConsumos(alumnoActivo.id, pagina);
    }
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div>
        <h1 className="text-lg font-bold text-[var(--jet)]">Cantina</h1>
        <p className="text-xs text-[var(--ash)] mt-0.5">Saldo de la tarjeta y estado de cuenta de consumos</p>
      </div>

      {/* Cuenta de cantina y librería (deuda del representante) */}
      <CuentaCantinaCard cuenta={cuenta} loading={loadingCuenta} onVerConsumo={setConsumoAbierto} />

      {/* Selector de estudiante */}
      {loadingAlumnos ? (
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-[var(--surface-sunken)] rounded-full animate-pulse" />
        </div>
      ) : (
        <EstudianteSelector
          alumnos={alumnos}
          alumnoActivo={alumnoActivo}
          onSelect={handleSelectAlumno}
        />
      )}

      {alumnoActivo && alumnos.length > 1 && (
        <p className="text-sm text-[var(--ash)]">
          <span className="font-medium text-[var(--jet-mid)]">
            {alumnoActivo.nombre} {alumnoActivo.apellido}
          </span>{' '}
          · {alumnoActivo.grado_seccion}
        </p>
      )}

      {/* Saldo de la tarjeta */}
      <SaldoTarjetaCard
        saldoTarjeta={saldoTarjeta}
        loading={loadingAlumnos || loadingSaldo}
        onRecargar={() => setModalOpen(true)}
      />

      {/* Estado de cuenta de consumos — también para alumnos sin tarjeta, que
          pueden tener compras cargadas a la cuenta del representante */}
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--jet-mid)]">Estado de cuenta de consumos</h2>
          <p className="text-xs text-[var(--ash)] mt-0.5">Toca una compra para ver el detalle</p>
        </div>
        <EstadoCuentaConsumos
          estado={estadoCuenta}
          loading={loadingAlumnos || loadingConsumos}
          pagina={pagina}
          onCambiarPagina={setPagina}
          onVerConsumo={setConsumoAbierto}
        />
      </div>

      <DetalleConsumoModal consumo={consumoAbierto} onClose={() => setConsumoAbierto(null)} />

      {/* Modal de recarga */}
      <RecargarTarjetaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        alumno={alumnoActivo}
        onSuccess={handleRecargaExitosa}
      />
    </div>
  );
};

export default PortalCantina;
