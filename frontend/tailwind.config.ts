import type { Config } from 'tailwindcss';

// Tokens de docs/ui/design-system.md §2. Las pantallas los usan por nombre, nunca con hex.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        asfalto: { 50: '#F6F7F9', 100: '#ECEEF2', 200: '#D9DDE4', 300: '#B8BFCA', 500: '#687385', 700: '#343C4A', 900: '#151A23' },
        blanco: '#FFFFFF',
        senal: { 100: '#FFF4C2', 400: '#FFD21F', 500: '#F2BD00' },
        'exito-suave': '#E3F6EA', exito: '#15803D', 'exito-texto': '#0F5C2C',
        'aviso-suave': '#FFF1DC', aviso: '#B4500B', 'aviso-texto': '#8A3D06',
        'peligro-suave': '#FDE7E7', peligro: '#C81E1E', 'peligro-texto': '#931313',
        'info-suave': '#E4EEFD', info: '#1D5FD1', 'info-texto': '#144494',
        'neutro-suave': '#ECEEF2', neutro: '#687385', 'neutro-texto': '#343C4A',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px', fontWeight: '700' }],
        titulo: ['22px', { lineHeight: '28px', fontWeight: '700' }],
        subtitulo: ['18px', { lineHeight: '24px', fontWeight: '600' }],
        cuerpo: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        apoyo: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        micro: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      spacing: { 13: '3.25rem' }, // filas de Tabla (52 px)
      maxWidth: { hoja: '30rem', contenido: '60rem' }, // Hoja en escritorio (480 px) y ancho de contenido (960 px)
      borderRadius: { control: '10px', tarjeta: '16px' },
      boxShadow: {
        tarjeta: '0 1px 2px rgb(21 26 35 / 0.06), 0 1px 3px rgb(21 26 35 / 0.10)',
        flotante: '0 8px 24px rgb(21 26 35 / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
