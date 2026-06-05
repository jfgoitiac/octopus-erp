import { useState, useContext } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import logoColegio from '../assets/logo-colegio.png';
import { toast } from 'react-toastify';

const classifyAuthError = (err) => {
    const status = err?.response?.status;
    if (status === 401 || status === 400) return 'Usuario o contraseña incorrectos.';
    if (status >= 500) return 'Error en el servidor. Intenta más tarde.';
    return 'Sin conexión. Revisa tu red.';
};

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login, isAuthenticated, loading } = useContext(AuthContext);
    const navigate = useNavigate();

    if (loading) return null;
    if (isAuthenticated) return <Navigate to="/" replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            toast.error(classifyAuthError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
            <div className="max-w-md w-full rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                <div className="p-8 text-center" style={{ background: 'var(--jet)' }}>
                    <div className="inline-flex p-2 rounded-xl backdrop-blur-sm mb-4" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <img src={logoColegio} alt="Logo del colegio" className="w-16 h-16 object-contain" />
                    </div>
                    <h1 className="text-xl font-medium text-white">Octopus ERP</h1>
                    <p className="text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--ash)' }}>Gestión Escolar</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6" noValidate>
                    <div>
                        <label htmlFor="login-username" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Usuario
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={16} aria-hidden="true" />
                            <input
                                id="login-username"
                                type="text"
                                className="w-full px-3 py-2 pl-9 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--pb)]"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                placeholder="jperez"
                                autoComplete="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="login-password" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={16} aria-hidden="true" />
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                className="w-full px-3 py-2 pl-9 pr-10 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--pb)]"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none focus:ring-2 focus:ring-[var(--pb)] rounded"
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                style={{ color: 'var(--ash)' }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--pb)] focus:ring-offset-2"
                        style={{ background: 'var(--pb)' }}
                    >
                        {isSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                        <span>{isSubmitting ? 'Entrando...' : 'Entrar al Sistema'}</span>
                    </button>
                </form>

                <div className="p-4 text-center border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>© 2026 Octopus ERP — Falcón, Venezuela</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
