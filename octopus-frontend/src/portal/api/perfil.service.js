import portalClient from './portalClient';

// Perfil del representante
export const getMiPerfil = (signal) =>
  portalClient.get('mi-perfil/', signal ? { signal } : undefined);

export const actualizarMiPerfil = (datos, signal) =>
  portalClient.patch('mi-perfil/', datos, signal ? { signal } : undefined);

export const subirFotoPerfil = (file, signal) => {
  const formData = new FormData();
  formData.append('foto', file);
  return portalClient.post('mi-perfil/foto/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  });
};
