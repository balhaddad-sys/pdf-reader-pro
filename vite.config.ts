import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config(); // load .env

// When building for Capacitor (Android/iOS), set CAPACITOR=true
// e.g.  cross-env CAPACITOR=true vite build
const isCapacitor = process.env.CAPACITOR === 'true';

/** Dev-only plugin that mirrors api/chat.ts so `npm run dev` works without Vercel CLI */
function apiProxy(): Plugin {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-sonnet-4-6';
  const SYSTEM_PROMPT = [
    'You are a helpful PDF reading assistant embedded in a PDF reader app.',
    'Answer based on the page content provided. Be concise, well-structured, and accurate.',
    'Use markdown formatting: **bold** for key terms, bullet lists for multiple points, `code` for technical terms.',
    'IMPORTANT: Always reply in the same language the user writes their question in.',
    "If the user asks in Arabic, reply in Arabic. If French, reply in French. Match the user's language exactly.",
    "If the user's message references previous conversation, use the chat history to understand context.",
  ].join(' ');

  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        if (!ANTHROPIC_API_KEY) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString());

        if (!body.messages || !Array.isArray(body.messages)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing messages array' }));
          return;
        }

        try {
          const apiRes = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              messages: body.messages,
            }),
          });

          const data = await apiRes.text();
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = apiRes.status;
          res.end(data);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
        }
      });
    },
  };
}

export default defineConfig({
  // Capacitor serves from capacitor://localhost — must use relative paths
  base: isCapacitor
    ? './'
    : process.env.GITHUB_ACTIONS ? '/pdf-reader-pro/' : '/',

  plugins: [
    apiProxy(),
    react(),

    // Always copy CMap files so PDF text renders correctly offline
    // (replaces the CDN URL in src/utils/pdf.ts → local cmaps/ folder)
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'cmaps',
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'standard_fonts',
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
