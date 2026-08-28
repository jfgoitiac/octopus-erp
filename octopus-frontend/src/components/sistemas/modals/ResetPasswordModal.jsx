import { useState } from 'react';
import { Lock, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { nombreUsuario } from '../../../utils/nombreUsuario';
import { Modal } from '../../ui/Modal';

const ResetPasswordModal = ({ targetUser, onClose, onResetPassword }) => {
    const [newPassword,  setNewPassword]  = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading,      setLoading]      = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newPassword.trim()) return toast.error('Ingresa una nueva contraseña.');
        setLoading(true);
        const ok = await onResetPassword(targetUser.id, newPassword);
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
            <button type="submit" form="form-reset-password" disabled={loading}
                className="w-full sm:w-auto py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {loading ? <Loader2 className="animate-spin" size={15} /> : <Key size={15} />}
                {loading ? 'Procesando...' : 'Cambiar clave'}
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div>Restablecer contraseña</div>
                    <p className="text-xs mt-0.5 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        Usuario: <span className="font-bold">{nombreUsuario(targetUser)}</span>
                    </p>
                </div>
            )}
            footer={footer}
            size="sm"
        >
            <form id="form-reset-password" onSubmit={handleSubmit}>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                    style={{ color: 'var(--ash)' }}>Nueva Contraseña</label>
                <div className="relative">
                    <Lock size={15} className="absolute left-3 top-2.5" style={{ color: 'var(--ash)' }} />
                    <input type={showPassword ? 'text' : 'password'}
                        placeholder="Mínimo 8 caracteres"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        required />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ResetPasswordModal;
