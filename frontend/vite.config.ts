/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Las pruebas corren en UTC para demostrar que los formatos no dependen de la zona de la máquina.
if (process.env.VITEST) process.env.TZ = 'UTC';

// VITE_BASE manda; si no existe: ruta del repositorio en el build (GitHub Pages) y "/" en desarrollo.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/PROYECTO-PARQUEADERO/' : '/'),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}));
