import { useState } from 'react';
import { UserCog, Loader2 } from 'lucide-react';
import { ROL_OPTIONS } from '../../../constants/roles';
import { nombreUsuario } from '../../../utils/nombreUsuario';
import { Modal } from '../../ui/Modal';

const EditRolModal = ({ targetUser, onClose, onEditRol }) => {
    const [newRol,   setNewRol]   = useState(targetUser?.perfil?.rol ?? 'cajero');
    const [loading,  setLoading]  = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const ok = await onEditRol(targetUser.id, newRol);
        setLoading(false);
        if (ok) onClose();
    };

    const footer = (
        <>
            <button type="button" onClick={onClose} disabled={loading}
                className="w-full sm:w-auto py-2 rounded-lg text-sm font-medium transition-all"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button type="submit" form="form-editar-rol" disabled={loading}
                className="w-full sm:w-auto py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {loading ? <Loader2 className="animate-spin" size={15} /> : <UserCog size={15} />}
                {loading ? 'Guardando...' : 'Guardar cambio'}
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div>Editar rol</div>
                    <p className="text-xs mt-0.5 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        Usuario: <span className="font-bold">{nombreUsuario(targetUser)}</span>
                    </p>
                </div>
            )}
            footer={footer}
            size="sm"
        >
            <form id="form-editar-rol" onSubmit={handleSubmit}>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                    style={{ color: 'var(--ash)' }}>Nuevo Rol</label>
                <select value={newRol} onChange={e => setNewRol(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                    {ROL_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
            </form>
        </Modal>
    );
};

export default EditRolModal;
