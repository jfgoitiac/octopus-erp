import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { listarDocentes } from '../api/academico.service';

// Catálogo de docentes activos — usado por selects que asignan un docente
// a una materia (ver ModalMateria). Cada item trae user_id (el id que se
// guarda en Materia.docente) además del id propio del registro Docente.
export function useDocentes() {
  const [docentes, setDocentes]         = useState([]);
  const [loadingDocentes, setLoadingDocentes] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setLoadingDocentes(true);
    listarDocentes({ activo: 'true' }, controller.signal)
      .then(res => {
        setDocentes(res.data || []);
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
