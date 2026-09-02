import { Loader2, Save, Search, X } from 'lucide-react';
import { Modal } from '../ui/Modal';

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const labelStyle = { color: 'var(--ash)' };

const TIPOS = [
    { value: 'academica', label: 'Académica' },
    { value: 'deportiva', label: 'Deportiva' },
    { value: 'socioeconomica', label: 'Socioeconómica' },
    { value: 'hermanos', label: 'Hermanos' },
    { value: 'empleado', label: 'Hijo de Empleado' },
    { value: 'otra', label: 'Otra' },
];

/**
 * Formulario de otorgamiento/edición de Beca (ver secretaria/models.py::Beca).
 * Solo afecta mensualidades — no inscripción ni cargos especiales, se avisa
 * en el propio formulario para que quien otorga la beca no asuma más de lo
 * que realmente cubre.
 */
export default function ModalBeca({
    open, onClose, editando,
    form, setForm, saving, onSave,
    busquedaAlumno, setBusquedaAlumno, resultadosAlumnos, buscandoAlumnos,
}) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            titulo={editando ? 'Editar Beca' : 'Otorgar Beca'}
            size="lg"
            footer={(
                <>
                    <button type="button" onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={onSave} disabled={saving}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--pb)' }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Guardar
                    </button>
                </>
            )}
        >
            <div className="space-y-4">
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                    La beca solo aplica a mensualidades. Inscripción y cargos especiales se cobran normalmente.
                </p>

                {/* Selector de alumno */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Alumno *</label>
                    {editando ? (
                        <div className="w-full px-3 py-2 rounded-lg text-sm" style={{ ...inputStyle, background: 'var(--bg)' }}>
                            {form.alumno?.nombre || form.alumno?.nombre_completo || '—'}
                        </div>
                    ) : form.alumno ? (
                        <div className="w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between" style={inputStyle}>
                            <span>{form.alumno.nombre} {form.alumno.apellido}</span>
                            <button type="button" onClick={() => setForm(p => ({ ...p, alumno: null }))} aria-label="Quitar selección">
                                <X size={14} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--ash)' }} />
                            <input type="text" value={busquedaAlumno}
                                onChange={e => setBusquedaAlumno(e.target.value)}
                                placeholder="Buscar por nombre, apellido o cédula escolar"
                                className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                            {buscandoAlumnos && (
                                <Loader2 className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--ash)' }} />
                            )}
                            {resultadosAlumnos.length > 0 && (
                                <div className="mt-1.5 rounded-lg overflow-hidden max-h-48 overflow-y-auto"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                    {resultadosAlumnos.map(a => (
                                        <button key={a.id} type="button"
                                            onClick={() => setForm(p => ({ ...p, alumno: a }))}
                                            className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                                            style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <span>{a.nombre} {a.apellido}</span>
                                            <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{a.grado_seccion || 'Sin grado'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Período Escolar *</label>
                        <input type="text" value={form.periodo_escolar}
                            onChange={e => setForm(p => ({ ...p, periodo_escolar: e.target.value }))}
                            placeholder="Ej. 2026-2027"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Tipo</label>
                        <select value={form.tipo}
                            onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Porcentaje (%) *</label>
                        <input type="number" min="1" max="100" value={form.porcentaje}
                            onChange={e => setForm(p => ({ ...p, porcentaje: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div />
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Vigente Desde *</label>
                        <input type="date" value={form.fecha_desde}
                            onChange={e => setForm(p => ({ ...p, fecha_desde: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Vigente Hasta *</label>
                        <input type="date" value={form.fecha_hasta}
                            onChange={e => setForm(p => ({ ...p, fecha_hasta: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Motivo</label>
                        <textarea value={form.motivo} rows={2}
                            onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={inputStyle} />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={labelStyle}>Documento de Respaldo (opcional)</label>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => setForm(p => ({ ...p, documento_adjunto: e.target.files?.[0] || null }))}
                            className="w-full text-sm" />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
