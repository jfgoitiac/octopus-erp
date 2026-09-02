import { useState } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const MAX_SIZE = 512 * 1024;
const FORMATOS_VALIDOS = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml', 'image/webp'];

// Favicon del sitio (ConfiguracionSistema.favicon) — mismo patrón FormData +
// flag "_clear" que useLogosRecibo.js, pero como campo independiente (no es
// un logo de recibo, es la identidad de pestaña/navegador del sitio).
export function useFaviconSitio(config, fetchConfig, refreshBranding) {
    const [faviconForm, setFaviconForm] = useState(null); // null = sin cambios; { file, preview } | 'REMOVE'
    const [savingFavicon, setSavingFavicon] = useState(false);

    const faviconPreview = faviconForm === 'REMOVE'
        ? null
        : (faviconForm?.preview ?? config?.favicon ?? null);

    const handleFaviconUpload = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > MAX_SIZE) {
            toast.error('El favicon no debe superar 512KB.');
            return;
        }
        if (!FORMATOS_VALIDOS.includes(file.type)) {
            toast.error('Formato no soportado. Use PNG, ICO, SVG o WEBP.');
            return;
        }
        setFaviconForm({ file, preview: URL.createObjectURL(file) });
    };

    const handleRemoveFavicon = () => setFaviconForm('REMOVE');

    const handleSaveFavicon = async () => {
        if (faviconForm === null) return true; // sin cambios pendientes
        setSavingFavicon(true);
        try {
            const formData = new FormData();
            if (faviconForm === 'REMOVE') {
                formData.append('favicon_clear', 'true');
            } else {
                formData.append('favicon', faviconForm.file);
            }
            await axiosInstance.post('secretaria/configuracion/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await fetchConfig();
            refreshBranding?.();
            setFaviconForm(null);
            toast.success('Favicon actualizado.');
            return true;
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'No se pudo guardar el favicon.');
            return false;
        } finally {
            setSavingFavicon(false);
        }
    };

    return { faviconPreview, handleFaviconUpload, handleRemoveFavicon, handleSaveFavicon, savingFavicon };
}
