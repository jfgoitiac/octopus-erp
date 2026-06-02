import axiosInstance from "./apiClient";

export const getDashboardStats = async (signal) => {
    const response = await axiosInstance.get('cobranza/stats/', { signal });
    return response.data;
};
