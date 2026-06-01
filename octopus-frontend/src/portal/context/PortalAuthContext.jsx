import { createContext, useState, useEffect, useContext } from 'react';
import { jwtDecode } from 'jwt-decode';
import portalClient from '../api/portalClient';

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

  useEffect(() => {
    const token = localStorage.getItem('portal_token');
    if (token) {
      const userData = extractUserData(token);
      if (userData) {
        setUser(userData);
      } else {
        localStorage.removeItem('portal_token');
        localStorage.removeItem('portal_refresh_token');
      }
    }
    setLoading(false);
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
    const { access, refresh, representante_id, nombre, apellido } = res.data;
    localStorage.setItem('portal_token', access);
    localStorage.setItem('portal_refresh_token', refresh);
    setUser({ representante_id, nombre, apellido });
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
