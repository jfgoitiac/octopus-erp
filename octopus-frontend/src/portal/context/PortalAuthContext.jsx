import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import portalClient from '../api/portalClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export const PortalAuthContext = createContext(null);

export const PortalAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = Boolean(user);

  const extractUserData = (token) => {
    try {
      const decoded = jwtDecode(token);
      const isExpired = decoded.exp && decoded.exp * 1000 <= Date.now();
      if (isExpired) return null;

      return {
        representante_id: decoded.representante_id || null,
        nombre: decoded.nombre || 'Representante',
        apellido: decoded.apellido || '',
        cedula: decoded.cedula || '',
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
      const token        = localStorage.getItem('portal_token');
      const refreshToken = localStorage.getItem('portal_refresh_token');

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
          const res = await axios.post(`${API_BASE}/api/portal/token/refresh/`, {
            refresh: refreshToken,
          });
          const newAccessToken = res.data.access;
          localStorage.setItem('portal_token', newAccessToken);
          const userData = extractUserData(newAccessToken);
          if (userData) setUser(userData);
        } catch {
          // Refresh expirado o inválido — fuerza re-login
          localStorage.removeItem('portal_token');
          localStorage.removeItem('portal_refresh_token');
        }
      }

      setLoading(false);
    };

    silentRefresh();
  }, []);

  /**
   * Login del representante.
   * @param {string} cedulaOEmail
   * @param {string} password
   */
  const login = async (cedulaOEmail, password) => {
    const res = await portalClient.post('token/', {
      cedula_o_email: cedulaOEmail,
      contrasena: password,
    });
    const { access, refresh } = res.data;
    localStorage.setItem('portal_token', access);
    localStorage.setItem('portal_refresh_token', refresh);
    const userData = extractUserData(access);
    if (!userData) throw new Error('Token inválido recibido del servidor');
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_refresh_token');
    setUser(null);
  };

  return (
    <PortalAuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
      {children}
    </PortalAuthContext.Provider>
  );
};

export const usePortalAuth = () => useContext(PortalAuthContext);
