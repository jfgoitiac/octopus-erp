import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Settings, Info } from 'lucide-react';
import { useSede } from '../../../context/SedeContext';
import { SkeletonLista } from '../shared/SkeletonLista';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { getReglasCobranza, getCobranzaInteligente } from '../../../api/cobranza.service';
import { LineaTiempoReglas } from './LineaTiempoReglas';
import { EditorRegla } from './EditorRegla';
import { SimuladorEnvios } from './SimuladorEnvios';
import { RespuestasRapidas } from './RespuestasRapidas';
import { REGLAS_DEFECTO, normalizarReglas } from './automatizacionesUtils';

const Seccion = ({ titulo, children }) => (
    <section className="rounded-xl p-3 sm:p-5 space-y-3" style={{ background: '#fff', border: '1px solid var(--border)' }}>
        <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</h2>
        {children}
    </section>
);

/** Pestaña Automatizaciones: reglas, vista previa, simulador, respuestas rápidas y enlace al toggle. */
const Automatizaciones = () => {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [reglas, setReglas] = useState({ cargando: true, items: [], soloLectura: false });
    const [editando, setEditando] = useState(null);
    const [config, setConfig] = useState(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const c = new AbortController();
        getReglasCobranza(sedeId, c.signal)
            .then(r => setReglas({ cargando: false, items: normalizarReglas(r.data), soloLectura: false }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                // El backend aún no expone las reglas: se muestran las de por defecto, solo lectura.
                if ([404, 405].includes(err?.response?.status)) {
                    setReglas({ cargando: false, items: REGLAS_DEFECTO, soloLectura: true });
                } else {
                    setReglas({ cargando: false, items: [], soloLectura: true });
                    toast.error(mensajeErrorInteligente(err));
                }
            });
        return () => c.abort();
    }, [sedeId, version]);

    useEffect(() => {
        const c = new AbortController();
        getCobranzaInteligente(sedeId, c.signal)
            .then(r => setConfig(r.data))
            .catch(() => { /* el enlace funciona igual sin el estado */ });
        return () => c.abort();
    }, [sedeId]);

    const alGuardar = useCallback(() => {
        setEditando(null);
        setReglas(r => ({ ...r, cargando: true }));
        setVersion(v => v + 1);
    }, []);

    return (
        <div aria-label="Automatizaciones" className="w-full space-y-4 sm:space-y-6">
            <Seccion titulo="Encendido y modo sombra">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        {config ? `Cobranza Inteligente está ${config.activo ? 'encendida' : 'apagada'}${config.modo_sombra ? ' (modo sombra)' : ''}. ` : ''}
                        Encender o apagar el módulo, el modo sombra y las etapas se gestionan en Configuración.
                    </p>
                    <Link to="/configuracion/cobranza-inteligente"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                        <Settings size={16} />Ir a la configuración
                    </Link>
                </div>
            </Seccion>

            <Seccion titulo="Línea de tiempo de reglas">
                {reglas.soloLectura && !reglas.cargando && (
                    <div className="flex items-start gap-2 rounded-xl p-3 text-sm" role="note"
                        style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                        <Info size={16} className="shrink-0 mt-0.5" />
                        <span>La edición de reglas aún no está disponible en el servidor. Se muestran las reglas por defecto del motor, solo lectura.</span>
                    </div>
                )}
                {reglas.cargando ? <SkeletonLista filas={4} alto="h-16" /> : (
                    <LineaTiempoReglas reglas={reglas.items} soloLectura={reglas.soloLectura}
                        onEditar={setEditando} onNueva={() => setEditando({})} />
                )}
            </Seccion>

            <Seccion titulo="Simulador: qué saldría un día"><SimuladorEnvios sedeId={sedeId} /></Seccion>
            <Seccion titulo="Respuestas rápidas"><RespuestasRapidas /></Seccion>

            {editando && <EditorRegla regla={editando} sedeId={sedeId} onClose={() => setEditando(null)} onGuardada={alGuardar} />}
        </div>
    );
};

export default Automatizaciones;
