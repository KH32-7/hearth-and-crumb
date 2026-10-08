import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: the same build runs from any sub-path (GitHub Pages /repo/) and from Electron's app:// root.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
