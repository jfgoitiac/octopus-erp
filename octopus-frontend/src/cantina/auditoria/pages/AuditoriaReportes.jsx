import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, ShieldAlert, ShoppingCart, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import ReporteFiltros from '../components/ReporteFiltros';
import { filtrosReporteIniciales } from '../components/ReporteDatos';
import ReporteVentas from '../components/ReporteVentas';
import ReporteExcepciones from '../components/ReporteExcepciones';
import ReporteInventario from '../components/ReporteInventario';
import ReporteRentabilidad from '../components/ReporteRentabilidad';

// Carril Fase 2 · F4 — reportes de auditoría (CONTRATO_AUDITORIA_CANTINA.md §4).
// Cada pestaña carga sus datos al montarse; al cambiar de pestaña la anterior
// se desmonta y aborta su petición en curso.

const PESTANAS = [
  { id: 'ventas', etiqueta: 'Ventas', icono: ShoppingCart, Componente: ReporteVentas },
  { id: 'excepciones', etiqueta: 'Excepciones', icono: ShieldAlert, Componente: ReporteExcepciones },
  { id: 'inventario', etiqueta: 'Inventario', icono: Boxes, Componente: ReporteInventario },
  { id: 'rentabilidad', etiqueta: 'Rentabilidad', icono: TrendingUp, Componente: ReporteRentabilidad },
];

const AuditoriaReportes = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activa = PESTANAS.find((p) => p.id === searchParams.get('tab')) ?? PESTANAS[0];
  const [filtros, setFiltros] = useState(filtrosReporteIniciales);
  // No hay endpoint de cajeros: se acumulan los usuarios que aparecen en los
  // reportes (mismo criterio que AuditoriaCierres).
  const [cajeros, setCajeros] = useState({});

  const registrarUsuarios = useCallback((usuarios) => {
    setCajeros((prev) => {
      const nuevos = usuarios.filter((u) => prev[u.id] !== u.nombre);
      if (nuevos.length === 0) return prev;
      const next = { ...prev };
      nuevos.forEach((u) => { next[u.id] = u.nombre; });
      return next;
    });
  }, []);

  const listaCajeros = Object.entries(cajeros)
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const irA = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', id);
    return next;
  }, { replace: true });

  // Flechas izquierda/derecha entre pestañas (patrón ARIA tabs).
  const alTeclear = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = PESTANAS.findIndex((p) => p.id === activa.id);
    const siguiente = PESTANAS[(i + (e.key === 'ArrowRight' ? 1 : PESTANAS.length - 1)) % PESTANAS.length];
    irA(siguiente.id);
    document.getElementById(`reporte-tab-${siguiente.id}`)?.focus();
  };

  const { Componente } = activa;

  return (
    <div className="w-full max-w-7xl min-w-0 mx-auto flex flex-col gap-3 sm:gap-4">
      <PageHeader
        titulo="Reportes de auditoría"
        descripcion="Ventas, excepciones, inventario y rentabilidad del período, con exportación a PDF y Excel."
      />

      <ReporteFiltros
        filtros={filtros}
        cajeros={listaCajeros}
        onCambio={setFiltros}
        onLimpiar={() => setFiltros(filtrosReporteIniciales())}
      />

      <div
        role="tablist"
        aria-label="Reportes"
        onKeyDown={alTeclear}
        className="flex gap-1 overflow-x-auto rounded-2xl p-1"
        style={{ background: 'var(--jet-light)' }}
      >
        {PESTANAS.map(({ id, etiqueta, icono: Icono }) => {
          const seleccionada = id === activa.id;
          return (
            <button
              key={id}
              id={`reporte-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              aria-controls="reporte-panel"
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => irA(id)}
              className="inline-flex shrink-0 sm:flex-1 items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-medium whitespace-nowrap transition-colors"
              style={seleccionada
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,.12)' }
                : { color: 'var(--jet-mid)' }}
            >
              <Icono size={16} aria-hidden="true" />
              {etiqueta}
            </button>
          );
        })}
      </div>

      <div id="reporte-panel" role="tabpanel" aria-labelledby={`reporte-tab-${activa.id}`} className="min-w-0">
        <Componente key={activa.id} filtros={filtros} cajeros={listaCajeros} onUsuarios={registrarUsuarios} />
      </div>
    </div>
  );
};

export default AuditoriaReportes;
