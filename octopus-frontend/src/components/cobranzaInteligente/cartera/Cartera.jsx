import { useMemo, useState } from 'react';
import { ModuloApagado } from '../shared/ModuloApagado';
import { FiltrosCartera } from './FiltrosCartera';
import { TablaCartera } from './TablaCartera';
import { FichaRepresentante } from './FichaRepresentante';
import { CarteraSkeleton } from './CarteraSkeleton';
import { useCartera } from './useCartera';
import { FILTROS_INICIALES, filtrarCartera } from './carteraUtils';

const TAMANO_PAGINA = 25;

/** Pestaña Cartera: un renglón por representante y ficha 360° (PLAN_COBRANZA_INTELIGENTE_V4 §1.1). */
const Cartera = () => {
    const { filas, pagos, loading, apagada, refrescar } = useCartera();
    const [filtros, setFiltros] = useState(FILTROS_INICIALES);
    const [visibles, setVisibles] = useState(TAMANO_PAGINA);
    const [abierto, setAbierto] = useState(null); // id del representante con la ficha abierta

    const filtradas = useMemo(() => filtrarCartera(filas, filtros), [filas, filtros]);
    // La ficha toma la fila viva (se actualiza con el polling); si ya no está en cartera, se cierra sola.
    const filaAbierta = abierto ? filas.find(f => f.representante.id === abierto) : null;

    const cambiarFiltros = (nuevos) => {
        setFiltros(nuevos);
        setVisibles(TAMANO_PAGINA);
    };

    if (apagada) return <ModuloApagado />;

    return (
        <section aria-label="Cartera" className="space-y-3 sm:space-y-4">
            {loading ? <CarteraSkeleton /> : (
                <>
                    <FiltrosCartera filtros={filtros} onChange={cambiarFiltros} />
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        {filtradas.length} {filtradas.length === 1 ? 'representante' : 'representantes'}
                    </p>
                    <TablaCartera filas={filtradas.slice(0, visibles)} onAbrir={(f) => setAbierto(f.representante.id)} />
                    {filtradas.length > visibles && (
                        <button type="button" className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-medium"
                            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
                            onClick={() => setVisibles(v => v + TAMANO_PAGINA)}>
                            Mostrar más ({filtradas.length - visibles} restantes)
                        </button>
                    )}
                </>
            )}
            {filaAbierta && (
                <FichaRepresentante fila={filaAbierta} pagosRevision={pagos}
                    onClose={() => setAbierto(null)} onCambio={refrescar} />
            )}
        </section>
    );
};

export default Cartera;
