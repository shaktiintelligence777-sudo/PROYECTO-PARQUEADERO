import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cronometro } from './Cronometro';

const DESDE = '2026-11-10T17:00:00Z';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-10T17:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Cronometro', () => {
  it('CA-13 avanza cada segundo desde el instante de entrada', () => {
    render(<Cronometro desde={DESDE} />);
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByText('00:00:03')).toBeInTheDocument();
  });

  it('CA-13 varios cronómetros comparten un único temporizador', () => {
    const intervalo = vi.spyOn(globalThis, 'setInterval');
    const { unmount } = render(
      <>
        <Cronometro desde={DESDE} />
        <Cronometro desde={DESDE} />
        <Cronometro desde={DESDE} />
      </>,
    );
    expect(intervalo).toHaveBeenCalledTimes(1);
    unmount();
    intervalo.mockRestore();
  });
});
