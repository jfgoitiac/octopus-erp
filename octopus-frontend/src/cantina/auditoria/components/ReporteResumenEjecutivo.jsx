import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { getResumenEjecutivo } from '../api/auditoriaApi';
import { useInstitucionPDF } from '../../../hooks/useInstitucionPDF';
import AlertasInformeEjecutivo from './AlertasInformeEjecutivo';
import DistribucionIngresos from './DistribucionIngresos';
import ResumenEjecutivoKpis from './ResumenEjecutivoKpis';
import TendenciaIngresos from './TendenciaIngresos';
import { ReporteBarra, ReporteExportar } from './ReporteControles';
import { paramsDeFiltros, useExportacion, useReporte, usuariosDe } from './ReporteDatos';
import ReporteTabla, { ReporteSkeleton } from './ReporteTabla';
import { ESTILO_TARJETA, usd } from './CierreFormato';
import {
  COL_DIFERENCIAS, COL_RANKING_CATEGORIA, COL_RANKING_PRODUCTO, COL_SIN_COSTO, construirInforme,
} from './ResumenEjecutivoDatos';

// Pestaña Resumen ejecutivo — GET reportes/resumen-ejecutivo/ (un solo endpoint).
// El backend calcula todo; aquí solo se presenta y se exporta.

const MENSAJE_ERROR = 'No se pudo cargar el resumen ejecutivo';

function Dato({ etiqueta, valor, nota }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl p-3" style={{ background: 'var(--porcelain)' }}>
      <span className="text-[11px] uppercase tracking-wider truncate" style={{ color: 'var(--ash)' }}>{etiqueta}</span>
      <span className="text-base font-semibold font-mono tabular-nums truncate" style={{ color: 'var(--jet)' }}>{valor}</span>
      {nota && <span className="text-xs truncate" style={{ color: 'var(--ash)' }}>{nota}</span>}
    </div>
  );
}

function BloqueDatos({ titulo, children }) {
  return (
    <section className="rounded-2xl p-3 sm:p-4 min-w-0" style={ESTILO_TARJETA} aria-label={titulo}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--jet)' }}>{titulo}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export default function ReporteResumenEjecutivo({ filtros, cajeros, onUsuarios }) {
  const [comparar, setComparar] = useState(false);
  const institucion = useInstitucionPDF();
  const params = paramsDeFiltros(filtros, comparar ? { comparar: 'true' } : {});
  const { data, cargando } = useReporte(getResumenEjecutivo, params, {
    mensajeError: MENSAJE_ERROR,
    alRecibir: (d) => onUsuarios?.(usuariosDe(
      [d?.filtros?.cajero], (d?.caja?.detalle ?? []).map((c) => c.cajero),
      (d?.excepciones?.anulaciones_por_cajero ?? []).map((c) => c.usuario),
    )),
  });
  const { exportando, exportar } = useExportacion();

  const informe = () => construirInforme(data, filtros, cajeros, institucion);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ReporteBarra
        exportar={(
          <ReporteExportar
            exportando={exportando}
            deshabilitado={cargando || !data || data.vacio}
            onPdf={() => exportar('pdf', informe)}
            onExcel={() => exportar('excel', informe)}
          />
        )}
      >
        <label
          className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl text-sm cursor-pointer"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
        >
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar con el período anterior equivalente
        </label>
      </ReporteBarra>

      {cargando && <ReporteSkeleton tarjetas={8} filas={5} />}

      {!cargando && !data && (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ ...ESTILO_TARJETA, color: 'var(--jet-mid)' }}>
          No se pudo cargar el resumen. Ajusta los filtros o inténtalo de nuevo.
        </div>
      )}

      {!cargando && data?.vacio && (
        <section className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-10 text-center" style={ESTILO_TARJETA}>
          <Inbox size={26} aria-hidden="true" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>No hay ventas registradas en el período seleccionado.</p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Prueba ampliando el rango de fechas o quitando filtros.</p>
        </section>
      )}

      {!cargando && data && !data.vacio && (
        <>
          <AlertasInformeEjecutivo alertas={data.alertas} />
          <ResumenEjecutivoKpis kpis={data.kpis} comparacion={data.comparacion} />
          <DistribucionIngresos porArea={data.distribucion_area} porMetodo={data.distribucion_metodo_pago} />
          <TendenciaIngresos serie={data.evolucion_diaria} />

          <ReporteTabla
            titulo="Productos con mayores ingresos"
            columnas={COL_RANKING_PRODUCTO}
            filas={data.ranking.productos_ingresos}
            claveFila={(f) => f.clave}
            minW="min-w-[720px]"
          />
          <ReporteTabla
            titulo="Categorías con mayores ingresos"
            columnas={COL_RANKING_CATEGORIA}
            filas={data.ranking.categorias_ingresos}
            claveFila={(f) => f.clave}
            minW="min-w-[720px]"
          />
          <ReporteTabla
            titulo="Productos con mayor utilidad"
            columnas={COL_RANKING_PRODUCTO}
            filas={data.ranking.productos_utilidad}
            claveFila={(f) => f.clave}
            minW="min-w-[720px]"
            vacio="Ningún producto vendido tiene costo registrado."
          />
          <ReporteTabla
            titulo="Categorías con mayor utilidad"
            columnas={COL_RANKING_CATEGORIA}
            filas={data.ranking.categorias_utilidad}
            claveFila={(f) => f.clave}
            minW="min-w-[720px]"
            vacio="Ninguna categoría tiene ventas con costo registrado."
          />
          {data.sin_costo.lineas.length > 0 && (
            <ReporteTabla
              titulo={`Productos vendidos sin costo registrado (${data.sin_costo.productos})`}
              columnas={COL_SIN_COSTO}
              filas={data.sin_costo.lineas}
              claveFila={(f) => f.clave}
              minW="min-w-[420px]"
            />
          )}

          <BloqueDatos titulo="Inventario del período">
            <Dato etiqueta="Entradas" valor={data.inventario.entradas} nota="unidades" />
            <Dato etiqueta="Salidas" valor={data.inventario.salidas} nota="unidades" />
            <Dato etiqueta="Ajustes (neto)" valor={data.inventario.ajustes} nota="unidades" />
            <Dato
              etiqueta="Mermas"
              valor={data.inventario.mermas}
              nota={`${usd(data.inventario.merma_valor_estimado_usd)} estimado`}
            />
          </BloqueDatos>

          <BloqueDatos titulo="Caja y excepciones">
            <Dato etiqueta="Diferencia neta de caja" valor={usd(data.caja.diferencia_neta_usd)} nota={`${data.caja.cierres} cierre(s)`} />
            <Dato
              etiqueta="Cierres con diferencia"
              valor={data.caja.con_diferencia}
              nota={`Tolerancia ${usd(data.caja.tolerancia_usd)}`}
            />
            <Dato etiqueta="Ventas con descuento" valor={data.excepciones.descuentos.cantidad} nota={usd(data.excepciones.descuentos.monto_usd)} />
            <Dato etiqueta="Ventas manuales" valor={data.excepciones.manuales.cantidad} />
          </BloqueDatos>
          {data.caja.detalle.length > 0 && (
            <ReporteTabla
              titulo="Cierres con mayor diferencia"
              columnas={COL_DIFERENCIAS}
              filas={data.caja.detalle}
              claveFila={(f) => f.cierre_id}
              minW="min-w-[480px]"
            />
          )}

          <ul className="text-xs list-disc pl-5 flex flex-col gap-1" style={{ color: 'var(--ash)' }}>
            {data.limitaciones.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
