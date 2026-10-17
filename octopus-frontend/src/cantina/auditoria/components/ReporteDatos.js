import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { startOfMonth } from 'date-fns';
import { parseApiError } from '../../../utils/apiError';
import { exportarReporteExcel, exportarReportePDF } from '../utils/exportarAuditoria';
import { ETIQUETA_AREA, aFechaISO, esCancelacion } from './CierreFormato';

// Carga y helpers compartidos por las pestañas de reportes (CONTRATO §4).

export const TAMANO_PAGINA = 20;

// Por defecto: el mes en curso hasta hoy.
export const filtrosReporteIniciales = () => ({
  fecha_inicio: aFechaISO(startOfMonth(new Date())),
  fecha_fin: aFechaISO(new Date()),
  area: '',
  cajero: '',
});

// Filtros comunes → query params (omite los vacíos).
export const paramsDeFiltros = (filtros, extra = {}) => {
  const params = {};
  Object.entries({ ...filtros, ...extra }).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) params[k] = v;
  });
  return params;
};

// Líneas de filtros para la cabecera de la exportación.
export const textoFiltros = (filtros, cajeros, extra = []) => {
  const lineas = [`Área: ${filtros.area ? ETIQUETA_AREA[filtros.area] ?? filtros.area : 'Ambas'}`];
  if (filtros.cajero) {
    const nombre = cajeros.find((c) => String(c.id) === String(filtros.cajero))?.nombre;
    lineas.push(`Cajero: ${nombre ?? `#${filtros.cajero}`}`);
  }
  return [...lineas, ...extra];
};

// Consulta un endpoint de reportes. `clave` identifica la consulta que produjo
// los datos (patrón de AuditoriaCierres): mientras no coincida con los params
// actuales, la pestaña está cargando. Cambiar filtros, agrupación, página o
// pestaña aborta la petición anterior con AbortController.
export function useReporte(fetcher, params, { mensajeError, alRecibir } = {}) {
  const clave = JSON.stringify(params);
  const [estado, setEstado] = useState({ clave: null, data: null });
  const alRecibirRef = useRef(alRecibir);
  useEffect(() => { alRecibirRef.current = alRecibir; });

  useEffect(() => {
    const controller = new AbortController();
    fetcher(JSON.parse(clave), controller.signal)
      .then(({ data }) => {
        setEstado({ clave, data });
        alRecibirRef.current?.(data);
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`${mensajeError ?? 'No se pudo cargar el reporte'}: ${parseApiError(err)}`);
        setEstado({ clave, data: null });
      });
    return () => controller.abort();
  }, [clave, fetcher, mensajeError]);

  const cargando = estado.clave !== clave;
  return { data: cargando ? null : estado.data, cargando };
}

// Página que se reinicia a 1 cuando cambia `base` (filtros o tipo), sin efecto.
export function usePaginaReinicia(base) {
  const [pag, setPag] = useState({ base, n: 1 });
  const pagina = pag.base === base ? pag.n : 1;
  const setPagina = (n) => setPag({ base, n });
  return [pagina, setPagina];
}

// Exportación de la pestaña activa. `construir()` devuelve (o resuelve) la
// definición de utils/exportarAuditoria.js; puede pedir todas las páginas.
export function useExportacion() {
  const [exportando, setExportando] = useState(null);
  const exportar = async (formato, construir) => {
    setExportando(formato);
    try {
      const definicion = await construir();
      if (formato === 'pdf') exportarReportePDF(definicion);
      else exportarReporteExcel(definicion);
      toast.success(`Reporte exportado a ${formato === 'pdf' ? 'PDF' : 'Excel'}`);
    } catch (err) {
      toast.error(`No se pudo exportar el reporte: ${parseApiError(err)}`);
    } finally {
      setExportando(null);
    }
  };
  return { exportando, exportar };
}

// Usuarios {id, nombre} que aparecen en una respuesta, para el filtro de cajero
// (no hay endpoint de cajeros: mismo criterio que AuditoriaCierres).
export const usuariosDe = (...listas) => {
  const vistos = [];
  listas.flat().forEach((u) => { if (u?.id != null && u.nombre) vistos.push({ id: u.id, nombre: u.nombre }); });
  return vistos;
};
