import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';

// When building for Capacitor (Android/iOS), set CAPACITOR=true
// e.g.  cross-env CAPACITOR=true vite build
const isCapacitor = process.env.CAPACITOR === 'true';

export default defineConfig({
  // Capacitor serves from capacitor://localhost — must use relative paths
  base: isCapacitor
    ? './'
    : process.env.GITHUB_ACTIONS ? '/pdf-reader-pro/' : '/',

  plugins: [
    react(),

    // Always copy CMap files so PDF text renders correctly offline
    // (replaces the CDN URL in src/utils/pdf.ts → local cmaps/ folder)
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'cmaps',
        },
      ],
    }),

    // PWA service worker only for web builds — not needed inside an APK
    ...(!isCapacitor ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'PDF Reader Pro',
        short_name: 'PDF Reader',
        description: 'Professional PDF reader, annotator, and document manager',
        theme_color: '#6366f1',
        background_color: '#0f0f14',
        display: 'standalone',
        orientation: 'any',
        categories: ['productivity', 'education', 'utilities'],
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    })] : []),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  optimizeDeps: {
    include: ['pdfjs-dist'],
  },

  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-worker': ['pdfjs-dist'],
        },
      },
    },
  },
});
