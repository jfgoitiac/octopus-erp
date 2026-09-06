import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { invalidateLogosInstitucionalesCache } from '../utils/logosInstitucionales';

const FIELD_MAP = { logoColegio: 'logo_colegio', encabezadoPersonalizado: 'encabezado_personalizado', piePaginaPersonalizado: 'pie_pagina_personalizado' };
const MAX_SIZE = 2 * 1024 * 1024;
const LEGACY_KEY = 'octopus_logos_recibo';

const dataUriToBlob = (dataUri) => {
    const [meta, base64] = dataUri.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/png';
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: mime });
};

// El logo del colegio vive en el backend (ConfiguracionSistema), no en
// localStorage — así está disponible desde cualquier dispositivo. Es el
// mismo logo que se usa en recibos, favicon/ícono de la app, páginas de
// login y el logo lateral junto al nombre del colegio (BrandingContext).
export function useLogosRecibo(config, fetchConfig, refreshBranding) {
    const [showLogosModal, setShowLogosModal] = useState(false);
    const [logosForm, setLogosForm] = useState({ logoColegio: null, encabezadoPersonalizado: null, piePaginaPersonalizado: null });
    const [afiliacionNombreForm, setAfiliacionNombreForm] = useState('');
    const [savingLogos, setSavingLogos] = useState(false);
    const migracionEjecutada = useRef(false);

    const logosRecibo = {
        logoColegio: config?.logo_colegio || null,
        encabezadoPersonalizado: config?.encabezado_personalizado || null,
        piePaginaPersonalizado: config?.pie_pagina_personalizado || null,
    };

    // Migración one-shot: si este navegador tenía logos guardados en localStorage
    // (versión previa, por-dispositivo) y el backend todavía no tiene logos propios,
    // los sube automáticamente para que queden disponibles en todos los dispositivos.
    useEffect(() => {
        if (migracionEjecutada.current || !config?.id) return;
        migracionEjecutada.current = true;
        let stored;
        try { stored = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}'); } catch { stored = {}; }
        const necesitaColegio = !!stored.logoColegio && !config.logo_colegio;
        if (!necesitaColegio) {
            if (stored.logoColegio || stored.logoAvec) localStorage.removeItem(LEGACY_KEY);
            return;
        }
        (async () => {
            try {
                const formData = new FormData();
                formData.append('logo_colegio', dataUriToBlob(stored.logoColegio), 'logo_colegio.png');
                await axiosInstance.post('secretaria/configuracion/', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                invalidateLogosInstitucionalesCache();
                await fetchConfig();
                toast.info("Logos migrados: ahora se ven desde cualquier dispositivo.");
            } catch {
                // Si falla, se reintenta en la próxima carga (no se borra localStorage).
                return;
            }
            localStorage.removeItem(LEGACY_KEY);
        })();
    }, [config?.id, config?.logo_colegio, fetchConfig]);

    const openLogosModal = () => {
        setLogosForm({ ...logosRecibo });
        setAfiliacionNombreForm(config?.afiliacion_nombre || '');
        setShowLogosModal(true);
    };

    const handleLogosUpload = (field, e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > MAX_SIZE) {
            toast.error("La imagen no debe superar 2MB.");
            return;
        }
        setLogosForm(p => ({ ...p, [field]: { file, preview: URL.createObjectURL(file) } }));
    };

    // El recorte de encabezado_personalizado / pie_pagina_personalizado exporta
    // directamente un Blob PNG ya recortado a su proporción fija, no viene de
    // un <input type=file>.
    const handleImagenRecortada = (campo, blob) => {
        const file = new File([blob], `${FIELD_MAP[campo]}.png`, { type: 'image/png' });
        setLogosForm(p => ({ ...p, [campo]: { file, preview: URL.createObjectURL(blob) } }));
    };

    const handleRemoveLogo = (field) => {
        setLogosForm(p => ({ ...p, [field]: 'REMOVE' }));
    };

    const handleSaveLogos = async () => {
        setSavingLogos(true);
        try {
            const formData = new FormData();
            let hayCambios = false;
            for (const [field, backendField] of Object.entries(FIELD_MAP)) {
                const value = logosForm[field];
                if (value === 'REMOVE') {
                    formData.append(`${backendField}_clear`, 'true');
                    hayCambios = true;
                } else if (value?.file) {
                    formData.append(backendField, value.file);
                    hayCambios = true;
                }
            }
            if (afiliacionNombreForm !== (config?.afiliacion_nombre || '')) {
                formData.append('afiliacion_nombre', afiliacionNombreForm);
                hayCambios = true;
            }
            if (!hayCambios) {
                setShowLogosModal(false);
                return;
            }
            await axiosInstance.post('secretaria/configuracion/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            invalidateLogosInstitucionalesCache();
            await fetchConfig();
            refreshBranding?.();
            setShowLogosModal(false);
            toast.success("Logos del recibo actualizados.");
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || "No se pudieron guardar los logos.");
        } finally {
            setSavingLogos(false);
        }
    };

    const logosFormResuelto = Object.fromEntries(
        Object.keys(FIELD_MAP).map(campo => [
            campo,
            logosForm[campo] === 'REMOVE' ? null : (logosForm[campo]?.preview ?? logosRecibo[campo]),
        ])
    );

    return {
        logosRecibo, showLogosModal, setShowLogosModal,
        logosForm: logosFormResuelto,
        afiliacionNombreForm, setAfiliacionNombreForm,
        openLogosModal, handleLogosUpload, handleImagenRecortada, handleRemoveLogo, handleSaveLogos, savingLogos,
    };
}
