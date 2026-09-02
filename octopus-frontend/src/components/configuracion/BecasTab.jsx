import { GraduationCap, Loader2, Pencil, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TablaScroll } from '../ui/TablaScroll';
import { Modal } from '../ui/Modal';
import { useBecas } from '../../hooks/useBecas';
import ModalBeca from './ModalBeca';

const TIPO_LABELS = {
    academica: 'Académica', deportiva: 'Deportiva', socioeconomica: 'Socioeconómica',
    hermanos: 'Hermanos', empleado: 'Hijo de Empleado', otra: 'Otra',
};

const fechaCorta = (iso) => {
    if (!iso) return '—';
    try { return format(new Date(`${iso}T00:00:00`), 'dd/MM/yyyy', { locale: es }); }
    catch { return iso; }
};

/**
 * Sección "Becas" de Configuración: CRUD de Beca (ver secretaria/models.py::
 * Beca) — solo director/administrador/sistemas pueden otorgar/editar/revocar
 * (permiso reforzado en el backend, ver secretaria/views.py::BecaViewSet).
 * Mobile-first: la tabla scrollea dentro de TablaScroll, nunca el <body>.
 */
export default function BecasTab() {
    const {
        becas, becasLoading, filtroEstado, setFiltroEstado, filtroBuscar, setFiltroBuscar,
        showBecaModal, setShowBecaModal, becaEditando, becaForm, setBecaForm, becaSaving,
        busquedaAlumno, setBusquedaAlumno, resultadosAlumnos, buscandoAlumnos,
        showRevocarModal, setShowRevocarModal, becaARevocar, motivoRevocacion, setMotivoRevocacion, revocando,
        openCreateBeca, openEditBeca, handleSaveBeca,
        confirmarRevocarBeca, handleRevocarBeca,
    } = useBecas();

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="px-5 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                        <GraduationCap size={15} style={{ color: 'var(--pb)' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Becas</h3>
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Solo afectan mensualidades — inscripción y cargos especiales se cobran normalmente</p>
                    </div>
                </div>
                <button type="button" onClick={openCreateBeca}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--pb)' }}>
                    <GraduationCap size={13} /> Otorgar Beca
                </button>
            </div>

            <div className="px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={13} style={{ color: 'var(--ash)' }} />
                    <input type="text" value={filtroBuscar} onChange={e => setFiltroBuscar(e.target.value)}
                        placeholder="Buscar por alumno o cédula escolar"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                </div>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                    className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs outline-none"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                    <option value="activa">Activas</option>
                    <option value="revocada">Revocadas</option>
                    <option value="">Todas</option>
                </select>
            </div>

            {becasLoading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                </div>
            ) : becas.length === 0 ? (
                <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                    <GraduationCap size={30} className="mb-2 opacity-20" />
                    <p className="text-sm">No hay becas registradas con este filtro.</p>
                </div>
            ) : (
                <TablaScroll>
                    <table className="w-full text-left min-w-[820px]">
                        <thead>
                            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                {['Alumno', 'Período', 'Tipo', '%', 'Vigencia', 'Estado', ''].map(h => (
                                    <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {becas.map(beca => (
                                <tr key={beca.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--jet)' }}>{beca.alumno_nombre}</td>
                                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--jet)' }}>{beca.periodo_escolar}</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>{TIPO_LABELS[beca.tipo] || beca.tipo}</td>
                                    <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: 'var(--pb)' }}>{beca.porcentaje}%</td>
                                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--ash)' }}>
                                        {fechaCorta(beca.fecha_desde)} — {fechaCorta(beca.fecha_hasta)}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                            style={beca.estado === 'activa'
                                                ? { background: '#dcfce7', color: '#16a34a' }
                                                : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                            {beca.estado === 'activa' ? (beca.vigente_hoy ? 'Activa' : 'Activa (fuera de vigencia)') : 'Revocada'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {beca.estado === 'activa' && (
                                            <div className="flex items-center gap-1.5 justify-end">
                                                <button type="button" onClick={() => openEditBeca(beca)}
                                                    className="p-1.5 rounded-lg"
                                                    style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                    title="Editar">
                                                    <Pencil size={13} />
                                                </button>
                                                <button type="button" onClick={() => confirmarRevocarBeca(beca)}
                                                    className="p-1.5 rounded-lg"
                                                    style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                    title="Revocar">
                                                    <XCircle size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TablaScroll>
            )}

            {showBecaModal && (
                <ModalBeca
                    open
                    onClose={() => setShowBecaModal(false)}
                    editando={becaEditando}
                    form={becaForm}
                    setForm={setBecaForm}
                    saving={becaSaving}
                    onSave={handleSaveBeca}
                    busquedaAlumno={busquedaAlumno}
                    setBusquedaAlumno={setBusquedaAlumno}
                    resultadosAlumnos={resultadosAlumnos}
                    buscandoAlumnos={buscandoAlumnos}
                />
            )}

            {showRevocarModal && (
                <Modal
                    open
                    onClose={() => setShowRevocarModal(false)}
                    titulo="Revocar Beca"
                    size="sm"
                    footer={(
                        <>
                            <button type="button" onClick={() => setShowRevocarModal(false)}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleRevocarBeca} disabled={revocando}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                                style={{ background: 'var(--red)' }}>
                                {revocando ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                Revocar
                            </button>
                        </>
                    )}
                >
                    <p className="text-sm mb-3" style={{ color: 'var(--jet)' }}>
                        ¿Revocar la beca de <b>{becaARevocar?.alumno_nombre}</b> ({becaARevocar?.porcentaje}%)?
                        Sus mensualidades impagas se recalcularán al monto completo.
                    </p>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Motivo (opcional)</label>
                    <textarea value={motivoRevocacion} rows={2}
                        onChange={e => setMotivoRevocacion(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                </Modal>
            )}
        </div>
    );
}
