import { useState, useEffect, useCallback } from 'react';
import { Download, FileText, Loader2, AlertCircle, RefreshCcw, Users, Plus, X, FileSpreadsheet, Building2, Pencil } from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const Nomina = () => {
    const [empleados, setEmpleados]       = useState([]);
    const [bancosNomina, setBancosNomina] = useState([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState(null);

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newEmployeeData, setNewEmployeeData] = useState({
        nombre: '', apellido: '', cedula: '', cargo: '',
        banco: '', numero_cuenta: '', tipo_cuenta: '', telefono: '', correo: ''
    });

    const [showEditModal, setShowEditModal]     = useState(false);
    const [editEmployeeData, setEditEmployeeData] = useState(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exporting, setExporting]       = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    // --- Bancaribe modal state ---
    const [showBancaribeModal, setShowBancaribeModal] = useState(false);
    const [loadingBancaribe, setLoadingBancaribe]     = useState(false);
    const [bancaribeRows, setBancaribeRows]           = useState([]);
    const [tasaDia, setTasaDia]                       = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [resEmp, resBancos] = await Promise.all([
                axiosInstance.get('rrhh/empleados/'),
                axiosInstance.get('rrhh/bancos-nomina/?activos=1'),
            ]);
            setEmpleados(resEmp.data || []);
            setBancosNomina(resBancos.data || []);
        } catch (err) {
            const code = err.response?.status;
            if (code === 403)       setError('No tienes permisos para ver la nómina.');
            else if (code === 500)  setError('Error interno del servidor. Contacta al administrador del sistema.');
            else                    setError('Error de conexión. Verifica que el servidor esté activo.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // --- Registro / Edición ---
    const handleNewEmployeeChange = (e) => {
        const { name, value } = e.target;
        setNewEmployeeData(prev => ({ ...prev, [name]: value }));
    };

    const handleRegisterEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo } = newEmployeeData;
        if (!nombre || !apellido || !cedula || !cargo) {
            setError('Nombre, apellido, cédula y cargo son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = { ...newEmployeeData };
            if (!payload.banco) payload.banco = null;
            await axiosInstance.post('rrhh/empleados/', payload);
            toast.success('Empleado registrado exitosamente.');
            handleCloseRegisterModal();
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.detail
                || err.response?.data?.error
                || JSON.stringify(err.response?.data)
                || 'Error al registrar el empleado.';
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseRegisterModal = () => {
        setShowRegisterModal(false);
        setNewEmployeeData({ nombre: '', apellido: '', cedula: '', cargo: '', banco: '', numero_cuenta: '', tipo_cuenta: '', telefono: '', correo: '' });
        setError(null);
    };

    const handleOpenEditModal = (emp) => {
        setEditEmployeeData({
            id: emp.id,
            nombre: emp.nombre || '',
            apellido: emp.apellido || '',
            cedula: emp.cedula || '',
            cargo: emp.cargo || '',
            banco: emp.banco ?? '',
            numero_cuenta: emp.numero_cuenta || '',
            tipo_cuenta: emp.tipo_cuenta || '',
            telefono: emp.telefono || '',
            correo: emp.correo || '',
        });
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setEditEmployeeData(null);
        setError(null);
    };

    const handleEditEmployeeChange = (e) => {
        const { name, value } = e.target;
        setEditEmployeeData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo } = editEmployeeData;
        if (!nombre || !apellido || !cedula || !cargo) {
            setError('Nombre, apellido, cédula y cargo son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = { ...editEmployeeData };
            delete payload.id;
            if (!payload.banco) payload.banco = null;
            await axiosInstance.patch(`rrhh/empleados/${editEmployeeData.id}/`, payload);
            toast.success('Empleado actualizado exitosamente.');
            handleCloseEditModal();
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.detail
                || err.response?.data?.error
                || JSON.stringify(err.response?.data)
                || 'Error al actualizar el empleado.';
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Exportaciones ---
    const handleExportTXT = async () => {
        setExporting(true);
        try {
            const response = await axiosInstance.get('rrhh/empleados/exportar_txt/', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NOMINA_${new Date().toISOString().split('T')[0]}.txt`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Archivo bancario generado exitosamente.');
        } catch {
            toast.error('Error al generar el archivo.');
        } finally {
            setExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/exportar_excel/', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `nomina_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel de nómina.');
        } finally {
            setExportingExcel(false);
        }
    };

    // --- Bancaribe ---
    const handleOpenBancaribeModal = async () => {
        setLoadingBancaribe(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/preview_bancaribe/');
            const { empleados: emps, tasa } = res.data;
            setTasaDia(tasa || 0);
            setBancaribeRows(emps.map(e => ({ ...e, monto_usd: '' })));
            setShowBancaribeModal(true);
        } catch {
            toast.error('No se pudo cargar la vista previa de Bancaribe.');
        } finally {
            setLoadingBancaribe(false);
        }
    };

    const handleCloseBancaribeModal = () => {
        setShowBancaribeModal(false);
        setBancaribeRows([]);
        setTasaDia(0);
    };

    const handleBancaribeMontoChange = (id, value) => {
        setBancaribeRows(prev =>
            prev.map(r => r.id === id ? { ...r, monto_usd: value } : r)
        );
    };

    const handleGenerarBancaribeTXT = () => {
        const pagos = bancaribeRows.filter(r => {
            const m = parseFloat(r.monto_usd);
            return !isNaN(m) && m > 0;
        });

        if (pagos.length === 0) {
            toast.warn('Ingresa al menos un monto mayor a 0 para generar el archivo.');
            return;
        }

        const lines = pagos.map(r => {
            const cuenta   = r.numero_cuenta.trim();
            const codBanco = cuenta.slice(0, 4);
            const montoUsd = parseFloat(r.monto_usd);
            const montoVes = (montoUsd * tasaDia).toFixed(2);
            const cedula   = r.cedula.replace(/^[Vv]-?/, '');
            const nombre   = `${r.nombre.toUpperCase()} ${r.apellido.toUpperCase()}`;
            const correo   = r.correo || '';
            const telefono = (r.telefono || '').replace(/[-\s]/g, '');
            return `PAP//0/${codBanco}/${cuenta}/${r.tipo_cuenta}/0/${montoVes}/V${cedula}/${nombre}//${correo}/${telefono}//`;
        });

        const content  = lines.join('\r\n');
        const blob     = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url      = URL.createObjectURL(blob);
        const fecha    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const link     = document.createElement('a');
        link.href      = url;
        link.download  = `Pagos PAP-${fecha}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`TXT Bancaribe generado con ${pagos.length} empleado(s).`);
        handleCloseBancaribeModal();
    };

    // --- Form fields reutilizables ---
    const textFields = [
        { label: 'Nombre',           name: 'nombre',        type: 'text',  placeholder: 'Juan',                   required: true  },
        { label: 'Apellido',         name: 'apellido',      type: 'text',  placeholder: 'Pérez',                  required: true  },
        { label: 'Cédula',           name: 'cedula',        type: 'text',  placeholder: 'V-12345678',             required: true  },
        { label: 'Cargo',            name: 'cargo',         type: 'text',  placeholder: 'Profesor de Matemáticas',required: true  },
        { label: 'Número de cuenta', name: 'numero_cuenta', type: 'text',  placeholder: '01140000000000000000',   required: false },
        { label: 'Teléfono',         name: 'telefono',      type: 'text',  placeholder: '0414-0000000',           required: false },
        { label: 'Correo',           name: 'correo',        type: 'email', placeholder: 'empleado@correo.com',    required: false },
    ];

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-3" size={36} style={{ color: 'var(--pb)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Cargando nómina...</p>
        </div>
    );

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Gestión de Nómina</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Registro y administración del personal</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setShowRegisterModal(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--pb)' }}>
                        <Plus size={16} /> Nuevo Empleado
                    </button>
                    <button onClick={fetchData}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        <RefreshCcw size={16} /> Refrescar
                    </button>
                    <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                        {exportingExcel ? 'Exportando...' : 'Excel'}
                    </button>
                    <button onClick={handleExportTXT} disabled={exporting || empleados.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                        {exporting ? 'Exportando...' : 'TXT Banco'}
                    </button>
                    <button onClick={handleOpenBancaribeModal} disabled={loadingBancaribe || empleados.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: '#004FA3' }}>
                        {loadingBancaribe ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                        {loadingBancaribe ? 'Cargando...' : 'Bancaribe'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-sm"
                     style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl p-4" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Personal activo</p>
                    <div className="flex items-center gap-2">
                        <Users size={18} style={{ color: 'var(--pb)' }} />
                        <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{empleados.length} empleados</p>
                    </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Bancos registrados</p>
                    <div className="flex items-center gap-2">
                        <Building2 size={18} style={{ color: 'var(--pb)' }} />
                        <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{bancosNomina.length} bancos</p>
                    </div>
                </div>
            </div>

            {/* Tabla empleados */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                {['Empleado', 'Cargo', 'Banco', 'N° Cuenta', 'Teléfono', 'Correo', 'Acción'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {empleados.length > 0 ? empleados.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{emp.nombre} {emp.apellido}</p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>V-{emp.cedula}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs px-2 py-1 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                            {emp.cargo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.banco_nombre || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                        {emp.numero_cuenta || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.telefono || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.correo || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleOpenEditModal(emp)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}>
                                                <Pencil size={13} /> Editar
                                            </button>
                                            <button onClick={() => toast.info(`Recibo de ${emp.nombre} en desarrollo.`)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ color: 'var(--pb)' }}>
                                                <FileText size={13} /> Ver recibo
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" className="px-4 py-16 text-center text-sm"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                                        No hay empleados registrados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ==================== MODAL BANCARIBE ==================== */}
            {showBancaribeModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.6)' }}>
                    <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '90vh' }}>

                        {/* Header modal */}
                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#004FA3' }} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Generar pago Bancaribe</h3>
                                <div className="flex items-center gap-2">
                                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                                        Tasa Bs/USD
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={tasaDia}
                                        onChange={e => setTasaDia(parseFloat(e.target.value) || 0)}
                                        className="w-28 px-2.5 py-1 rounded-lg text-sm font-mono outline-none text-right"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    />
                                </div>
                            </div>
                            <button onClick={handleCloseBancaribeModal} style={{ color: 'var(--ash)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Cuerpo con tabla */}
                        <div className="overflow-y-auto flex-1">
                            {bancaribeRows.length === 0 ? (
                                <div className="py-20 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                    No hay empleados con cuenta Bancaribe (0114) y tipo de cuenta configurados.
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0" style={{ background: 'var(--porcelain)', zIndex: 1 }}>
                                        <tr>
                                            {['Empleado', 'Cédula', 'N° Cuenta', 'Tipo', 'Monto USD', 'Monto Bs'].map(h => (
                                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                                    style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bancaribeRows.map(row => {
                                            const montoUsd = parseFloat(row.monto_usd) || 0;
                                            const montoVes = tasaDia > 0 ? (montoUsd * tasaDia).toFixed(2) : '—';
                                            const activo   = montoUsd > 0;
                                            return (
                                                <tr key={row.id} style={{
                                                    borderBottom: '0.5px solid var(--border)',
                                                    background: activo ? 'rgba(232,64,28,0.04)' : 'var(--porcelain)',
                                                    transition: 'background 0.15s',
                                                }}>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                            {row.nombre} {row.apellido}
                                                        </p>
                                                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{row.banco_nombre}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                                        V-{row.cedula}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                                        {row.numero_cuenta}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                                                            style={{
                                                                background: row.tipo_cuenta === 'CTE' ? 'var(--pb-light)' : '#f0fdf4',
                                                                color: row.tipo_cuenta === 'CTE' ? 'var(--pb-mid)' : '#16a34a',
                                                            }}>
                                                            {row.tipo_cuenta === 'CTE' ? 'Corriente' : 'Ahorro'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>$</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                placeholder="0.00"
                                                                value={row.monto_usd}
                                                                onChange={e => handleBancaribeMontoChange(row.id, e.target.value)}
                                                                className="w-28 px-2 py-1.5 rounded-lg text-sm font-mono outline-none text-right"
                                                                style={{
                                                                    border: `0.5px solid ${activo ? '#004FA3' : 'var(--border-md)'}`,
                                                                    background: 'var(--porcelain)',
                                                                    color: 'var(--jet)',
                                                                }}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-mono"
                                                        style={{ color: activo ? 'var(--jet)' : 'var(--ash)' }}>
                                                        {activo && tasaDia > 0 ? `${montoVes} Bs` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer modal */}
                        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                {bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0).length} de {bancaribeRows.length} empleado(s) incluidos
                            </p>
                            <div className="flex gap-2">
                                <button onClick={handleCloseBancaribeModal}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button onClick={handleGenerarBancaribeTXT} disabled={bancaribeRows.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: '#004FA3' }}>
                                    <Download size={15} /> Generar TXT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== MODAL EDITAR ==================== */}
            {showEditModal && editEmployeeData && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Editar — {editEmployeeData.nombre} {editEmployeeData.apellido}
                            </h3>
                            <button onClick={handleCloseEditModal} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveEmployee} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {error && (
                                <div className="p-3 rounded-lg text-sm flex gap-2"
                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                    <AlertCircle size={15} /> {error}
                                </div>
                            )}
                            {textFields.map(field => (
                                <div key={field.name}>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                        {field.label}
                                        {!field.required && <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>}
                                    </label>
                                    <input type={field.type} name={field.name}
                                        value={editEmployeeData[field.name]}
                                        onChange={handleEditEmployeeChange}
                                        placeholder={field.placeholder}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        required={field.required} />
                                </div>
                            ))}
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Banco <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>
                                </label>
                                <select name="banco" value={editEmployeeData.banco} onChange={handleEditEmployeeChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}>
                                    <option value="">— Sin banco —</option>
                                    {bancosNomina.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Tipo de cuenta <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>
                                </label>
                                <select name="tipo_cuenta" value={editEmployeeData.tipo_cuenta} onChange={handleEditEmployeeChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}>
                                    <option value="">— Sin especificar —</option>
                                    <option value="CTE">Corriente (CTE)</option>
                                    <option value="AHO">Ahorro (AHO)</option>
                                </select>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={handleCloseEditModal}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Pencil size={15} />}
                                    {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================== MODAL REGISTRAR ==================== */}
            {showRegisterModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Registrar empleado</h3>
                            <button onClick={handleCloseRegisterModal} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleRegisterEmployee} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {error && (
                                <div className="p-3 rounded-lg text-sm flex gap-2"
                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                    <AlertCircle size={15} /> {error}
                                </div>
                            )}
                            {textFields.map(field => (
                                <div key={field.name}>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                        {field.label}
                                        {!field.required && <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>}
                                    </label>
                                    <input type={field.type} name={field.name}
                                        value={newEmployeeData[field.name]}
                                        onChange={handleNewEmployeeChange}
                                        placeholder={field.placeholder}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        required={field.required} />
                                </div>
                            ))}
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Banco <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>
                                </label>
                                <select name="banco" value={newEmployeeData.banco} onChange={handleNewEmployeeChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}>
                                    <option value="">— Sin banco —</option>
                                    {bancosNomina.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                </select>
                                {bancosNomina.length === 0 && (
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                        No hay bancos configurados. Agrégalos en Configuración &gt; Bancos de Nómina.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Tipo de cuenta <span className="ml-1 normal-case" style={{ opacity: 0.6 }}>(opcional)</span>
                                </label>
                                <select name="tipo_cuenta" value={newEmployeeData.tipo_cuenta} onChange={handleNewEmployeeChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}>
                                    <option value="">— Sin especificar —</option>
                                    <option value="CTE">Corriente (CTE)</option>
                                    <option value="AHO">Ahorro (AHO)</option>
                                </select>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={handleCloseRegisterModal}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                                    {isSubmitting ? 'Registrando...' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Nomina;
