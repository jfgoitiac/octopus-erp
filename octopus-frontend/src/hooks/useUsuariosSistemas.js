import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import axiosInstance from '../api/apiClient';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useUsuariosSistemas() {
    const [usuarios,   setUsuarios]   = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [backingUp,  setBackingUp]  = useState(false);
    const [syncingBCV, setSyncingBCV] = useState(false);

    const fetchUsers = useCallback(async (signal) => {
        setLoadingUsers(true);
        try {
            const res = await axiosInstance.get('authentication/users/', { signal });
            setUsuarios(res.data);
        } catch (err) {
            if (err.name === 'CanceledError') return;
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al cargar usuarios');
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    // Returns true on success so callers (modals) can close themselves.
    const createUser = useCallback(async (payload) => {
        if (!EMAIL_REGEX.test(payload.email)) {
            toast.error('Por favor, ingresa un correo electrónico válido (ejemplo@dominio.com).');
            return false;
        }
        if (payload.password.length < 8) {
            toast.error('La contraseña debe tener al menos 8 caracteres.');
            return false;
        }
        try {
            await axiosInstance.post('authentication/users/', payload);
            toast.success('Usuario creado exitosamente');
            await fetchUsers();
            return true;
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al crear el usuario');
            return false;
        }
    }, [fetchUsers]);

    const deleteUser = useCallback(async (userId) => {
        try {
            await axiosInstance.delete(`authentication/users/${userId}/`);
            toast.success('Usuario eliminado correctamente');
            setUsuarios(prev => prev.filter(u => u.id !== userId));
            return true;
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al eliminar el usuario');
            return false;
        }
    }, []);

    const editRol = useCallback(async (userId, newRol) => {
        try {
            await axiosInstance.patch(`authentication/users/${userId}/`, { rol: newRol });
            toast.success('Rol actualizado correctamente');
            await fetchUsers();
            return true;
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al actualizar el rol');
            return false;
        }
    }, [fetchUsers]);

    const resetPassword = useCallback(async (userId, newPassword) => {
        if (newPassword.length < 8) {
            toast.error('La contraseña debe tener al menos 8 caracteres.');
            return false;
        }
        try {
            await axiosInstance.post(`authentication/users/${userId}/reset_password/`, {
                new_password: newPassword,
            });
            toast.success('Contraseña restablecida con éxito');
            return true;
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al resetear contraseña');
            return false;
        }
    }, []);

    const downloadBackup = useCallback(async () => {
        setBackingUp(true);
        try {
            const res = await axiosInstance.post('authentication/users/backup/', {}, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `backup_octopus_${format(new Date(), 'yyyy-MM-dd')}.sql`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al generar el respaldo');
        } finally {
            setBackingUp(false);
        }
    }, []);

    const syncBCV = useCallback(async () => {
        setSyncingBCV(true);
        try {
            await toast.promise(
                axiosInstance.post('cobranza/sincronizar-tasa/', {}),
                {
                    pending: 'Sincronizando tasa BCV...',
                    success: { render: ({ data }) => `Tasa actualizada a Bs. ${data.data.valor}` },
                    error:   { render: ({ data }) => data?.response?.data?.error || data?.response?.data?.detail || 'No se pudo sincronizar la tasa cambiaria' },
                }
            );
        } finally {
            setSyncingBCV(false);
        }
    }, []);

    return {
        usuarios,
        loadingUsers,
        backingUp,
        syncingBCV,
        fetchUsers,
        createUser,
        deleteUser,
        editRol,
        resetPassword,
        downloadBackup,
        syncBCV,
    };
}
