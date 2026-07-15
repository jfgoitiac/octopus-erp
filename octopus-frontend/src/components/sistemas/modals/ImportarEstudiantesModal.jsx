import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ImportarEstudiantesModal = ({ onClose, onPreview, onConfirm, loadingPreview, loadingConfirm }) => {
    const [archivo, setArchivo] = useState(null);
    const [resumen, setResumen] = useState(null);
    const inputRef = useRef(null);

    const handleSeleccionar = (file) => {
        if (!file) return;
        setArchivo(file);
        setResumen(null);
    };

    const handlePreview = async () => {
        if (!archivo) return;
        const data = await onPreview(archivo);
        if (data) setResumen(data);
    };

    const handleConfirmar = async () => {
        if (!archivo) return;
        const data = await onConfirm(archivo);
        if (data) onClose();
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
                style={{ background: 'var(--porcelain)' }}>
                <div className="flex justify-between items-center px-5 py-4 shrink-0"
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Cargar base de estudiantes</h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Importar matrícula desde un archivo Excel (.xlsx)</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={17} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <button type="button" onClick={() => inputRef.current?.click()}
                        className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl transition-all"
                        style={{ border: '1.5px dashed var(--border-md)', background: '#fff' }}>
                        <FileSpreadsheet size={28} style={{ color: 'var(--pb)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            {archivo ? archivo.name : 'Seleccionar archivo .xlsx'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>Click para elegir el archivo</span>
                    </button>
                    <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
                        onChange={e => handleSeleccionar(e.target.files?.[0])} />

                    {archivo && !resumen && (
                        <button onClick={handlePreview} disabled={loadingPreview}
                            className="w-full py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {loadingPreview ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />}
                            {loadingPreview ? 'Leyendo archivo...' : 'Analizar archivo'}
                        </button>
                    )}

                    {resumen && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-3 rounded-lg" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                                    <div className="text-lg font-semibold" style={{ color: 'var(--jet)' }}>{resumen.total}</div>
                                    <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total</div>
                                </div>
                                <div className="p-3 rounded-lg" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                                    <div className="text-lg font-semibold text-amber-600">{resumen.con_warnings}</div>
                                    <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Con aviso</div>
                                </div>
                                <div className="p-3 rounded-lg" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                                    <div className="text-lg font-semibold text-red-600">{resumen.con_errores}</div>
                                    <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Con error</div>
                                </div>
                            </div>

                            <div className="rounded-lg overflow-hidden max-h-60 overflow-y-auto"
                                style={{ border: '0.5px solid var(--border-md)' }}>
                                {resumen.filas.map(f => (
                                    <div key={f.fila_excel} className="flex items-start gap-2 px-3 py-2 text-xs"
                                        style={{ borderBottom: '0.5px solid var(--border)', background: '#fff' }}>
                                        {f.errors.length > 0
                                            ? <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                                            : f.warnings.length > 0
                                                ? <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                                : <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />}
                                        <div className="min-w-0">
                                            <div className="font-medium truncate" style={{ color: 'var(--jet)' }}>
                                                {f.nombre} — {f.grado_seccion}
                                            </div>
                                            {(f.errors.length > 0 || f.warnings.length > 0) && (
                                                <div style={{ color: 'var(--ash)' }}>
                                                    {[...f.errors, ...f.warnings].join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                Las filas con error no se importarán. Las filas con aviso sí se crean, pero conviene revisarlas luego.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 p-5 pt-0 shrink-0">
                    <button type="button" onClick={onClose} disabled={loadingConfirm}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    {resumen && (
                        <button onClick={handleConfirmar} disabled={loadingConfirm}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {loadingConfirm ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />}
                            {loadingConfirm ? 'Importando...' : `Confirmar (${resumen.total - resumen.con_errores})`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportarEstudiantesModal;
