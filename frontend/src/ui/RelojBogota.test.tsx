import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { formatoRelojBogota } from '@/lib/formato';
import { Armazon } from './Armazon';
import { RelojBogota } from './RelojBogota';

afterEach(() => { vi.useRealTimers(); });

describe('formatoRelojBogota', () => {
  it('muestra la hora de Bogotá con segundos y 12 horas', () => {
    expect(formatoRelojBogota(new Date('2026-11-12T14:05:09Z'))).toEqual({ hora: '9:05:09', meridiano: 'a. m.' });
    expect(formatoRelojBogota(new Date('2026-11-12T22:30:00Z'))).toEqual({ hora: '5:30:00', meridiano: 'p. m.' });
    expect(formatoRelojBogota(new Date('2026-11-12T05:00:00Z'))).toEqual({ hora: '12:00:00', meridiano: 'a. m.' });
  });
});

describe('RelojBogota', () => {
  it('se actualiza cada segundo con la hora de Bogotá, sin importar la zona de la máquina', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T17:59:58Z'));
    render(<RelojBogota />);
    expect(screen.getByText('12:59:58')).toBeInTheDocument();
    expect(screen.getByText('p. m.')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('1:00:00')).toBeInTheDocument();
  });

  it('limpia el intervalo al desmontarse', () => {
    vi.useFakeTimers();
    const { unmount } = render(<RelojBogota />);
    const pendientes = vi.getTimerCount();
    unmount();
    expect(vi.getTimerCount()).toBe(pendientes - 1);
  });
});

describe('Armazon', () => {
  it('muestra el reloj en la barra lateral y en la cabecera móvil', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T14:05:09Z'));
    render(
      <MemoryRouter>
        <Armazon usuario={{ nombre: 'Ana', rol: 'admin' }} alCerrarSesion={() => {}}>contenido</Armazon>
      </MemoryRouter>,
    );
    expect(screen.getAllByText('9:05:09')).toHaveLength(2);
  });
});
