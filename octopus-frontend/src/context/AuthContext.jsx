import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import axiosInstance from '../api/apiClient';
import { tokenStore } from '../api/tokenStore';
import { AuthContext } from './AuthContextValue';
export { AuthContext } from './AuthContextValue';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const extractUserData = (token) => {
    try {
        // NOTA: jwtDecode solo decodifica — la verificacion de firma ocurre en el backend.
        // Esta funcion es solo para extraer datos de UI del access token valido.
        const decoded = jwtDecode(token);
        const isExpired = decoded.exp && decoded.exp * 1000 <= Date.now();
        if (isExpired) return null;
        return {
            username: decoded.username || 'Usuario',
            rol: decoded.rol || 'cajero',
        };
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);
    const isAuthenticated = Boolean(user);

    // Al montar: intenta restaurar sesion via refresh token en cookie HttpOnly.
    // Si la cookie es valida, el backend devuelve un nuevo access token.
    useEffect(() => {
        const silentRefresh = async () => {
            try {
                const res = await axios.post(
                    `${API_BASE}/api/token/refresh/`,
                    {},
                    { withCredentials: true }
                );
                const token = res.data.access;
                tokenStore.set(token);
                const userData = extractUserData(token);
                if (userData) setUser(userData);
            } catch {
                // Cookie invalida o expirada — el usuario debera iniciar sesion
            } finally {
                setLoading(false);
            }
        };
        silentRefresh();
    }, []);

    const login = async (username, password) => {
        const res = await axiosInstance.post('token/', { username, password });
        // El refresh token llega como cookie HttpOnly — el backend ya la establecio.
        // Aqui solo manejamos el access token (memoria unicamente).
        const token = res.data.access;
        tokenStore.set(token);
        const userData = extractUserData(token);
        if (!userData) throw new Error('Token invalido recibido del servidor');
        setUser(userData);
    };

    const logout = () => {
        tokenStore.clear();
        setUser(null);
        // Opcional: llamar al backend para invalidar el refresh token si se implementa blacklisting
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};
