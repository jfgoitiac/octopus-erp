import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { toast } from 'react-toastify';
import { getDashboard, getHistorial } from '../api/portal.service';
import EstudianteSelector from '../components/EstudianteSelector';
import SkeletonCard from '../components/SkeletonCard';
import { SkeletonLine } from '../components/SkeletonCard';

const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

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

const PortalHistorialPagos = () => {
  const [alumnos, setAlumnos] = useState([]);
  const [alumnoActivo, setAlumnoActivo] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingPagos, setLoadingPagos] = useState(false);

  // Cargar alumnos al montar
  useEffect(() => {
    const cargarAlumnos = async () => {
      setLoadingAlumnos(true);
      try {
        const res = await getDashboard();
        const lista = res.data.alumnos || [];
        setAlumnos(lista);
        if (lista.length > 0) setAlumnoActivo(lista[0]);
      } catch {
        toast.error('No se pudo cargar los datos del representante.');
      } finally {
        setLoadingAlumnos(false);
      }
    };
    cargarAlumnos();
  }, []);

  // Cargar historial cuando cambia alumno o página
  useEffect(() => {
    if (!alumnoActivo) return;
    const cargarHistorial = async () => {
      setLoadingPagos(true);
      try {
        const res = await getHistorial(alumnoActivo.id, paginaActual);
        const data = res.data;
        setPagos(data.results || data.pagos || []);
        // Soporte para paginación estándar DRF: count / page_size
        if (data.count !== undefined) {
          const pageSize = data.page_size || 10;
          setTotalPaginas(Math.ceil(data.count / pageSize));
        } else if (data.total_paginas) {
          setTotalPaginas(data.total_paginas);
        }
      } catch {
        toast.error('No se pudo cargar el historial de pagos.');
      } finally {
        setLoadingPagos(false);
      }
    };
    cargarHistorial();
  }, [alumnoActivo, paginaActual]);

  const handleSelectAlumno = (alumno) => {
    setAlumnoActivo(alumno);
    setPaginaActual(1);
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div>
        <h1 className="text-lg font-bold text-gray-800">Historial de pagos</h1>
        <p className="text-xs text-gray-400 mt-0.5">Registro completo de tus pagos</p>
      </div>

      {/* Selector de alumno */}
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

      {/* Nombre del alumno activo */}
      {alumnoActivo && (
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">
            {alumnoActivo.nombre} {alumnoActivo.apellido}
          </span>{' '}
          · {alumnoActivo.grado_seccion}
        </p>
      )}

      {/* Lista de pagos */}
      {loadingPagos ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 animate-pulse">
              <div className="flex justify-between">
                <SkeletonLine width="w-2/5" height="h-4" />
                <SkeletonLine width="w-1/5" height="h-4" />
              </div>
              <SkeletonLine width="w-1/3" height="h-3" />
            </div>
          ))}
        </div>
      ) : pagos.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
          <Receipt size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay pagos registrados aún.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagos.map((pago) => (
            <div
              key={pago.id}
              className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{pago.concepto}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFecha(pago.fecha_pago)}</p>
                  <p className="text-xs text-gray-400 capitalize">{pago.metodo_pago || 'Transferencia'}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-800">
                    ${Number(pago.monto_usd).toFixed(2)}
                  </p>
                  <EstatusBadge estatus={pago.estatus} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {!loadingPagos && totalPaginas > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
            disabled={paginaActual === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <span className="text-xs text-gray-500">
            Página {paginaActual} de {totalPaginas}
          </span>
          <button
            onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaActual === totalPaginas}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Siguiente
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default PortalHistorialPagos;
