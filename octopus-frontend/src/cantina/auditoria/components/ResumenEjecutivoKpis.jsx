import { ReporteResumen } from './ReporteControles';
import {
  KPIS_CARTERA, KPIS_PRINCIPALES, colorVariacion, textoVariacion, valorKpi,
} from './ResumenEjecutivoDatos';
import { usd } from './CierreFormato';

// KPIs del resumen ejecutivo: bloque de operación y bloque de cuentas por cobrar.
// 1 columna en móvil, 2 en tablet, hasta 4 en escritorio (ReporteResumen).

function itemsDe(defs, kpis, variaciones) {
  return defs.map((def) => {
    const variacion = variaciones?.[def.clave];
    const partes = [];
    if (def.notaClave) partes.push(usd(kpis[def.notaClave]));
    if (def.notaCantidad) partes.push(`${kpis[def.notaCantidad]} ${def.unidad}`);
    if (def.nota) partes.push(def.nota);
    const textoComparacion = textoVariacion(variacion);
    if (textoComparacion) partes.push(textoComparacion);
    const sinMargen = def.clave === 'margen_bruto_pct' && kpis[def.clave] == null;
    return {
      etiqueta: def.etiqueta,
      valor: valorKpi(def, kpis),
      icono: def.icono,
      nota: partes.join(' · ') || undefined,
      notaColor: textoComparacion && partes.length === 1 ? colorVariacion(variacion, def.buenoSiSube) : undefined,
      color: sinMargen ? 'var(--amber-ink)' : undefined,
    };
  });
}

export default function ResumenEjecutivoKpis({ kpis, comparacion }) {
  const variaciones = comparacion?.variaciones;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ReporteResumen unaColumnaMovil items={itemsDe(KPIS_PRINCIPALES, kpis, variaciones)} />
      <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Cuentas por cobrar</h3>
      <ReporteResumen unaColumnaMovil items={itemsDe(KPIS_CARTERA, kpis, variaciones)} />
      {Number(kpis.unidades_sin_costo) > 0 && kpis.cobertura_costo_pct != null && (
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          Utilidad y margen se calculan sobre las ventas con costo registrado ({kpis.cobertura_costo_pct} % de los ingresos).
        </p>
      )}
    </div>
  );
}
