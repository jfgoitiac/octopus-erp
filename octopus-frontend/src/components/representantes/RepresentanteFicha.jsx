import { useState } from 'react';
import { X, Phone, Mail, MapPin, GraduationCap, Pencil, Trash2, Loader2, Monitor, ShieldOff, KeyRound, DollarSign, Wallet } from 'lucide-react';
import { mostrarCedula } from '../../utils/cedulaEscolar';
import { fmt } from '../../utils/format';
import { useEstadoCuentaRepresentante } from '../../hooks/useEstadoCuentaRepresentante';
import EstadoCuentaModal from './EstadoCuentaModal';

const CONTACTO_FIELDS = [
    { icon: Phone,  field: 'telefono' },
    { icon: Mail,   field: 'correo'   },
    { icon: MapPin, field: 'direccion' },
];

const FichaAlumnosSkeleton = () => (
    <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--ash-light)' }} />
        ))}
    </div>
);

const EstadoCuentaSkeleton = () => (
    <div className="flex flex-col gap-2">
        <div className="h-6 w-24 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
        <div className="h-3 w-full rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
        <div className="h-3 w-4/5 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
    </div>
);

const RepresentanteFicha = ({
    rep, alumnos, fichaLoading, canEditar, canEliminar, onClose, onEditar, onConfirmDelete, onConfirmDeleteDefinitivo,
    portalLoading, onActivarPortal, onDesactivarPortal, onRestablecerContrasena,
    cargandoProyectoId, onCargarProyectoInversion,
}) => {
    const sinAlumnos = (rep.cantidad_alumnos ?? 0) === 0 && (rep.cantidad_alumnos_retirados ?? 0) === 0;

    const [modalEstadoCuentaAbierto, setModalEstadoCuentaAbierto] = useState(false);
    const { totales, cargos, loading: estadoCuentaLoading, error: estadoCuentaError } = useEstadoCuentaRepresentante(rep.id);
    const deudaTotal = Number(totales?.deuda_total_usd ?? 0);
    const conceptosPendientes = cargos.filter(c => (c.pendientes ?? 0) > 0);

    return (
    <>
    <div
        className="w-full lg:w-72 flex-shrink-0 rounded-xl flex flex-col"
        style={{
            background: 'var(--porcelain)',
            border: '0.5px solid var(--border-md)',
            maxHeight: 'calc(100dvh - 66px)',
            overflowY: 'auto',
            position: 'sticky',
            top: '50px',
            alignSelf: 'flex-start',
        }}
    >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
            <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ background: 'var(--pb)' }}>
                    {(rep.nombre?.[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--jet)' }}>
                        {rep.nombre} {rep.apellido}
                    </p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--ash)' }}>{rep.cedula}</p>
                </div>
            </div>
            <button
                onClick={onClose}
                aria-label="Cerrar ficha"
                className="p-1 rounded-lg flex-shrink-0"
                style={{ color: 'var(--ash)' }}
            >
                <X size={14} />
            </button>
        </div>

        {/* Contacto */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '0.5px solid var(--border)' }}>
            {CONTACTO_FIELDS.map(({ icon: Icon, field }) => (
                <div key={field} className="flex items-start gap-2">
                    <Icon size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                    <span className="text-xs break-words" style={{ color: 'var(--ash)' }}>
                        {rep[field] || '—'}
                    </span>
                </div>
            ))}
        </div>

        {/* Alumnos vinculados */}
        <div className="px-4 py-3 flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-widest font-medium flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                <GraduationCap size={12} />
                Alumnos vinculados
            </p>
            {fichaLoading ? (
                <FichaAlumnosSkeleton />
            ) : alumnos.length === 0 ? (
                <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>Sin alumnos registrados.</p>
            ) : alumnos.map(alu => (
                <div key={alu.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2"
                    style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                    <div className="min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
                            {alu.nombre} {alu.apellido}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                            {alu.grado_seccion || 'Sin grado'} · {mostrarCedula(alu.cedula_escolar, 'Sin cédula')}
                        </p>
                    </div>
                    <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${alu.activo ? '' : 'opacity-50'}`}
                        style={{
                            background: alu.activo ? 'var(--pb-light)' : 'var(--ash-light)',
                            color: alu.activo ? 'var(--pb-mid)' : 'var(--ash)',
                        }}
                    >
                        {alu.activo ? 'Activo' : 'Retirado'}
                    </span>
                </div>
            ))}
        </div>

        {/* Proyecto de Inversión: carga manual puntual, solo mientras el
            representante siga debiendo inscripción (ver secretaria/views.py::
            RepresentanteViewSet.cargar_proyecto_inversion) */}
        {canEditar && rep.tiene_inscripcion_impaga && (
            <div className="px-4 py-3" style={{ borderTop: '0.5px solid var(--border)' }}>
                <button
                    onClick={() => onCargarProyectoInversion(rep)}
                    disabled={cargandoProyectoId === rep.id}
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                >
                    {cargandoProyectoId === rep.id ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
                    Cargar Proyecto de Inversión
                </button>
            </div>
        )}

        {/* Acceso al Portal */}
        {canEditar && (
            <div className="px-4 py-3 flex flex-col gap-2" style={{ borderTop: '0.5px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-widest font-medium flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                        <Monitor size={12} />
                        Acceso al Portal
                    </p>
                    {rep.portal_creado ? (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={rep.portal_activo
                                ? { background: 'var(--pb-light)', color: 'var(--pb-mid)' }
                                : { background: 'var(--ash-light)', color: 'var(--ash)' }}
                        >
                            {rep.portal_activo ? 'Activo' : 'Desactivado'}
                        </span>
                    ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                            Sin acceso
                        </span>
                    )}
                </div>

                {!rep.portal_creado ? (
                    <button
                        onClick={() => onActivarPortal(rep)}
                        disabled={portalLoading}
                        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                        style={{ background: 'var(--pb)' }}
                    >
                        {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <Monitor size={12} />}
                        Activar acceso al portal
                    </button>
                ) : rep.portal_activo ? (
                    <div className="flex gap-2">
                        <button
                            onClick={() => onRestablecerContrasena(rep)}
                            disabled={portalLoading}
                            title="Restablecer contraseña a la cédula"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        >
                            {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                            Restablecer clave
                        </button>
                        <button
                            onClick={() => onDesactivarPortal(rep)}
                            disabled={portalLoading}
                            title="Desactivar acceso al portal"
                            className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs transition-colors disabled:opacity-60"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                        >
                            <ShieldOff size={12} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => onActivarPortal(rep)}
                        disabled={portalLoading}
                        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                        style={{ background: 'var(--pb)' }}
                    >
                        {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <Monitor size={12} />}
                        Reactivar acceso
                    </button>
                )}

                {rep.portal_creado && (
                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>
                        Usuario: <span className="font-mono">{rep.cedula}</span>
                        {rep.portal_activo && ' · clave = cédula si nunca la cambió'}
                    </p>
                )}
            </div>
        )}

        {/* Acciones rápidas */}
        {(canEditar || canEliminar) && (
            <div className="px-4 pb-4 flex gap-2 mt-auto pt-3" style={{ borderTop: '0.5px solid var(--border)' }}>
                {canEditar && (
                    <button
                        onClick={() => onEditar(rep)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--pb)', color: '#fff' }}
                    >
                        <Pencil size={12} />
                        Editar
                    </button>
                )}
                {canEliminar && (
                    <button
                        onClick={() => onConfirmDelete(rep)}
                        aria-label={`Eliminar a ${rep.nombre} ${rep.apellido}`}
                        className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs transition-colors"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        )}

        {/* Eliminación definitiva manual: solo si no tiene NINGÚN alumno
            (ni activo ni retirado) — ver secretaria/views.py::
            RepresentanteViewSet.eliminar_definitivo_manual. Separada de
            "Eliminar" (soft-delete) porque es irreversible y libera la
            cédula, exige confirmación reforzada. */}
        {canEliminar && sinAlumnos && (
            <div className="px-4 pb-4" style={{ borderTop: '0.5px solid var(--border)', paddingTop: '12px' }}>
                <button
                    onClick={() => onConfirmDeleteDefinitivo(rep)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{ border: '0.5px solid var(--red)', color: 'var(--red)', background: 'var(--red-light)' }}
                >
                    <Trash2 size={12} />
                    Eliminar definitivamente
                </button>
            </div>
        )}

        {/* Estado de cuenta: falla aislada — un error acá (ya notificado por
            react-toastify dentro del hook) no debe impedir que el resto de
            la ficha siga funcionando. */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderTop: '0.5px solid var(--border)' }}>
            <p className="text-[11px] uppercase tracking-widest font-medium flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                <Wallet size={12} />
                Estado de cuenta
            </p>
            {estadoCuentaLoading ? (
                <EstadoCuentaSkeleton />
            ) : estadoCuentaError ? (
                <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>No se pudo cargar el estado de cuenta.</p>
            ) : (
                <>
                    <p className="text-lg font-bold" style={{ color: deudaTotal > 0 ? 'var(--red)' : 'var(--jet)' }}>
                        ${fmt(deudaTotal, 2)}
                    </p>
                    {conceptosPendientes.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Sin pendientes.</p>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {conceptosPendientes.map(c => (
                                <li key={c.concepto} className="text-xs" style={{ color: 'var(--ash)' }}>
                                    {c.concepto_nombre} · {c.pendientes} pendiente{c.pendientes === 1 ? '' : 's'} · ${fmt(c.saldo_usd, 2)}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
            <button
                onClick={() => setModalEstadoCuentaAbierto(true)}
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium mt-1"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            >
                Ver estado de cuenta completo
            </button>
        </div>
    </div>

    <EstadoCuentaModal
        open={modalEstadoCuentaAbierto}
        onClose={() => setModalEstadoCuentaAbierto(false)}
        representanteId={rep.id}
    />
    </>
    );
};

export default RepresentanteFicha;
