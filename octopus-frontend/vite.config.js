import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // Las pruebas de pantalla (e2e/) las corre Playwright, no Vitest.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
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
        // El precache anterior descargaba todos los chunks de todas las áreas
        // (~6 MB) durante la primera visita. Solo se precachea el shell; los
        // chunks realmente usados se guardan al navegar mediante la regla de
        // assets de abajo.
        globPatterns: ['index.html', '**/*.{ico,svg}'],
        // Imágenes de perfil/logo del colegio (ej. favicon.png fuente, logos
        // subidos) pueden pesar varios MB -- se sirven vía runtime caching
        // (regla de imágenes abajo) en vez de precachearse en la instalación.
        globIgnores: ['**/*.png'],
        navigateFallbackDenylist: [/^\/admin/, /^\/api/],
        runtimeCaching: [
          {
            // Configuración pública de marca. Las respuestas autenticadas NO
            // se guardan en Cache Storage porque la clave de caché por URL no
            // separa representantes en un dispositivo compartido.
            urlPattern: /\/api\/portal\/config-colegio\/?(?:\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'portal-public-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets-on-demand',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
