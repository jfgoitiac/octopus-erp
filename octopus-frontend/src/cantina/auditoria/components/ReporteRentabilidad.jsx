import { useState } from 'react';
import { AlertTriangle, Coins, Percent, TrendingUp, Wallet } from 'lucide-react';
import { getReporteRentabilidad } from '../api/auditoriaApi';
import { usd } from './CierreFormato';
import { ReporteBarra, ReporteExportar, ReporteResumen, ReporteSelector } from './ReporteControles';
import { paramsDeFiltros, textoFiltros, useExportacion, useReporte } from './ReporteDatos';
import ReporteTabla, { ReporteSkeleton } from './ReporteTabla';

// Pestaña Rentabilidad — GET reportes/rentabilidad/?agrupar= (CONTRATO §4).
// Las líneas sin costo registrado se excluyen del margen; el backend lo avisa
// en `advertencia` y aquí se muestra destacada encima de los números.

const AGRUPACIONES = [
  { valor: 'producto', etiqueta: 'Producto' },
  { valor: 'categoria', etiqueta: 'Categoría' },
];

const tonoMargen = (v) => (Number(v) < 0 ? 'var(--red)' : 'var(--green)');

const SinCosto = ({ n }) => (
  Number(n) > 0
    ? (
      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold font-mono" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
        <AlertTriangle size={12} aria-hidden="true" />
        {Number(n).toLocaleString('en-US')}
      </span>
    )
    : <span style={{ color: 'var(--ash)' }}>0</span>
);

const columnasRentabilidad = (agrupar) => [
  { key: 'etiqueta', label: agrupar === 'categoria' ? 'Categoría' : 'Producto', tipo: 'texto' },
  { key: 'unidades', label: 'Unidades', tipo: 'entero' },
  { key: 'ventas_usd', label: 'Ventas', tipo: 'monto' },
  { key: 'costo_usd', label: 'Costo', tipo: 'monto' },
  {
    key: 'margen_usd', label: 'Margen', tipo: 'monto',
    render: (f) => <span className="font-semibold" style={{ color: tonoMargen(f.margen_usd) }}>{usd(f.margen_usd)}</span>,
  },
  {
    key: 'margen_pct', label: 'Margen %', tipo: 'pct',
    render: (f) => <span className="font-semibold" style={{ color: tonoMargen(f.margen_pct) }}>{Number(f.margen_pct ?? 0).toFixed(2)} %</span>,
  },
  { key: 'unidades_sin_costo', label: 'Sin costo', tipo: 'entero', render: (f) => <SinCosto n={f.unidades_sin_costo} /> },
];

export default function ReporteRentabilidad({ filtros, cajeros }) {
  const [agrupar, setAgrupar] = useState('producto');
  const { data, cargando } = useReporte(getReporteRentabilidad, paramsDeFiltros(filtros, { agrupar }), {
    mensajeError: 'No se pudo cargar el reporte de rentabilidad',
  });
  const { exportando, exportar } = useExportacion();

  const columnas = columnasRentabilidad(agrupar);
  const filas = data?.filas ?? [];
  const totales = data?.totales ?? {};
  // Las unidades de la fila de totales no vienen en el contrato: se suman.
  const totalesTabla = { ...totales, unidades: filas.reduce((s, f) => s + Number(f.unidades ?? 0), 0) };
  const etiqueta = AGRUPACIONES.find((a) => a.valor === agrupar)?.etiqueta;

  const definicion = () => ({
    titulo: 'Reporte de rentabilidad',
    desde: filtros.fecha_inicio,
    hasta: filtros.fecha_fin,
    filtros: textoFiltros(filtros, cajeros, [`Agrupado por: ${etiqueta}`]),
    advertencia: data?.advertencia ?? null,
    secciones: [{ titulo: `Rentabilidad por ${etiqueta.toLowerCase()}`, columnas, filas, totales: totalesTabla }],
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
          {data?.advertencia && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl p-3 sm:p-4"
              style={{ background: 'var(--yellow-light)', border: '1px solid var(--amber-ink)', color: 'var(--amber-ink)' }}
            >
              <AlertTriangle size={20} aria-hidden="true" className="shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Margen parcial: hay unidades sin costo registrado</p>
                <p className="text-sm mt-0.5">{data.advertencia}</p>
              </div>
            </div>
          )}
          <ReporteResumen
            items={[
              { etiqueta: 'Ventas', valor: usd(totales.ventas_usd), icono: Wallet },
              { etiqueta: 'Costo', valor: usd(totales.costo_usd), icono: Coins },
              { etiqueta: 'Margen', valor: usd(totales.margen_usd), icono: TrendingUp, color: tonoMargen(totales.margen_usd) },
              {
                etiqueta: 'Margen %',
                valor: `${Number(totales.margen_pct ?? 0).toFixed(2)} %`,
                icono: Percent,
                color: tonoMargen(totales.margen_pct),
                nota: Number(totales.unidades_sin_costo) > 0 ? `${totales.unidades_sin_costo} u. sin costo` : undefined,
              },
            ]}
          />
          <ReporteTabla
            columnas={columnas}
            filas={filas}
            totales={data ? totalesTabla : null}
            claveFila={(f) => f.clave ?? f.etiqueta}
            minW="min-w-[720px]"
            vacio="No hay ventas con las que calcular rentabilidad en el período."
          />
        </>
      )}
    </div>
  );
}
