import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { getDashboard, getSaldoTarjetaCantina, getHistorialConsumoCantina } from '../api/portal.service';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
import EstudianteSelector from '../components/EstudianteSelector';
import SaldoTarjetaCard from '../components/SaldoTarjetaCard';
import HistorialConsumoList from '../components/HistorialConsumoList';
import RecargarTarjetaModal from '../components/RecargarTarjetaModal';

const PortalCantina = () => {
  const [alumnos, setAlumnos] = useState([]);
  const { alumnoActivo, setAlumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);

  const [saldoTarjeta, setSaldoTarjeta] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const [movimientos, setMovimientos] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  // Cargar alumnos del representante al montar
  useEffect(() => {
    const controller = new AbortController();

    const cargarAlumnos = async () => {
      setLoadingAlumnos(true);
      try {
        const res = await getDashboard(controller.signal);
        const lista = res.data.alumnos || [];
        setAlumnos(lista);
        sincronizarConLista(lista);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar los datos del representante.');
      } finally {
        setLoadingAlumnos(false);
      }
    };

    cargarAlumnos();
    return () => controller.abort();
  }, [sincronizarConLista]);

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

  const cargarHistorial = useCallback(async (alumnoId, paginaActual, signal) => {
    setLoadingHistorial(true);
    try {
      const res = await getHistorialConsumoCantina(alumnoId, paginaActual, 10, signal);
      const data = res.data;
      setMovimientos(data.results || []);
      setTotalPaginas(data.total_pages || 1);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar el historial de consumo.');
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  // Cargar saldo cuando cambia el alumno activo
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();
    cargarSaldo(alumnoActivo.id, controller.signal);
    return () => controller.abort();
  }, [alumnoActivo, cargarSaldo]);

  // Cargar historial cuando cambia el alumno activo o la página
  useEffect(() => {
    if (!alumnoActivo) return;
    const controller = new AbortController();
    cargarHistorial(alumnoActivo.id, pagina, controller.signal);
    return () => controller.abort();
  }, [alumnoActivo, pagina, cargarHistorial]);

  const handleSelectAlumno = (alumno) => {
    setAlumnoActivo(alumno);
    setPagina(1);
  };

  const handleRecargaExitosa = () => {
    setModalOpen(false);
    if (alumnoActivo) {
      cargarSaldo(alumnoActivo.id);
      cargarHistorial(alumnoActivo.id, pagina);
    }
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div>
        <h1 className="text-lg font-bold text-gray-800">Cantina</h1>
        <p className="text-xs text-gray-400 mt-0.5">Saldo y consumo de la tarjeta de cantina</p>
      </div>

      {/* Selector de estudiante */}
      {loadingAlumnos ? (
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
        </div>
      ) : (
        <EstudianteSelector
          alumnos={alumnos}
          alumnoActivo={alumnoActivo}
          onSelect={handleSelectAlumno}
        />
      )}

      {alumnoActivo && alumnos.length > 1 && (
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">
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

      {/* Historial de consumo — solo si el alumno tiene tarjeta */}
      {(loadingSaldo || saldoTarjeta?.tiene_tarjeta) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Historial de consumo</h2>
          <HistorialConsumoList
            movimientos={movimientos}
            loading={loadingAlumnos || loadingHistorial}
            pagina={pagina}
            totalPaginas={totalPaginas}
            onCambiarPagina={setPagina}
          />
        </div>
      )}

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
