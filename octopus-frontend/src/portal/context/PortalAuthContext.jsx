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
  // Si está expirado (o no existe), intenta un silent refresh: el refresh
  // token ya no vive en localStorage, viaja solo en la cookie HttpOnly
  // `portal_refresh_token` que el navegador adjunta solo (withCredentials).
  useEffect(() => {
    const silentRefresh = async () => {
      const token = localStorage.getItem('portal_token');

      if (token) {
        const userData = extractUserData(token);
        if (userData) {
          setUser(userData);
          setLoading(false);
          return;
        }
      }

      // PortalAuthProvider envuelve toda la app (ver AppProviders.jsx), no
      // solo /portal — sin este filtro, cada carga del panel admin dispara
      // un refresh contra un endpoint del portal de representantes cuya
      // cookie httpOnly no existe ahí, generando un 401 inevitable en cada
      // ruta ajena al portal.
      if (!window.location.pathname.startsWith('/portal')) {
        setLoading(false);
        return;
      }

      try {
        const res = await axios.post(
          `${API_BASE}/api/portal/token/refresh/`,
          {},
          { withCredentials: true }
        );
        const newAccessToken = res.data.access;
        localStorage.setItem('portal_token', newAccessToken);
        const userData = extractUserData(newAccessToken);
        if (userData) setUser(userData);
      } catch {
        // Refresh expirado, inválido o cookie inexistente — fuerza re-login
        localStorage.removeItem('portal_token');
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
    // El refresh token ya no viene en el body: el backend lo setea directo
    // en la cookie HttpOnly `portal_refresh_token` (ver portal/views.py).
    const { access, debe_cambiar_password } = res.data;
    localStorage.setItem('portal_token', access);
    const userData = extractUserData(access);
    if (!userData) throw new Error('Token inválido recibido del servidor');
    setUser(userData);
    return { debeCambiarPassword: Boolean(debe_cambiar_password) };
  };

  const logout = () => {
    // Best-effort: invalida (blacklist) el refresh y borra la cookie en el
    // backend. No se espera la respuesta para no bloquear el logout local
    // si la red falla — el estado del cliente se limpia de todas formas.
    portalClient.post('logout/').catch(() => {});
    localStorage.removeItem('portal_token');
    setUser(null);
  };

  return (
    <PortalAuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
      {children}
    </PortalAuthContext.Provider>
  );
};

export const usePortalAuth = () => useContext(PortalAuthContext);
