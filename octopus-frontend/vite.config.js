import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registro manual desde useWebPush.js (virtual:pwa-register)
      // El manifest NO sale del build: lo genera el backend con el nombre,
      // color e ícono de cada colegio (/api/portal/manifest.webmanifest) y se
      // enlaza en runtime desde src/portal/utils/instalarApp.js.
      manifest: false,
      workbox: {
        // Handlers de 'push'/'notificationclick' (public/push-sw.js): generateSW
        // no los incluye, sin esto el push llega pero no se muestra.
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        // Imágenes de perfil/logo del colegio (ej. favicon.png fuente, logos
        // subidos) pueden pesar varios MB -- se sirven vía runtime caching
        // (regla de imágenes abajo) en vez de precachearse en la instalación.
        globIgnores: ['**/*.png'],
        navigateFallbackDenylist: [/^\/admin/, /^\/api/],
        runtimeCaching: [
          {
            // Datos del portal: siempre intentar red primero, cache como respaldo offline.
            urlPattern: /\/api\/portal\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'portal-api-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'portal-images-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
