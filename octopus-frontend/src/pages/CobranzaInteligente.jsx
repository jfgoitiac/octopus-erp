import { useContext } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { AuthContext } from '../context/AuthContext';
import { useCobranzaInteligente } from '../hooks/useCobranzaInteligente';
import { CobranzaInteligenteTabs } from '../components/cobranzaInteligente/CobranzaInteligenteTabs';
import { ModuloApagado } from '../components/cobranzaInteligente/shared/ModuloApagado';
import { SkeletonLista } from '../components/cobranzaInteligente/shared/SkeletonLista';
import { ROLES } from '../constants/roles';

const PUEDEN_CONFIGURAR = [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SISTEMAS];

/**
 * Layout del módulo unificado Cobranza Inteligente: encabezado, pestañas filtradas
 * por rol y <Outlet/> con la pestaña activa. Con el toggle de la sede apagado,
 * toda la ruta muestra la pantalla "módulo apagado".
 */
const CobranzaInteligente = () => {
    const { user } = useContext(AuthContext);
    const { estado, loading, requiereSede } = useCobranzaInteligente();
    const rol = (user?.rol || '').toLowerCase().trim();

    let contenido;
    if (requiereSede) {
        contenido = <ModuloApagado>Selecciona una sede para ver Cobranza Inteligente.</ModuloApagado>;
    } else if (loading) {
        contenido = <SkeletonLista />;
    } else if (!estado?.activo) {
        contenido = (
            <div className="text-center">
                <ModuloApagado />
                {PUEDEN_CONFIGURAR.includes(rol) && (
                    <Link to="/configuracion/cobranza-inteligente" className="text-sm font-medium underline" style={{ color: 'var(--pb)' }}>
                        Ir a la configuración
                    </Link>
                )}
            </div>
        );
    } else {
        contenido = <Outlet />;
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-20">
            <PageHeader titulo="Cobranza Inteligente" descripcion="Qué hacer hoy, tu cartera y las conversaciones con las familias." />
            <CobranzaInteligenteTabs rol={rol} />
            {contenido}
        </div>
    );
};

export default CobranzaInteligente;
