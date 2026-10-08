import { defineConfig } from 'vite';

// Relative base: the static build runs under any itch.io path, inside an iframe, and from Electron.
export default defineConfig({
  base: './',
  publicDir: false,
  build: { outDir: 'dist/web', emptyOutDir: true, assetsDir: 'js', sourcemap: false, target: 'es2022' },
  server: { port: 5199, strictPort: false },
});
