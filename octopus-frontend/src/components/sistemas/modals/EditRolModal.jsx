import { useState, useEffect } from 'react';
import { X, UserCog, Loader2 } from 'lucide-react';
import { ROL_OPTIONS } from '../../../constants/roles';

const EditRolModal = ({ targetUser, onClose, onEditRol }) => {
    const [newRol,   setNewRol]   = useState(targetUser?.perfil?.rol ?? 'cajero');
    const [loading,  setLoading]  = useState(false);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const ok = await onEditRol(targetUser.id, newRol);
        setLoading(false);
        if (ok) onClose();
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--porcelain)' }}>
                <div className="flex justify-between items-center px-5 py-4"
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Editar rol</h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            Usuario: <span className="font-bold">{targetUser?.username}</span>
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={17} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                            style={{ color: 'var(--ash)' }}>Nuevo Rol</label>
                        <select value={newRol} onChange={e => setNewRol(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                            {ROL_OPTIONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} disabled={loading}
                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {loading ? <Loader2 className="animate-spin" size={15} /> : <UserCog size={15} />}
                            {loading ? 'Guardando...' : 'Guardar cambio'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditRolModal;
