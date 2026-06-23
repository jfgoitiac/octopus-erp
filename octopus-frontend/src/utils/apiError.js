export function parseApiError(err) {
    const data = err.response?.data;
    if (!data) return 'Error de conexión.';
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    if (typeof data === 'object') {
        return Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`)
            .join(' | ');
    }
    return 'Error inesperado.';
}
