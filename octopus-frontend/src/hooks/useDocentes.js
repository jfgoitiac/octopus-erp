import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';

// Catálogo de docentes activos — usado por selects que asignan un docente
// a una materia (ver ModalMateria). Se filtra client-side por perfil.rol
// porque el endpoint de usuarios no expone un filtro de rol por querystring.
export function useDocentes() {
  const [docentes, setDocentes]         = useState([]);
  const [loadingDocentes, setLoadingDocentes] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setLoadingDocentes(true);
    apiClient.get('authentication/users/', { signal: controller.signal })
      .then(res => {
        const soloDocentes = (res.data || []).filter(
          (u) => u.perfil?.rol === 'docente' && u.perfil?.esta_activo !== false
        );
        setDocentes(soloDocentes);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar la lista de docentes.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDocentes(false);
      });

    return () => controller.abort();
  }, []);

  return { docentes, loadingDocentes };
}
