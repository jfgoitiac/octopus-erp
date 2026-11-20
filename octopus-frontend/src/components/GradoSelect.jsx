import { useEffect, useState } from 'react';
import axiosInstance from '../api/apiClient';
import { getGradosSecciones } from '../api/academico.service';

const GradoSelect = ({
  value,
  onChange,
  className,
  style,
  incluirVacio = false,
  etiquetaVacio = 'Seleccionar grado...',
  normalizado = false,
  filtros,
  onGradoSeleccionado,
  ...rest
}) => {
  const [grados, setGrados] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    const solicitud = normalizado
      ? getGradosSecciones(filtros, controller.signal)
      : axiosInstance.get('secretaria/configuracion-grados/', { signal: controller.signal });
    solicitud
      .then(res => setGrados(res?.data?.results || res?.data || []))
      .catch(err => {
        if (err.name !== 'CanceledError') setGrados([]);
      });
    return () => controller.abort();
  }, [normalizado, filtros]);

  const handleChange = (event) => {
    onChange?.(event);
    const grado = grados.find(item => String(normalizado ? item.id : item.grado_seccion) === event.target.value) || null;
    onGradoSeleccionado?.(grado);
  };

  return (
    <select value={value || ''} onChange={handleChange} className={className} style={style} {...rest}>
      {incluirVacio && <option value="">{etiquetaVacio}</option>}
      {grados.map(g => (
        <option key={g.id} value={normalizado ? g.id : g.grado_seccion}>{g.nombre || g.grado_seccion}</option>
      ))}
    </select>
  );
};

export default GradoSelect;
