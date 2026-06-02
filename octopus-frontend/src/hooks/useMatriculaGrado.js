import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import apiClient from '../api/apiClient';
import { toast } from 'react-toastify';

const ORDEN_GRADO = [
  '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
  '1er Año',   '2do Año',   '3er Año',   '4to Año',   '5to Año',
];

const NOMBRES_GRADO = {
  '1er Grado': 'Primer Grado',
  '2do Grado': 'Segundo Grado',
  '3er Grado': 'Tercer Grado',
  '4to Grado': 'Cuarto Grado',
  '5to Grado': 'Quinto Grado',
  '6to Grado': 'Sexto Grado',
  '1er Año':   'Primer Año',
  '2do Año':   'Segundo Año',
  '3er Año':   'Tercer Año',
  '4to Año':   'Cuarto Año',
  '5to Año':   'Quinto Año',
};

export function nombreGradoCompleto(gradoSeccion) {
  const partes = gradoSeccion.split(' - ');
  const nombre = NOMBRES_GRADO[partes[0]?.trim()] ?? partes[0]?.trim() ?? gradoSeccion;
  return partes.length > 1 ? `${nombre} - ${partes[1].trim()}` : nombre;
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useMatriculaGrado() {
  const [grados,            setGrados]           = useState([]);
  const [loadingGrados,     setLoadingGrados]    = useState(true);
  const [gradoSeleccionado, setGradoSeleccionado] = useState(null);
  const [alumnos,           setAlumnos]          = useState([]);
  const [loadingAlumnos,    setLoadingAlumnos]   = useState(false);
  const [orden,             setOrden]            = useState('apellido');
  const [buscar,            setBuscar]           = useState('');
  const [exportando,        setExportando]       = useState(null);

  const abortRef = useRef(null);

  // Cancelar petición pendiente al desmontar
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const cargarGrados = useCallback(async () => {
    setLoadingGrados(true);
    try {
      const { data } = await apiClient.get('secretaria/grados/');
      setGrados(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cargar la lista de grados.');
    } finally {
      setLoadingGrados(false);
    }
  }, []);

  useEffect(() => { cargarGrados(); }, [cargarGrados]);

  const cargarAlumnos = useCallback(async (grado, ord) => {
    // Cancela la petición anterior antes de iniciar una nueva
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingAlumnos(true);
    try {
      const { data } = await apiClient.get('secretaria/matricula-grado/', {
        params: { grado, orden: ord },
        signal: controller.signal,
      });
      setAlumnos(data.alumnos || []);
    } catch (err) {
      if (controller.signal.aborted) return; // ignorar peticiones canceladas
      toast.error(err.response?.data?.detail || 'No se pudo cargar la matrícula del grado.');
    } finally {
      // Solo actualizar el estado si esta petición no fue cancelada
      if (!controller.signal.aborted) setLoadingAlumnos(false);
    }
  }, []);

  const seleccionarGrado = useCallback((grado) => {
    setGradoSeleccionado(grado);
    setBuscar('');
    cargarAlumnos(grado, orden);
  }, [orden, cargarAlumnos]);

  const cambiarOrden = useCallback((nuevoOrden) => {
    setOrden(nuevoOrden);
    if (gradoSeleccionado) cargarAlumnos(gradoSeleccionado, nuevoOrden);
  }, [gradoSeleccionado, cargarAlumnos]);

  const exportar = useCallback(async (tipo) => {
    if (!gradoSeleccionado) return;
    const url  = tipo === 'excel'
      ? 'secretaria/matricula-grado/exportar-excel/'
      : 'secretaria/matricula-grado/exportar-pdf/';
    const mime = tipo === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    const ext  = tipo === 'excel' ? 'xlsx' : 'pdf';

    setExportando(tipo);
    try {
      const response = await apiClient.get(url, {
        params: { grado: gradoSeleccionado, orden },
        responseType: 'blob',
      });
      descargarBlob(
        new Blob([response.data], { type: mime }),
        `matricula_${gradoSeleccionado.replace(/ /g, '_')}.${ext}`
      );
      toast.success(`Archivo ${tipo.toUpperCase()} descargado.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || `No se pudo exportar el archivo ${tipo.toUpperCase()}.`);
    } finally {
      setExportando(null);
    }
  }, [gradoSeleccionado, orden]);

  const gradosOrdenados = useMemo(() =>
    [...grados].sort((a, b) => {
      const ai = ORDEN_GRADO.findIndex(g => a.grado_seccion.startsWith(g));
      const bi = ORDEN_GRADO.findIndex(g => b.grado_seccion.startsWith(g));
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.grado_seccion.localeCompare(b.grado_seccion);
    }),
    [grados]
  );

  const alumnosFiltrados = useMemo(() => {
    if (!buscar.trim()) return alumnos;
    const q = buscar.toLowerCase();
    return alumnos.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      a.apellido.toLowerCase().includes(q) ||
      (a.cedula_escolar || '').toLowerCase().includes(q)
    );
  }, [alumnos, buscar]);

  const totalAlumnos = useMemo(
    () => grados.reduce((s, g) => s + (g.total_alumnos ?? 0), 0),
    [grados]
  );

  return {
    grados,
    gradosOrdenados,
    loadingGrados,
    gradoSeleccionado,
    alumnosFiltrados,
    loadingAlumnos,
    orden,
    buscar,
    setBuscar,
    exportando,
    totalAlumnos,
    seleccionarGrado,
    cambiarOrden,
    exportar,
  };
}
