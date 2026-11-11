import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorApi } from '@/api';
import { reintentarLectura } from './App';
import { ConexionBannerDemo } from './ConexionBannerDemo';
import { ErrorConfiguracion } from './ErrorConfiguracion';

describe('C-01 · arranque en modo live', () => {
  it('CA-9 sin dirección del servidor se muestra el aviso en lugar de la app', () => {
    render(<ErrorConfiguracion mensaje="Falta configurar la dirección del servidor." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falta configurar la dirección del servidor.');
  });

  it('CA-12 en modo live no aparece el banner de demo', () => {
    const { container } = render(<QueryClientProvider client={new QueryClient()}><ConexionBannerDemo modo="live" /></QueryClientProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('regla 8: las lecturas reintentan una sola vez y solo sin conexión', () => {
    const sinRed = new ErrorApi(0, 'error_interno', 'Sin conexión.');
    expect(reintentarLectura(0, sinRed)).toBe(true);
    expect(reintentarLectura(1, sinRed)).toBe(false);
    expect(reintentarLectura(0, new ErrorApi(500, 'error_interno', 'x'))).toBe(false);
    expect(reintentarLectura(0, new ErrorApi(401, 'no_autenticado', 'x'))).toBe(false);
  });
});
