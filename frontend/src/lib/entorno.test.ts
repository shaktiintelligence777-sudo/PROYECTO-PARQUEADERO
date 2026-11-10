import { describe, expect, it } from 'vitest';
import { leerEntorno } from './entorno';

describe('entorno', () => {
  it('usa mock por defecto', () => expect(leerEntorno({}).modo).toBe('mock'));
  it('quita la barra final de la URL', () => {
    expect(leerEntorno({ VITE_API_MODE: 'live', VITE_API_URL: 'https://api.test/' }).apiUrl).toBe('https://api.test');
  });
  it('live exige URL', () => expect(() => leerEntorno({ VITE_API_MODE: 'live' })).toThrow());
  it('rechaza un modo inválido', () => expect(() => leerEntorno({ VITE_API_MODE: 'otro' })).toThrow());
});
