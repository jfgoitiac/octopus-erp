import { useState } from 'react';
import { BadgePercent, Package, Receipt, Wallet } from 'lucide-react';
import { getReporteVentas } from '../api/auditoriaApi';
import { usd } from './CierreFormato';
import { ReporteBarra, ReporteExportar, ReporteResumen, ReporteSelector } from './ReporteControles';
import { paramsDeFiltros, textoFiltros, useExportacion, useReporte } from './ReporteDatos';
import ReporteTabla, { ReporteSkeleton } from './ReporteTabla';

// Pestaña Ventas — GET reportes/ventas/?agrupar= (CONTRATO §4).

const AGRUPACIONES = [
  { valor: 'producto', etiqueta: 'Producto' },
  { valor: 'categoria', etiqueta: 'Categoría' },
  { valor: 'turno', etiqueta: 'Turno' },
  { valor: 'responsable', etiqueta: 'Responsable' },
  { valor: 'dia', etiqueta: 'Día' },
];

const etiquetaAgrupar = (agrupar) => AGRUPACIONES.find((a) => a.valor === agrupar)?.etiqueta ?? agrupar;

// `cantidad` (unidades) solo tiene sentido al agrupar por producto o categoría.
const columnasVentas = (agrupar) => [
  agrupar === 'dia'
    ? { key: 'etiqueta', label: 'Día', tipo: 'fecha', valor: (f) => f.clave || f.etiqueta }
    : { key: 'etiqueta', label: etiquetaAgrupar(agrupar), tipo: 'texto' },
  ...(agrupar === 'producto' || agrupar === 'categoria' ? [{ key: 'cantidad', label: 'Unidades', tipo: 'entero' }] : []),
  { key: 'ventas', label: 'N.º ventas', tipo: 'entero' },
  { key: 'descuento_usd', label: 'Descuentos', tipo: 'monto' },
  { key: 'total_usd', label: 'Total neto', tipo: 'monto' },
];

export default function ReporteVentas({ filtros, cajeros, onUsuarios }) {
  const [agrupar, setAgrupar] = useState('producto');
  const params = paramsDeFiltros(filtros, { agrupar });
  const { data, cargando } = useReporte(getReporteVentas, params, {
    mensajeError: 'No se pudo cargar el reporte de ventas',
    // Agrupado por responsable, cada fila es un usuario: alimenta el filtro de cajero.
    alRecibir: (d) => {
      if (d?.agrupar === 'responsable') onUsuarios((d.filas ?? []).map((f) => ({ id: f.clave, nombre: f.etiqueta })));
    },
  });
  const { exportando, exportar } = useExportacion();

  const columnas = columnasVentas(agrupar);
  const filas = data?.filas ?? [];
  const totales = data?.totales ?? {};
  const nVentas = Number(totales.ventas ?? 0);
  const ticket = nVentas > 0 ? Number(totales.total_usd ?? 0) / nVentas : 0;

  const definicion = () => ({
    titulo: 'Reporte de ventas',
    desde: filtros.fecha_inicio,
    hasta: filtros.fecha_fin,
    filtros: textoFiltros(filtros, cajeros, [`Agrupado por: ${etiquetaAgrupar(agrupar)}`]),
    secciones: [{ titulo: `Ventas por ${etiquetaAgrupar(agrupar).toLowerCase()}`, columnas, filas, totales }],
  });

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
        <ReporteSelector etiqueta="Agrupar por" opciones={AGRUPACIONES} valor={agrupar} onCambio={setAgrupar} />
      </ReporteBarra>

      {cargando ? <ReporteSkeleton /> : (
        <>
          <ReporteResumen
            items={[
              { etiqueta: 'Total neto', valor: usd(totales.total_usd), icono: Wallet, color: 'var(--pb-mid)' },
              { etiqueta: 'Ventas', valor: nVentas.toLocaleString('en-US'), icono: Receipt },
              { etiqueta: 'Unidades', valor: Number(totales.cantidad ?? 0).toLocaleString('en-US'), icono: Package, nota: `Ticket prom. ${usd(ticket)}` },
              { etiqueta: 'Descuentos', valor: usd(totales.descuento_usd), icono: BadgePercent, color: Number(totales.descuento_usd) > 0 ? 'var(--amber-ink)' : undefined },
            ]}
          />
          <ReporteTabla
            columnas={columnas}
            filas={filas}
            totales={data ? totales : null}
            claveFila={(f) => f.clave ?? f.etiqueta}
            minW="min-w-[560px]"
            vacio="No hay ventas en el período."
          />
        </>
      )}
    </div>
  );
}
