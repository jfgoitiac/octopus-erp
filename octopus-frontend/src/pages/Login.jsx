import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, Octagon, AlertCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        // Lógica de negocio, no se modifica
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await login(username, password);
            navigate('/'); // Si todo sale bien, vamos al panel principal
        } catch {
            setError("Credenciales incorrectas o problema de conexión con el servidor.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
            {/* CORRECCIÓN 7: Card principal */}
            <div className="max-w-md w-full rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {/* Encabezado con Identidad Visual */}
                <div className="p-8 text-center" style={{ background: 'var(--jet)' }}>
                    <div className="inline-flex p-3 rounded-xl backdrop-blur-sm mb-4" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <Octagon size={48} style={{ color: 'var(--pb)' }} />
                    </div>
                    <h1 className="text-xl font-medium text-white">Octopus ERP</h1>
                    <p className="text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--ash)' }}>Gestión Escolar</p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* CORRECCIÓN 10: Alerta de error */}
                    {error && (
                        <div className="p-3 rounded-xl flex items-start gap-2 text-sm"
                             style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </div>
                    )}

                    <div>
                        {/* CORRECCIÓN 2: Label estándar */}
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Usuario</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={16} />
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 pl-9 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                placeholder="jperez"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        {/* CORRECCIÓN 2: Label estándar */}
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={16} />
                            <input 
                                type="password" 
                                className="w-full px-3 py-2 pl-9 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* CORRECCIÓN 3: Botón primario */}
                    <button type="submit" disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Entrar al Sistema'}
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