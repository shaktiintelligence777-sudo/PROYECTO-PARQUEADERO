import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RutasApp, RUTAS } from './rutas';

const ir = (ruta: string) => render(<MemoryRouter initialEntries={[ruta]}><RutasApp /></MemoryRouter>);

describe('ruteo', () => {
  it.each(RUTAS.map((r) => [r.ruta, r.pantalla] as const))('CA-3 %s muestra %s', (ruta, pantalla) => {
    ir(ruta.replace(':id', '123'));
    expect(screen.getByRole('heading', { name: pantalla })).toBeInTheDocument();
  });
  it('CA-3 ruta desconocida', () => {
    ir('/no-existe');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/');
  });
});
