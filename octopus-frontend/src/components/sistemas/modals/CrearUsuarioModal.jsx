import { useState, useEffect, useMemo } from 'react';
import { User, Mail, Lock, Eye, EyeOff, X, UserPlus, Loader2, Check, AlertCircle } from 'lucide-react';
import { ROL_OPTIONS } from '../../../constants/roles';

const EMPTY_FORM = { username: '', first_name: '', last_name: '', email: '', password: '', rol: 'cajero' };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Espeja las reglas activas en AUTH_PASSWORD_VALIDATORS (config/settings.py del backend)
// para dar feedback inmediato antes de enviar el formulario.
const PASSWORD_RULES = [
    { test: (v) => v.length >= 8,        label: 'Al menos 8 caracteres' },
    { test: (v) => !/^\d+$/.test(v) && v.length > 0, label: 'No puede ser completamente numérica' },
];

const CrearUsuarioModal = ({ onClose, onCreate }) => {
    const [formData,     setFormData]     = useState(EMPTY_FORM);
    const [showPassword, setShowPassword] = useState(false);
    const [loading,      setLoading]      = useState(false);
    const [touched,      setTouched]      = useState({});

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));
    const setBlurred = (name) => setTouched(prev => ({ ...prev, [name]: true }));

    const passwordChecks = useMemo(
        () => PASSWORD_RULES.map(rule => ({ ...rule, ok: rule.test(formData.password) })),
        [formData.password]
    );
    const passwordValid = passwordChecks.every(c => c.ok);
    const emailValid = formData.email === '' || EMAIL_REGEX.test(formData.email);
    const canSubmit = formData.username.trim() !== ''
        && formData.first_name.trim() !== ''
        && formData.last_name.trim() !== ''
        && emailValid && formData.email !== '' && passwordValid;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ username: true, first_name: true, last_name: true, email: true, password: true });
        if (!canSubmit) return;
        setLoading(true);
        const payload = {
            ...formData,
            username: formData.username.trim(),
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim(),
            email: formData.email.trim(),
        };
        const ok = await onCreate(payload);
        setLoading(false);
        if (ok) onClose();
    };

    const FIELDS = [
        { label: 'Usuario (solo para iniciar sesión)', name: 'username', type: 'text',  Icon: User, placeholder: 'jperez' },
        { label: 'Nombre', name: 'first_name', type: 'text', Icon: User, placeholder: 'Juan' },
        { label: 'Apellido', name: 'last_name', type: 'text', Icon: User, placeholder: 'Pérez' },
        {
            label: 'Correo', name: 'email', type: 'email', Icon: Mail, placeholder: 'usuario@colegio.com',
            error: touched.email && formData.email !== '' && !emailValid ? 'Correo electrónico inválido' : null,
        },
    ];

    const borderColor = (hasError) => hasError ? 'var(--red)' : 'var(--border-md)';

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--porcelain)' }}>
                <div className="flex justify-between items-center px-5 py-4"
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Nuevo operador</h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Registre personal administrativo al sistema</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={17} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {FIELDS.map(({ label, name, type, Icon, placeholder, error }) => (
                        <div key={name}>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                style={{ color: 'var(--ash)' }}>{label}</label>
                            <div className="relative">
                                <Icon size={15} className="absolute left-3 top-2.5" style={{ color: 'var(--ash)' }} />
                                <input type={type} placeholder={placeholder}
                                    value={formData[name]}
                                    onChange={e => setField(name, e.target.value)}
                                    onBlur={() => setBlurred(name)}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none transition-colors focus:ring-2"
                                    style={{
                                        border: `0.5px solid ${borderColor(error)}`,
                                        background: '#fff', color: 'var(--jet)',
                                        boxShadow: error ? '0 0 0 2px rgba(220,38,38,0.12)' : undefined,
                                    }}
                                    required />
                            </div>
                            {error && (
                                <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'var(--red)' }}>
                                    <AlertCircle size={12} /> {error}
                                </p>
                            )}
                        </div>
                    ))}

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                            style={{ color: 'var(--ash)' }}>Contraseña</label>
                        <div className="relative">
                            <Lock size={15} className="absolute left-3 top-2.5" style={{ color: 'var(--ash)' }} />
                            <input type={showPassword ? 'text' : 'password'}
                                placeholder="Mínimo 8 caracteres"
                                value={formData.password}
                                onChange={e => setField('password', e.target.value)}
                                onBlur={() => setBlurred('password')}
                                className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none transition-colors focus:ring-2"
                                style={{
                                    border: `0.5px solid ${borderColor(touched.password && !passwordValid)}`,
                                    background: '#fff', color: 'var(--jet)',
                                }}
                                required />
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                        <ul className="mt-1.5 space-y-0.5">
                            {passwordChecks.map(({ label, ok }) => (
                                <li key={label} className="flex items-center gap-1.5 text-[11px]"
                                    style={{ color: ok ? 'var(--green)' : 'var(--ash)' }}>
                                    {ok
                                        ? <Check size={11} />
                                        : <span className="inline-block w-[11px] h-[11px] rounded-full"
                                            style={{ border: '1.5px solid var(--border-md)' }} />
                                    }
                                    {label}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                            style={{ color: 'var(--ash)' }}>Rol</label>
                        <select value={formData.rol}
                            onChange={e => setField('rol', e.target.value)}
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
                        <button type="submit" disabled={loading || (Object.keys(touched).length > 0 && !canSubmit)}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {loading ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
                            {loading ? 'Creando...' : 'Crear usuario'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CrearUsuarioModal;
