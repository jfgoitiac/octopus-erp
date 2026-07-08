import { useEffect, useState } from 'react';
import axiosInstance from '../api/apiClient';

const GradoSelect = ({ value, onChange, className, style, incluirVacio = false, ...rest }) => {
  const [grados, setGrados] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    axiosInstance
      .get('secretaria/configuracion-grados/', { signal: controller.signal })
      .then(res => setGrados(res?.data || []))
      .catch(err => {
        if (err.name !== 'CanceledError') setGrados([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <select value={value || ''} onChange={onChange} className={className} style={style} {...rest}>
      {incluirVacio && <option value="">Seleccionar grado...</option>}
      {grados.map(g => (
        <option key={g.id} value={g.grado_seccion}>{g.grado_seccion}</option>
      ))}
    </select>
  );
};

export default GradoSelect;
