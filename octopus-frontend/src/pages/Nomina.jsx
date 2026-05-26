import { useState, useEffect, useMemo, useCallback } from 'react';
import { Download, FileText, Loader2, AlertCircle, RefreshCcw, Banknote, Users, Plus, X, FileSpreadsheet } from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { toast } from 'react-toastify';

const Nomina = () => {
    const [empleados, setEmpleados]     = useState([]);
    const { tasa, loading: loadingTasa, error: errorTasa } = useTasaBCV(); // [DESPUÉS]
    const [loading, setLoading]         = useState(true);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newEmployeeData, setNewEmployeeData] = useState({
        nombre: '', apellido: '', cedula: '', cargo: '', sueldo_base: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exporting, setExporting]     = useState(false);
    const [error, setError]             = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [resEmp] = await Promise.all([
                axiosInstance.get('rrhh/empleados/')
            ]);
            setEmpleados(resEmp.data || []);
        } catch (err) {
            const code = err.response?.status;
            if (code === 403) {
                setError('No tienes permisos para ver la nómina.');
            } else if (code === 500) {
                setError('Error interno del servidor. Contacta al administrador del sistema.');
            } else if (code === 404) {
                setError('Endpoint no encontrado. Verifica la configuración del backend.');
            } else {
                setError('Error de conexión. Verifica que el servidor esté activo.');
            }
            console.error('Error cargando nómina:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const totales = useMemo(() => {
        const usd = empleados.reduce((acc, emp) => acc + (parseFloat(emp.sueldo_base || '0') || 0), 0);
        return { usd, ves: tasa > 0 ? usd * tasa : 0 };
    }, [empleados, tasa]);

    const handleNewEmployeeChange = (e) => {
        const { name, value } = e.target;
        setNewEmployeeData(prev => ({ 
            ...prev, 
            [name]: name === 'sueldo_base' ? value.replace(',', '.') : value
        }));
    };

    const handleRegisterEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo, sueldo_base } = newEmployeeData;
        if (!nombre || !apellido || !cedula || !cargo || !sueldo_base) {
            setError('Todos los campos son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await axiosInstance.post('rrhh/empleados/', newEmployeeData);
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
        setNewEmployeeData({ nombre: '', apellido: '', cedula: '', cargo: '', sueldo_base: '' });
        setError(null);
    };

    const [exportingExcel, setExportingExcel] = useState(false);

    const handleExportTXT = async () => {
        setExporting(true);
        try {
            const response = await axiosInstance.get('rrhh/empleados/exportar_txt/', {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NOMINA_${new Date().toISOString().split('T')[0]}.txt`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Archivo bancario generado exitosamente.');
        } catch (err) {
            toast.error('Error al generar el archivo. Verifica los permisos.');
            console.error('Export error:', err);
        } finally {
            setExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/exportar_excel/', {
                responseType: 'blob',
            });
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

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-3" size={36} style={{ color: 'var(--pb)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ash)' }}>
                Cargando nómina...
            </p>
        </div>
    );

    return (
        <div className="animate-fadeIn">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Gestión de Nómina</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Tasa BCV activa: 
                        {(!tasa && loadingTasa) ? (
                            <span className="animate-pulse ml-1">Cargando...</span>
                        ) : (
                            <span style={{ color: 'var(--pb)', fontWeight: 500 }}>Bs. {tasa.toLocaleString('es-VE')}</span>
                        )}
                        {errorTasa && <span className="ml-2 text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">Tasa no actualizada</span>}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setShowRegisterModal(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                        style={{ background: 'var(--pb)' }}><Plus size={16} /> Nuevo Empleado</button>
                    <button onClick={fetchData}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}><RefreshCcw size={16} /> Refrescar</button>
                    <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                        {exportingExcel ? 'Exportando...' : 'Excel'}
                    </button>
                    <button onClick={handleExportTXT} disabled={exporting || empleados.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                        {exporting ? 'Exportando...' : 'TXT Banco'}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                {[
                    { label: 'Personal activo', value: `${empleados.length} empleados`, icon: Users, variant: 'pb' },
                    { label: 'Total USD', value: `$${totales.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: Banknote, variant: 'pb' },
                    { label: 'Total Bolívares', value: `Bs. ${totales.ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, icon: RefreshCcw, variant: 'ash' },
                ].map(({ label, value, icon: Icon, variant }) => (
                    <div key={label} className="rounded-xl p-4" 
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>{label}</p>
                        <div className="flex items-center gap-2">
                            <Icon size={18} style={{ color: variant === 'pb' ? 'var(--pb)' : 'var(--ash)' }} />
                            <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            {['Empleado', 'Cargo', 'Sueldo (USD)', 'A pagar (Bs.)', 'Acción'].map(h => (
                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                    style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {empleados.length > 0 ? empleados.map(emp => (
                            <tr key={emp.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}> 
                                <td className="px-4 py-3">
                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}> 
                                        {emp.nombre} {emp.apellido}
                                    </p>
                                    <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>V-{emp.cedula}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-xs px-2 py-1 rounded-md"
                                        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                        {emp.cargo}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--jet)' }}>
                                    ${(parseFloat(emp.sueldo_base) || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--pb)' }}>
                                    Bs. {((parseFloat(emp.sueldo_base) || 0) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => toast.info(`Recibo de ${emp.nombre} en desarrollo.`)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                        style={{ color: 'var(--pb)' }}
                                    >
                                        <FileText size={13} /> Ver recibo
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5" className="px-4 py-16 text-center text-sm"
                                    style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                                    No hay empleados registrados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showRegisterModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4" style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}> 
                                Registrar empleado
                            </h3>
                            <button onClick={handleCloseRegisterModal} style={{ color: 'var(--ash)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleRegisterEmployee} className="p-5 space-y-4">
                            {error && (
                                <div className="p-3 rounded-lg text-sm flex gap-2"
                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                    <AlertCircle size={15} style={{ color: 'var(--red)' }} /> {error}
                                </div>
                            )}
                            {[
                                { label: 'Nombre', name: 'nombre', type: 'text', placeholder: 'Juan' },
                                { label: 'Apellido', name: 'apellido', type: 'text', placeholder: 'Pérez' },
                                { label: 'Cédula', name: 'cedula', type: 'text', placeholder: 'V-12345678' },
                                { label: 'Cargo', name: 'cargo', type: 'text', placeholder: 'Profesor de Matemáticas' },
                                { label: 'Sueldo base (USD)', name: 'sueldo_base', type: 'number', placeholder: '300.00' },
                            ].map(field => (
                                <div key={field.name}>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}>{field.label}</label>
                                    <input
                                        type={field.type}
                                        name={field.name}
                                        step={field.name === 'sueldo_base' ? '0.01' : undefined}
                                        value={newEmployeeData[field.name]}
                                        onChange={handleNewEmployeeChange}
                                        placeholder={field.placeholder}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{
                                            border: '0.5px solid var(--border-md)',
                                            background: 'var(--porcelain)',
                                            color: 'var(--jet)'
                                        }}
                                        required
                                    />
                                </div>
                            ))}
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={handleCloseRegisterModal}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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