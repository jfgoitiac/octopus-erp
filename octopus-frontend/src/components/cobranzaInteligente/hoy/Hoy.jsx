import { useCobranzaHoy } from '../../../hooks/useCobranzaHoy';
import { ModuloApagado } from '../shared/ModuloApagado';
import { HoyResumen } from './HoyResumen';
import { ListaTarjetas } from './ListaTarjetas';
import { ProyeccionCajaResumen } from './ProyeccionCajaResumen';
import { KpisCobranza } from './KpisCobranza';
import { GraficoEstadoPagos } from './GraficoEstadoPagos';
import { GraficoMoraAntiguedad } from './GraficoMoraAntiguedad';
import { ActividadAutomatica } from './ActividadAutomatica';
import { HoySkeleton } from './HoySkeleton';

/** Pestaña "Hoy": resumen, tarjetas de acción, KPIs, gráficos y actividad automática. */
const Hoy = () => {
    const { data, loading, apagada, refrescar } = useCobranzaHoy();

    if (loading) return <HoySkeleton />;
    if (apagada) return <ModuloApagado />;
    if (!data) return <ModuloApagado>No se pudo cargar la información de hoy.</ModuloApagado>;

    return (
        <section aria-label="Hoy" className="w-full space-y-4 sm:space-y-6">
            <HoyResumen resumen={data.resumen} />
            <ProyeccionCajaResumen proyeccion={data.proyeccion_caja} />
            <ListaTarjetas tarjetas={data.tarjetas} onCambio={refrescar} />
            <KpisCobranza kpis={data.kpis} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <GraficoEstadoPagos cartera={data.kpis?.cartera_mes} />
                <GraficoMoraAntiguedad mora={data.kpis?.mora_por_antiguedad} />
            </div>
            <ActividadAutomatica actividad={data.actividad} />
        </section>
    );
};

export default Hoy;
