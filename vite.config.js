import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        passes: 2,
      },
    },
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@features': resolve(__dirname, 'src/features'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@styles': resolve(__dirname, 'src/styles'),
    },
  },
});
