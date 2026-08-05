import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import portalDocenteClient from '../api/portalDocenteClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export const DocenteAuthContext = createContext(null);

export const DocenteAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = Boolean(user);

  const extractUserData = (token) => {
    try {
      const decoded = jwtDecode(token);
      const isExpired = decoded.exp && decoded.exp * 1000 <= Date.now();
      if (isExpired) return null;

      return {
        docente_id: decoded.docente_id || null,
        nombre: decoded.nombre || 'Docente',
        username: decoded.username || '',
        rol: decoded.rol || 'docente',
      };
    } catch {
      return null;
    }
  };

  // Al montar: intenta restaurar sesión.
  // Si el access token está vigente lo usa directamente.
  // Si está expirado pero hay refresh token, intenta un silent refresh antes de cerrar sesión.
  useEffect(() => {
    const silentRefresh = async () => {
      const token        = localStorage.getItem('docente_token');
      const refreshToken = localStorage.getItem('docente_refresh_token');

      if (token) {
        const userData = extractUserData(token);
        if (userData) {
          setUser(userData);
          setLoading(false);
          return;
        }
      }

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/api/portal-docente/token/refresh/`, {
            refresh: refreshToken,
          });
          const newAccessToken = res.data.access;
          localStorage.setItem('docente_token', newAccessToken);
          const userData = extractUserData(newAccessToken);
          if (userData) setUser(userData);
        } catch {
          // Refresh expirado o inválido — fuerza re-login
          localStorage.removeItem('docente_token');
          localStorage.removeItem('docente_refresh_token');
        }
      }

      setLoading(false);
    };

    silentRefresh();
  }, []);

  /**
   * Login del docente.
   * @param {string} username
   * @param {string} password
   */
  const login = async (username, password) => {
    // NOTA: shape de respuesta asumido como { access, refresh, rol, nombre, username }
    // según lo indicado en la tarea — confirmar con backend si difiere.
    const res = await portalDocenteClient.post('login/', {
      username,
      password,
    });
    const { access, refresh } = res.data;
    localStorage.setItem('docente_token', access);
    localStorage.setItem('docente_refresh_token', refresh);
    const userData = extractUserData(access);
    if (!userData) throw new Error('Token inválido recibido del servidor');
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('docente_token');
    localStorage.removeItem('docente_refresh_token');
    setUser(null);
  };

  return (
    <DocenteAuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
      {children}
    </DocenteAuthContext.Provider>
  );
};

export const useDocenteAuth = () => useContext(DocenteAuthContext);
