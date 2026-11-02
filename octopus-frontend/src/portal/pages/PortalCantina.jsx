import { useState, useEffect, useMemo } from 'react';
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
  // La lista ya fue solicitada por PortalLayout; compartirla evita repetir el
  // endpoint de dashboard en cada pantalla.
  const { dashboardData, loadingDashboard } = useOutletContext() || {};
  const alumnos = useMemo(() => dashboardData?.alumnos || [], [dashboardData]);
  const loadingAlumnos = !dashboardData && Boolean(loadingDashboard);
  const { alumnoActivo, setAlumnoActivo, sincronizarConLista } = useAlumnoActivo();

  const [saldoTarjeta, setSaldoTarjeta] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [loadingConsumos, setLoadingConsumos] = useState(false);
  const [consumoAbierto, setConsumoAbierto] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  // Se incrementa tras una recarga para volver a pedir saldo y consumos.
  const [recargasEnviadas, setRecargasEnviadas] = useState(0);

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

  useEffect(() => {
    if (dashboardData) sincronizarConLista(alumnos);
  }, [dashboardData, alumnos, sincronizarConLista]);

  // Cargar saldo cuando cambia el alumno activo o tras una recarga
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();

    const cargarSaldo = async () => {
      setLoadingSaldo(true);
      try {
        // PortalSaldoTarjetaView SIEMPRE responde un arreglo (uno por alumno,
        // filtrado a 1 elemento cuando se pasa alumno_id) — nunca un objeto suelto.
        const res = await getSaldoTarjetaCantina(alumnoActivo.id, controller.signal);
        const lista = Array.isArray(res.data) ? res.data : [];
        setSaldoTarjeta(lista.find((r) => String(r.alumno_id) === String(alumnoActivo.id)) || lista[0] || null);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar el saldo de la tarjeta.');
      } finally {
        if (!controller.signal.aborted) setLoadingSaldo(false);
      }
    };

    cargarSaldo();
    return () => controller.abort();
  }, [alumnoActivo, recargasEnviadas]);

  // Cargar consumos cuando cambia el alumno activo, la página o tras una recarga
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();

    const cargarConsumos = async () => {
      setLoadingConsumos(true);
      try {
        const res = await getConsumosCantina(alumnoActivo.id, pagina, 10, controller.signal);
        setEstadoCuenta(res.data);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar el estado de cuenta de consumos.');
      } finally {
        if (!controller.signal.aborted) setLoadingConsumos(false);
      }
    };

    cargarConsumos();
    return () => controller.abort();
  }, [alumnoActivo, pagina, recargasEnviadas]);

  const handleSelectAlumno = (alumno) => {
    setAlumnoActivo(alumno);
    setPagina(1);
  };

  const handleRecargaExitosa = () => {
    setModalOpen(false);
    setRecargasEnviadas((n) => n + 1);
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
