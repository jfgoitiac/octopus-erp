import { defineConfig } from '@playwright/test';

// Pruebas de pantalla en los 4 tamaños de referencia del ESTÁNDAR DE DISEÑO
// RESPONSIVE (CLAUDE.md). La API se simula en el mismo origen (/mock-api)
// dentro de cada prueba: no hace falta backend ni credenciales reales.
const PORT = 5179;

const touch = { isMobile: false, hasTouch: true };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular-360x640',     use: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, ...touch } },
    { name: 'tablet-768x1024',     use: { viewport: { width: 768, height: 1024 }, ...touch } },
    { name: 'laptop-1366x768',     use: { viewport: { width: 1366, height: 768 } } },
    { name: 'escritorio-1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_API_BASE_URL: `http://localhost:${PORT}/mock-api` },
  },
});
