import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const compressImage = (dataUrl, maxSize = 180) => new Promise(resolve => {
    const img = new window.Image();
    img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
});

export function useLogosRecibo() {
    const [logosRecibo, setLogosRecibo] = useState({ logoColegio: null, logoAvec: null });
    const [showLogosModal, setShowLogosModal] = useState(false);
    const [logosForm, setLogosForm] = useState({ logoColegio: null, logoAvec: null });

    useEffect(() => {
        try {
            const stored = localStorage.getItem('octopus_logos_recibo');
            if (stored) setLogosRecibo(JSON.parse(stored));
        } catch {}
    }, []);

    const openLogosModal = () => {
        setLogosForm({ ...logosRecibo });
        setShowLogosModal(true);
    };

    const handleLogosUpload = (field, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            const compressed = await compressImage(ev.target.result);
            setLogosForm(p => ({ ...p, [field]: compressed }));
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveLogo = (field) => {
        setLogosForm(p => ({ ...p, [field]: null }));
    };

    const handleSaveLogos = () => {
        try {
            localStorage.setItem('octopus_logos_recibo', JSON.stringify(logosForm));
            setLogosRecibo({ ...logosForm });
            setShowLogosModal(false);
            toast.success("Logos del recibo actualizados.");
        } catch {
            toast.error("No se pudieron guardar los logos. Intente con imágenes de menor resolución.");
        }
    };

    return {
        logosRecibo, showLogosModal, setShowLogosModal, logosForm,
        openLogosModal, handleLogosUpload, handleRemoveLogo, handleSaveLogos,
    };
}
