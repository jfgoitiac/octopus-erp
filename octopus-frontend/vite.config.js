import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registro manual desde useWebPush.js (virtual:pwa-register)
      manifest: {
        name: 'Octopus — Portal Educativo',
        short_name: 'Octopus',
        description: 'Portal de representantes — saldo, pagos, comunicaciones y rendimiento académico.',
        start_url: '/portal',
        scope: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#0fa3b1',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
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
