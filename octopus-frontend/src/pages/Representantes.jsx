import { useEffect, useState, useCallback, useContext } from 'react';
import { Search, Users, UserPlus, Pencil, Trash2, X, Save, Loader2, ChevronRight, GraduationCap, Phone, Mail, MapPin, Download } from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';

const FORM_EMPTY = { nombre: '', apellido: '', cedula: '', telefono: '', correo: '', direccion: '' };

const Representantes = () => {
    const { user } = useContext(AuthContext);
    const userRole = (user?.rol || '').toLowerCase().trim();
    const canWrite = ['director', 'administrador', 'secretaria'].includes(userRole);

    const [representantes, setRepresentantes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [minHijos, setMinHijos] = useState('');

    // Ficha lateral
    const [selectedRep, setSelectedRep] = useState(null);
    const [fichaAlumnos, setFichaAlumnos] = useState([]);
    const [fichaLoading, setFichaLoading] = useState(false);

    // Modal crear/editar
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState(null); // null = crear, obj = editar
    const [form, setForm] = useState(FORM_EMPTY);
    const [formErrors, setFormErrors] = useState({});

    // Modal confirmar eliminar
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            if (minHijos) params.append('min_hijos', minHijos);
            const res = await axiosInstance.get(
                `secretaria/exportar-representantes-excel/?${params}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `representantes_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo generar el Excel.';
            toast.error(msg);
        } finally {
            setExportingExcel(false);
        }
    };

    const fetchRepresentantes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            if (minHijos) params.append('min_hijos', minHijos);
            const res = await axiosInstance.get(`secretaria/representantes/?${params}`);
            setRepresentantes(res.data?.results ?? res.data ?? []);
        } catch {
            toast.error('Error al cargar la lista de representantes.');
        } finally {
            setLoading(false);
        }
    }, [busqueda, minHijos]);

    useEffect(() => {
        const t = setTimeout(fetchRepresentantes, 300);
        return () => clearTimeout(t);
    }, [fetchRepresentantes]);

    const openFicha = async (rep) => {
        setSelectedRep(rep);
        setFichaAlumnos([]);
        setFichaLoading(true);
        try {
            const res = await axiosInstance.get(`secretaria/representante/${rep.cedula}/alumnos/`);
            setFichaAlumnos(res.data?.alumnos ?? []);
        } catch {
            setFichaAlumnos([]);
        } finally {
            setFichaLoading(false);
        }
    };

    const closeFicha = () => { setSelectedRep(null); setFichaAlumnos([]); };

    const openCrear = () => {
        setEditando(null);
        setForm(FORM_EMPTY);
        setFormErrors({});
        setShowModal(true);
    };

    const openEditar = (rep) => {
        setEditando(rep);
        setForm({
            nombre:    rep.nombre    || '',
            apellido:  rep.apellido  || '',
            cedula:    rep.cedula    || '',
            telefono:  rep.telefono  || '',
            correo:    rep.correo    || '',
            direccion: rep.direccion || '',
        });
        setFormErrors({});
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setEditando(null); setForm(FORM_EMPTY); setFormErrors({}); };

    const validateForm = () => {
        const errs = {};
        if (!form.nombre.trim())   errs.nombre   = 'Requerido.';
        if (!form.apellido.trim()) errs.apellido  = 'Requerido.';
        if (!form.cedula.trim())   errs.cedula    = 'Requerido.';
        if (form.correo && !form.correo.includes('@')) errs.correo = 'Correo inválido.';
        return errs;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const errs = validateForm();
        if (Object.keys(errs).length) { setFormErrors(errs); return; }
        setSaving(true);
        try {
            if (editando) {
                const payload = { nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim(), correo: form.correo.trim(), direccion: form.direccion.trim() };
                await axiosInstance.patch(`secretaria/representantes/${editando.id}/`, payload);
                toast.success('Representante actualizado.');
            } else {
                await axiosInstance.post('secretaria/representantes/', {
                    nombre:    form.nombre.trim(),
                    apellido:  form.apellido.trim(),
                    cedula:    form.cedula.trim(),
                    telefono:  form.telefono.trim(),
                    correo:    form.correo.trim(),
                    direccion: form.direccion.trim(),
                });
                toast.success('Representante registrado.');
            }
            closeModal();
            fetchRepresentantes();
        } catch (err) {
            const data = err.response?.data;
            if (data && typeof data === 'object' && !data.detail && !data.error) {
                setFormErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : v])));
            } else {
                toast.error(data?.error || data?.detail || 'Error al guardar.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            await axiosInstance.delete(`secretaria/representantes/${confirmDelete.id}/`);
            toast.success('Representante eliminado.');
            setConfirmDelete(null);
            if (selectedRep?.id === confirmDelete.id) closeFicha();
            fetchRepresentantes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo eliminar. Puede tener alumnos activos.');
        } finally {
            setDeleting(false);
        }
    };

    const inputStyle = {
        background: 'var(--bg)', border: '0.5px solid var(--border-md)',
        borderRadius: '8px', color: 'var(--jet)', fontSize: '13px', padding: '7px 10px', width: '100%', outline: 'none',
    };
    const labelStyle = { fontSize: '11px', color: 'var(--ash)', marginBottom: '3px', display: 'block' };
    const errStyle   = { fontSize: '11px', color: 'var(--red)', marginTop: '2px' };

    return (
        <div className="flex gap-4 h-full">
            {/* Panel principal */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">

                {/* Barra de búsqueda + acciones */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, cédula o correo…"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: '30px' }}
                        />
                    </div>
                    <input
                        type="number"
                        placeholder="Mín. alumnos"
                        value={minHijos}
                        min="0"
                        onChange={e => setMinHijos(e.target.value)}
                        style={{ ...inputStyle, width: '120px' }}
                    />
                    {canWrite && (
                        <button
                            onClick={openCrear}
                            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white"
                            style={{ background: 'var(--pb)', whiteSpace: 'nowrap' }}
                        >
                            <UserPlus size={14} />
                            Agregar
                        </button>
                    )}
                    <button
                        onClick={handleExportExcel}
                        disabled={exportingExcel || loading}
                        className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--jet)', whiteSpace: 'nowrap' }}
                        title="Exportar a Excel"
                    >
                        {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Excel
                    </button>
                </div>

                {/* Tabla */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                    {['Cédula', 'Nombre', 'Teléfono', 'Correo', 'Alumnos activos', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--ash)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center">
                                            <Loader2 className="animate-spin mx-auto" size={22} style={{ color: 'var(--pb)' }} />
                                        </td>
                                    </tr>
                                ) : representantes.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--ash)' }}>
                                            No se encontraron representantes.
                                        </td>
                                    </tr>
                                ) : representantes.map(rep => (
                                    <tr
                                        key={rep.id}
                                        className="cursor-pointer transition-all"
                                        style={{
                                            borderBottom: '0.5px solid var(--border)',
                                            background: selectedRep?.id === rep.id ? 'var(--pb-light)' : 'var(--porcelain)',
                                        }}
                                        onMouseEnter={e => { if (selectedRep?.id !== rep.id) e.currentTarget.style.background = 'var(--ash-light)'; }}
                                        onMouseLeave={e => { if (selectedRep?.id !== rep.id) e.currentTarget.style.background = 'var(--porcelain)'; }}
                                        onClick={() => openFicha(rep)}
                                    >
                                        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>{rep.cedula}</td>
                                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)', fontSize: '13px' }}>
                                            {rep.nombre} {rep.apellido}
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{rep.telefono || '—'}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{rep.correo || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                                                style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                                <Users size={11} />
                                                {rep.cantidad_alumnos ?? 0}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {canWrite && (
                                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => openEditar(rep)}
                                                        className="p-1.5 rounded-lg transition-all"
                                                        style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
                                                        title="Editar"
                                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--pb)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; }}
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(rep)}
                                                        className="p-1.5 rounded-lg transition-all"
                                                        style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
                                                        title="Eliminar"
                                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Ficha lateral */}
            {selectedRep && (
                <div
                    className="w-72 flex-shrink-0 rounded-xl flex flex-col"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', maxHeight: 'calc(100vh - 66px)', overflowY: 'auto', position: 'sticky', top: '50px', alignSelf: 'flex-start' }}
                >
                    {/* Cabecera */}
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                                style={{ background: 'var(--pb)' }}>
                                {(selectedRep.nombre?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-medium leading-tight" style={{ color: 'var(--jet)' }}>
                                    {selectedRep.nombre} {selectedRep.apellido}
                                </p>
                                <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--ash)' }}>{selectedRep.cedula}</p>
                            </div>
                        </div>
                        <button onClick={closeFicha} className="p-1 rounded-lg" style={{ color: 'var(--ash)' }}>
                            <X size={14} />
                        </button>
                    </div>

                    {/* Datos de contacto */}
                    <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '0.5px solid var(--border)' }}>
                        {[
                            { icon: Phone, label: selectedRep.telefono || '—' },
                            { icon: Mail,  label: selectedRep.correo   || '—' },
                            { icon: MapPin, label: selectedRep.direccion || '—' },
                        ].map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-start gap-2">
                                <Icon size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                                <span className="text-xs break-words" style={{ color: 'var(--ash)' }}>{label}</span>
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
                            <div className="flex justify-center py-4">
                                <Loader2 className="animate-spin" size={18} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : fichaAlumnos.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>Sin alumnos registrados.</p>
                        ) : fichaAlumnos.map(alu => (
                            <div key={alu.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2"
                                style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
                                        {alu.nombre} {alu.apellido}
                                    </p>
                                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                                        {alu.grado_seccion || 'Sin grado'} · {alu.cedula_escolar}
                                    </p>
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${alu.activo ? '' : 'opacity-50'}`}
                                    style={{ background: alu.activo ? 'var(--pb-light)' : 'var(--ash-light)', color: alu.activo ? 'var(--pb-mid)' : 'var(--ash)' }}>
                                    {alu.activo ? 'Activo' : 'Retirado'}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Acciones rápidas */}
                    {canWrite && (
                        <div className="px-4 pb-4 flex gap-2 mt-auto pt-3" style={{ borderTop: '0.5px solid var(--border)' }}>
                            <button
                                onClick={() => openEditar(selectedRep)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
                                style={{ background: 'var(--pb)', color: '#fff' }}
                            >
                                <Pencil size={12} />
                                Editar
                            </button>
                            <button
                                onClick={() => setConfirmDelete(selectedRep)}
                                className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs transition-all"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal crear / editar */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="rounded-2xl w-full max-w-md mx-4 flex flex-col" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                {editando ? 'Editar representante' : 'Agregar representante'}
                            </h2>
                            <button onClick={closeModal} style={{ color: 'var(--ash)' }}><X size={16} /></button>
                        </div>
                        <form onSubmit={handleSave} className="px-5 py-4 flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label style={labelStyle}>Nombre *</label>
                                    <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} style={inputStyle} />
                                    {formErrors.nombre && <p style={errStyle}>{formErrors.nombre}</p>}
                                </div>
                                <div>
                                    <label style={labelStyle}>Apellido *</label>
                                    <input value={form.apellido} onChange={e => setForm(p => ({ ...p, apellido: e.target.value }))} style={inputStyle} />
                                    {formErrors.apellido && <p style={errStyle}>{formErrors.apellido}</p>}
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Cédula *</label>
                                <input
                                    value={form.cedula}
                                    onChange={e => setForm(p => ({ ...p, cedula: e.target.value }))}
                                    style={{ ...inputStyle, ...(editando ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                                    readOnly={!!editando}
                                />
                                {formErrors.cedula && <p style={errStyle}>{formErrors.cedula}</p>}
                            </div>
                            <div>
                                <label style={labelStyle}>Teléfono</label>
                                <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Correo</label>
                                <input type="email" value={form.correo} onChange={e => setForm(p => ({ ...p, correo: e.target.value }))} style={inputStyle} />
                                {formErrors.correo && <p style={errStyle}>{formErrors.correo}</p>}
                            </div>
                            <div>
                                <label style={labelStyle}>Dirección</label>
                                <textarea rows={2} value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                                    style={{ ...inputStyle, resize: 'none' }} />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={closeModal}
                                    className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={saving}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white transition-all"
                                    style={{ background: 'var(--pb)', opacity: saving ? 0.7 : 1 }}>
                                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                    {saving ? 'Guardando…' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal confirmar eliminación */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="rounded-2xl w-full max-w-sm mx-4" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <div className="px-5 py-4">
                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--jet)' }}>¿Eliminar representante?</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                Se eliminará a <strong>{confirmDelete.nombre} {confirmDelete.apellido}</strong>. No se puede deshacer. Los representantes con alumnos activos no pueden eliminarse.
                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-4">
                            <button onClick={() => setConfirmDelete(null)}
                                className="flex-1 py-2 rounded-lg text-xs font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                Cancelar
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                                style={{ background: 'var(--red)', opacity: deleting ? 0.7 : 1 }}>
                                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                {deleting ? 'Eliminando…' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Representantes;
