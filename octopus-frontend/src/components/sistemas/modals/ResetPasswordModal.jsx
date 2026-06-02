import { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

const ResetPasswordModal = ({ targetUser, onClose, onResetPassword }) => {
    const [newPassword,  setNewPassword]  = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading,      setLoading]      = useState(false);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newPassword.trim()) return toast.error('Ingresa una nueva contraseña.');
        setLoading(true);
        const ok = await onResetPassword(targetUser.id, newPassword);
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
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Restablecer contraseña</h3>
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
                            {loading ? <Loader2 className="animate-spin" size={15} /> : <Key size={15} />}
                            {loading ? 'Procesando...' : 'Cambiar clave'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ResetPasswordModal;
