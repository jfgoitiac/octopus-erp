import axiosInstance from "./apiClient";

export const getInscripcionesStats = async (signal, periodo) => {
    const response = await axiosInstance.get('secretaria/inscripciones/stats/', {
        signal,
        params: periodo ? { periodo } : {},
    });
    return response.data;
};
