import axiosInstance from "./apiClient";

export const getDashboardStats = async () => {
    // Estos endpoints deben existir en tu Django (urls.py)
    const response = await axiosInstance.get('cobranza/stats/');
    return response.data;
};