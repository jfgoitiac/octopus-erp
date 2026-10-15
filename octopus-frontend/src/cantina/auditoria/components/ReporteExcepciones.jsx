import { useState } from 'react';
import { Crown, Hash, Users, Wallet } from 'lucide-react';
import { getReporteExcepciones } from '../api/auditoriaApi';
import { etiquetaMetodo } from '../../../components/cantina/metodoPagoUtils';
import { obtenerTodasLasPaginas } from '../utils/exportarAuditoria';
import { usd } from './CierreFormato';
import { ReporteBarra, ReporteExportar, ReportePaginacion, ReporteResumen, ReporteSelector } from './ReporteControles';
import {
  TAMANO_PAGINA, paramsDeFiltros, textoFiltros, useExportacion, usePaginaReinicia, useReporte, usuariosDe,
} from './ReporteDatos';
import ReporteTabla, { ReporteSkeleton } from './ReporteTabla';

// Pestaña Excepciones — GET reportes/excepciones/?tipo= (CONTRATO §4, paginado).
// "Anulaciones" cubre también las devoluciones: el sistema no tiene un flujo
// de devolución separado.

const TIPOS = [
  { valor: 'anulaciones', etiqueta: 'Anulaciones y devoluciones' },
  { valor: 'descuentos', etiqueta: 'Descuentos' },
  { valor: 'manuales', etiqueta: 'Ventas manuales' },
];

const ORIGEN = { escaner: 'Escáner', manual: 'Manual', mixto: 'Mixto', no_aplica: 'No aplica' };

const etiquetaTipo = (tipo) => TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;

const Origen = ({ valor }) => (
  <span
    className="inline-block rounded-lg px-2 py-0.5 text-xs font-medium"
    style={valor === 'manual' || valor === 'mixto'
      ? { background: 'var(--yellow-light)', color: 'var(--amber-ink)' }
      : { color: 'var(--jet-mid)' }}
  >
    {ORIGEN[valor] ?? valor ?? '—'}
  </span>
);

const columnasExcepciones = (tipo) => [
  { key: 'venta_id', label: 'Venta', tipo: 'texto', valor: (f) => (f.venta_id != null ? `#${f.venta_id}` : '') },
  { key: 'fecha_hora', label: 'Fecha y hora', tipo: 'fechaHora' },
  { key: 'cajero', label: 'Cajero', tipo: 'texto', valor: (f) => f.cajero?.nombre },
  { key: 'turno', label: 'Turno', tipo: 'texto', valor: (f) => f.turno?.etiqueta },
  { key: 'metodo_pago', label: 'Método', tipo: 'texto', valor: (f) => (f.metodo_pago ? etiquetaMetodo(f.metodo_pago) : '') },
  { key: 'total_usd', label: 'Total', tipo: 'monto' },
  ...(tipo === 'descuentos' ? [{ key: 'descuento_usd', label: 'Descuento', tipo: 'monto' }] : []),
  ...(tipo === 'manuales'
    ? [
        { key: 'origen_producto', label: 'Origen producto', tipo: 'texto', valor: (f) => ORIGEN[f.origen_producto] ?? f.origen_producto, render: (f) => <Origen valor={f.origen_producto} /> },
        { key: 'origen_alumno', label: 'Origen alumno', tipo: 'texto', valor: (f) => ORIGEN[f.origen_alumno] ?? f.origen_alumno, render: (f) => <Origen valor={f.origen_alumno} /> },
      ]
    : [{ key: 'motivo', label: 'Motivo', tipo: 'texto' }]),
  ...(tipo === 'anulaciones' ? [{ key: 'anulada_por', label: 'Anulada por', tipo: 'texto', valor: (f) => f.anulada_por?.nombre }] : []),
];

const COLUMNAS_RESPONSABLE = [
  { key: 'usuario', label: 'Responsable', tipo: 'texto', valor: (f) => f.usuario?.nombre },
  { key: 'cantidad', label: 'Casos', tipo: 'entero' },
  { key: 'monto_usd', label: 'Monto', tipo: 'monto' },
];

