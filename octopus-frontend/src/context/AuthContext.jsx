import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import axiosInstance from '../api/apiClient';
import { AuthContext } from './AuthContextValue';
export { AuthContext } from './AuthContextValue';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const isAuthenticated = Boolean(user);

    const extractUserData = (token) => {
        try {
            const decoded = jwtDecode(token);
            const isExpired = decoded.exp && decoded.exp * 1000 <= Date.now();
            if (isExpired) return null;
            
            // Normalizamos el objeto de usuario
            return { 
                username: decoded.username || 'Usuario', 
                rol: decoded.rol || 'cajero' 
            };
        } catch (error) {
            console.error("Error decodificando token:", error);
            return null;
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            const userData = extractUserData(token);
            if (userData) {
                setUser(userData);
            } else {
                localStorage.clear();
            }
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        try {
            const res = await axiosInstance.post('token/', { username, password });
            localStorage.setItem('access_token', res.data.access);
            localStorage.setItem('refresh_token', res.data.refresh);
            
            // Intentamos sacar el rol del token recién generado
            const userData = extractUserData(res.data.access);
            setUser(userData);
        } catch (error) {
            throw error;
        }
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
            {children}
        </AuthContext.Provider>
    );
};
