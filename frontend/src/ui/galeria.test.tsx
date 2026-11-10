import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { Galeria } from '@/app/Galeria';
import { RutasApp } from '@/app/rutas';
import { ProveedorToasts } from '@/ui';

describe('galería', () => {
  it('CA-14 no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = render(<MemoryRouter><ProveedorToasts><Galeria /></ProveedorToasts></MemoryRouter>);
    const resultado = await axe(container);
    expect(resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
  });
  it('CA-1 la galería muestra las variantes de cada familia', () => {
    render(<MemoryRouter><ProveedorToasts><Galeria /></ProveedorToasts></MemoryRouter>);
    for (const nombre of ['Botón', 'Formularios', 'Datos', 'Listas y tablas', 'Retroalimentación', 'Capas']) {
      expect(screen.getByRole('heading', { name: nombre })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('img', { name: 'Placa ABC12D' })).toHaveLength(4);
    for (const e of ['Activa', 'Por vencer', 'Vencida', 'Cancelada', 'Sin membresía']) expect(screen.getAllByText(e).length).toBeGreaterThan(0);
  });
  it('la ruta /galeria existe en desarrollo', () => {
    render(<MemoryRouter initialEntries={['/galeria']}><ProveedorToasts><RutasApp /></ProveedorToasts></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Galería de componentes' })).toBeInTheDocument();
  });
});

describe('tokens', () => {
  it('CA-15 src/ui no contiene colores hexadecimales ni rgb()', () => {
    const dir = join(__dirname);
    const archivos = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    expect(archivos.length).toBeGreaterThanOrEqual(30);
    for (const f of archivos) {
      const texto = readFileSync(join(dir, f), 'utf8');
      expect(texto, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(texto, f).not.toMatch(/rgba?\(/);
    }
  });
  it('src/ui no usa dangerouslySetInnerHTML', () => {
    for (const f of readdirSync(__dirname).filter((x) => /\.tsx?$/.test(x) && !/\.test\./.test(x))) {
      expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toContain('dangerouslySetInnerHTML');
    }
  });
});
