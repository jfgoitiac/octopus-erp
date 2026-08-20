import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Puerto fijo 5174 (default de Vite es 5173, igual que octopus-frontend) —
  // para poder correr ambos dev servers a la vez y usar el botón "Vista
  // previa" del panel admin (VITE_SITIO_URL=http://localhost:5174 en
  // octopus-frontend/.env) sin colisión de puertos.
  server: { port: 5174 },
})