export default function ReporteExcepciones({ filtros, cajeros, onUsuarios }) {
  const [tipo, setTipo] = useState('anulaciones');
  const base = paramsDeFiltros(filtros, { tipo });
  const [pagina, setPagina] = usePaginaReinicia(JSON.stringify(base));
  const { data, cargando } = useReporte(getReporteExcepciones, { ...base, page: pagina, page_size: TAMANO_PAGINA }, {
    mensajeError: 'No se pudo cargar el reporte de excepciones',
    alRecibir: (d) => onUsuarios(usuariosDe(
      (d?.results ?? []).map((r) => r.cajero),
      (d?.por_responsable ?? []).map((r) => r.usuario),
    )),
  });
  const { exportando, exportar } = useExportacion();

  const columnas = columnasExcepciones(tipo);
  const resumen = data?.resumen ?? {};
  const porResponsable = [...(data?.por_responsable ?? [])].sort((a, b) => Number(b.cantidad) - Number(a.cantidad));
  const totalesResponsable = { cantidad: resumen.cantidad, monto_usd: resumen.monto_usd };

  const definicion = async () => {
    const todo = await obtenerTodasLasPaginas(getReporteExcepciones, base);
    return {
      titulo: `Excepciones: ${etiquetaTipo(tipo).toLowerCase()}`,
      desde: filtros.fecha_inicio,
      hasta: filtros.fecha_fin,
      filtros: textoFiltros(filtros, cajeros),
      secciones: [
        { titulo: 'Detalle', columnas, filas: todo.results },
        {
          titulo: 'Por responsable',
          columnas: COLUMNAS_RESPONSABLE,
          filas: todo.por_responsable ?? [],
          totales: { cantidad: todo.resumen?.cantidad, monto_usd: todo.resumen?.monto_usd },
        },
      ],
    };
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ReporteBarra
        exportar={(
          <ReporteExportar
            exportando={exportando}
            deshabilitado={cargando || !data}
            onPdf={() => exportar('pdf', definicion)}
            onExcel={() => exportar('excel', definicion)}
          />
        )}
      >
        <ReporteSelector etiqueta="Tipo" opciones={TIPOS} valor={tipo} onCambio={setTipo} />
      </ReporteBarra>

      {cargando ? <ReporteSkeleton /> : (
        <>
          <ReporteResumen
            items={[
              { etiqueta: 'Casos', valor: Number(resumen.cantidad ?? 0).toLocaleString('en-US'), icono: Hash },
              { etiqueta: 'Monto', valor: usd(resumen.monto_usd), icono: Wallet, color: Number(resumen.monto_usd) > 0 ? 'var(--red)' : undefined },
              { etiqueta: 'Responsables', valor: String(porResponsable.length), icono: Users },
              { etiqueta: 'Más casos', valor: porResponsable[0]?.usuario?.nombre ?? '—', icono: Crown, nota: porResponsable[0] ? `${porResponsable[0].cantidad} casos` : undefined },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
            <div className="lg:col-span-2 flex min-w-0 flex-col gap-3">
              <ReporteTabla
                titulo={etiquetaTipo(tipo)}
                columnas={columnas}
                filas={data?.results ?? []}
                claveFila={(f) => f.venta_id}
                minW="min-w-[860px]"
                vacio="No hay excepciones de este tipo en el período."
              />
              <ReportePaginacion
                pagina={pagina}
                total={data?.count ?? 0}
                tamano={TAMANO_PAGINA}
                onCambio={setPagina}
                etiqueta="Paginación de excepciones"
              />
            </div>
            <div className="min-w-0">
              <ReporteTabla
                titulo="Resumen por responsable"
                columnas={COLUMNAS_RESPONSABLE}
                filas={porResponsable}
                totales={totalesResponsable}
                claveFila={(f) => f.usuario?.id}
                minW="min-w-[300px]"
                vacio="Sin responsables."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
