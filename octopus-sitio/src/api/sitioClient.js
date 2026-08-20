import axios from 'axios';

// La URL base de la API viene de una variable de entorno Vite.
// En desarrollo: VITE_API_BASE_URL=http://127.0.0.1:8000
// En producción: VITE_API_BASE_URL=https://api.micolegio.edu.ve
// Endpoints públicos del sitio (AllowAny) — ver SITIO_CONTRATO_API.md sección 3.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const sitioClient = axios.create({
  baseURL: `${API_BASE}/api/sitio/`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

export default sitioClient;
