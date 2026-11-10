import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { expect, it } from 'vitest';
import config from '../tailwind.config';

it('CA-10 los tokens generan los colores del design system', async () => {
  const cfg = { ...config, content: [{ raw: 'bg-senal-400 text-asfalto-900 rounded-tarjeta', extension: 'html' }] };
  const { css } = await postcss([tailwindcss(cfg)]).process('@tailwind utilities;', { from: undefined });
  // Tailwind emite los colores como rgb(): #FFD21F = 255 210 31, #151A23 = 21 26 35.
  expect(css).toContain('rgb(255 210 31');
  expect(css).toContain('rgb(21 26 35');
  expect(css).toContain('16px');
});
