import { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

export const SedeContext = createContext(null);

export const SedeProvider = ({ children }) => {
  const [sedeActiva, setSedeActiva] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [loadingSedes, setLoadingSedes] = useState(false);

  const cargarSedes = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoadingSedes(true);
    try {
      const res = await apiClient.get('multisede/sedes/');
      const lista = Array.isArray(res.data)
        ? res.data
        : (res.data?.results || []);
      setSedes(lista);

      // Restaurar sede activa guardada
      const savedId = localStorage.getItem('sede_activa_id');
      if (savedId) {
        const encontrada = lista.find(s => String(s.id) === String(savedId));
        if (encontrada) setSedeActiva(encontrada);
      }
    } catch {
      // 403/401 = usuario sin sedes multi, no es error crítico
      setSedes([]);
    } finally {
      setLoadingSedes(false);
    }
  };

  useEffect(() => {
    cargarSedes();
    // Re-cargar si el token cambia (login/logout en otra pestaña)
    const handleStorage = (e) => {
      if (e.key === 'access_token') {
        if (e.newValue) cargarSedes();
        else { setSedes([]); setSedeActiva(null); }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const cambiarSede = (sede) => {
    setSedeActiva(sede);
    if (sede) localStorage.setItem('sede_activa_id', String(sede.id));
    else localStorage.removeItem('sede_activa_id');
  };

  const limpiarSedes = () => {
    setSedes([]);
    setSedeActiva(null);
    localStorage.removeItem('sede_activa_id');
  };

  return (
    <SedeContext.Provider value={{
      sedeActiva, sedes, setSedes,
      cambiarSede, loadingSedes,
      cargarSedes, limpiarSedes,
    }}>
      {children}
    </SedeContext.Provider>
  );
};

export const useSede = () => useContext(SedeContext);
