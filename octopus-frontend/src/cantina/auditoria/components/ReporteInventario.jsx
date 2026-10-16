import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Trash2 } from 'lucide-react';
import { getReporteInventario } from '../api/auditoriaApi';
import { obtenerTodasLasPaginas } from '../utils/exportarAuditoria';
import { ReporteBarra, ReporteExportar, ReportePaginacion, ReporteResumen, ReporteSelector } from './ReporteControles';
import {
  TAMANO_PAGINA, paramsDeFiltros, textoFiltros, useExportacion, usePaginaReinicia, useReporte, usuariosDe,
} from './ReporteDatos';
import ReporteTabla, { ReporteSkeleton } from './ReporteTabla';

// Pestaña Inventario — GET reportes/inventario/?tipo= (CONTRATO §4, paginado).

const TIPOS_MOV = {
  entrada: { etiqueta: 'Entrada', plural: 'Entradas', icono: ArrowDownToLine, color: 'var(--green)', fondo: 'var(--green-light)' },
  salida: { etiqueta: 'Salida', plural: 'Salidas', icono: ArrowUpFromLine, color: 'var(--pb-mid)', fondo: 'var(--pb-light)' },
  ajuste: { etiqueta: 'Ajuste', plural: 'Ajustes', icono: SlidersHorizontal, color: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
  merma: { etiqueta: 'Merma', plural: 'Mermas', icono: Trash2, color: 'var(--red)', fondo: 'var(--red-light)' },
};

const OPCIONES = [
  { valor: '', etiqueta: 'Todos' },
  ...Object.entries(TIPOS_MOV).map(([valor, m]) => ({ valor, etiqueta: m.plural })),
];

const BadgeTipo = ({ tipo }) => {
  const meta = TIPOS_MOV[tipo];
  return (
    <span
      className="inline-block rounded-lg px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={meta ? { background: meta.fondo, color: meta.color } : { color: 'var(--jet-mid)' }}
    >
      {meta?.etiqueta ?? tipo}
    </span>
  );
};

// Los ajustes pueden ser negativos: se muestran con signo.
const conSigno = (n) => {
  const v = Number(n ?? 0);
  return v > 0 ? `+${v.toLocaleString('en-US')}` : v.toLocaleString('en-US');
};

const COLUMNAS = [
  { key: 'fecha_hora', label: 'Fecha y hora', tipo: 'fechaHora' },
  { key: 'producto', label: 'Producto', tipo: 'texto', valor: (f) => f.producto?.nombre },
  { key: 'tipo', label: 'Tipo', tipo: 'texto', valor: (f) => TIPOS_MOV[f.tipo]?.etiqueta ?? f.tipo, render: (f) => <BadgeTipo tipo={f.tipo} /> },
  { key: 'cantidad', label: 'Cantidad', tipo: 'entero' },
  { key: 'stock_antes', label: 'Stock antes', tipo: 'entero' },
  { key: 'stock_despues', label: 'Stock después', tipo: 'entero' },
  { key: 'motivo', label: 'Motivo', tipo: 'texto' },
  { key: 'usuario', label: 'Usuario', tipo: 'texto', valor: (f) => f.usuario?.nombre },
  { key: 'venta_id', label: 'Venta', tipo: 'texto', valor: (f) => (f.venta_id != null ? `#${f.venta_id}` : '') },
];

const COLUMNAS_RESUMEN = [
  { key: 'tipo', label: 'Tipo', tipo: 'texto' },
  { key: 'unidades', label: 'Unidades', tipo: 'entero' },
];

export default function ReporteInventario({ filtros, cajeros, onUsuarios }) {
  const [tipo, setTipo] = useState('');
  const base = paramsDeFiltros(filtros, { tipo });
  const [pagina, setPagina] = usePaginaReinicia(JSON.stringify(base));
  const { data, cargando } = useReporte(getReporteInventario, { ...base, page: pagina, page_size: TAMANO_PAGINA }, {
    mensajeError: 'No se pudo cargar el reporte de inventario',
    alRecibir: (d) => onUsuarios(usuariosDe((d?.results ?? []).map((r) => r.usuario))),
  });
  const { exportando, exportar } = useExportacion();

  const resumen = data?.resumen ?? {};
  const filasResumen = (r) => Object.entries(TIPOS_MOV).map(([clave, m]) => ({ tipo: m.plural, unidades: r?.[clave] ?? 0 }));

  const definicion = async () => {
    const todo = await obtenerTodasLasPaginas(getReporteInventario, base);
    return {
      titulo: 'Movimientos de inventario',
      desde: filtros.fecha_inicio,
      hasta: filtros.fecha_fin,
      filtros: textoFiltros(filtros, cajeros, [`Tipo: ${tipo ? TIPOS_MOV[tipo].plural : 'Todos'}`]),
      secciones: [
        { titulo: 'Resumen por tipo', columnas: COLUMNAS_RESUMEN, filas: filasResumen(todo.resumen) },
        { titulo: 'Movimientos', columnas: COLUMNAS, filas: todo.results },
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
        <ReporteSelector etiqueta="Tipo" opciones={OPCIONES} valor={tipo} onCambio={setTipo} />
      </ReporteBarra>

      {cargando ? <ReporteSkeleton /> : (
        <>
          <ReporteResumen
            items={Object.entries(TIPOS_MOV).map(([clave, m]) => ({
              etiqueta: m.plural,
              valor: clave === 'ajuste' ? conSigno(resumen[clave]) : Number(resumen[clave] ?? 0).toLocaleString('en-US'),
              icono: m.icono,
              color: m.color,
              nota: 'unidades',
            }))}
          />
          <ReporteTabla
            columnas={COLUMNAS}
            filas={data?.results ?? []}
            claveFila={(f) => f.id}
            minW="min-w-[960px]"
            vacio="No hay movimientos de inventario en el período."
          />
          <ReportePaginacion
            pagina={pagina}
            total={data?.count ?? 0}
            tamano={TAMANO_PAGINA}
            onCambio={setPagina}
            etiqueta="Paginación de movimientos"
          />
        </>
      )}
    </div>
  );
}
