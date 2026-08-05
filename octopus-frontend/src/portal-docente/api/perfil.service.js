import docenteApiClient from './docenteApiClient';

// Perfil del docente
export const getMiPerfil = (signal) =>
  docenteApiClient.get('academico/docente/mi-perfil/', signal ? { signal } : undefined);

export const actualizarMiPerfil = (datos, signal) =>
  docenteApiClient.patch('academico/docente/mi-perfil/', datos, signal ? { signal } : undefined);

export const subirFotoPerfil = (file, signal) => {
  const formData = new FormData();
  formData.append('foto', file);
  return docenteApiClient.post('academico/docente/mi-perfil/foto/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  });
};
