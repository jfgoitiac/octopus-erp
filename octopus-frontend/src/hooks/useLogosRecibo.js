import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { invalidateLogosInstitucionalesCache } from '../utils/logosInstitucionales';

const FIELD_MAP = { logoColegio: 'logo_colegio', logoAvec: 'logo_avec' };
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

// Los logos (colegio y AVEC) viven en el backend (ConfiguracionSistema),
// no en localStorage — así están disponibles desde cualquier dispositivo.
export function useLogosRecibo(config, fetchConfig) {
    const [showLogosModal, setShowLogosModal] = useState(false);
    const [logosForm, setLogosForm] = useState({ logoColegio: null, logoAvec: null });
    const [savingLogos, setSavingLogos] = useState(false);
    const migracionEjecutada = useRef(false);

    const logosRecibo = {
        logoColegio: config?.logo_colegio || null,
        logoAvec: config?.logo_avec || null,
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
        const necesitaAvec = !!stored.logoAvec && !config.logo_avec;
        if (!necesitaColegio && !necesitaAvec) {
            if (stored.logoColegio || stored.logoAvec) localStorage.removeItem(LEGACY_KEY);
            return;
        }
        (async () => {
            try {
                const formData = new FormData();
                if (necesitaColegio) formData.append('logo_colegio', dataUriToBlob(stored.logoColegio), 'logo_colegio.png');
                if (necesitaAvec) formData.append('logo_avec', dataUriToBlob(stored.logoAvec), 'logo_avec.png');
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
    }, [config?.id, config?.logo_colegio, config?.logo_avec, fetchConfig]);

    const openLogosModal = () => {
        setLogosForm({ ...logosRecibo });
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
            if (!hayCambios) {
                setShowLogosModal(false);
                return;
            }
            await axiosInstance.post('secretaria/configuracion/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            invalidateLogosInstitucionalesCache();
            await fetchConfig();
            setShowLogosModal(false);
            toast.success("Logos del recibo actualizados.");
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || "No se pudieron guardar los logos.");
        } finally {
            setSavingLogos(false);
        }
    };

    return {
        logosRecibo, showLogosModal, setShowLogosModal,
        logosForm: {
            logoColegio: logosForm.logoColegio === 'REMOVE' ? null : (logosForm.logoColegio?.preview ?? logosRecibo.logoColegio),
            logoAvec: logosForm.logoAvec === 'REMOVE' ? null : (logosForm.logoAvec?.preview ?? logosRecibo.logoAvec),
        },
        openLogosModal, handleLogosUpload, handleRemoveLogo, handleSaveLogos, savingLogos,
    };
}
