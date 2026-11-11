import { describe, expect, it } from 'vitest';
import { FALTA_URL, leerEntorno } from './entorno';

describe('entorno', () => {
  it('usa mock por defecto', () => expect(leerEntorno({}).modo).toBe('mock'));
  it('quita la barra final de la URL', () => {
    expect(leerEntorno({ VITE_API_MODE: 'live', VITE_API_URL: 'https://api.test/' }).apiUrl).toBe('https://api.test');
  });
  it('C-01 CA-9 live sin URL deja un error de configuración en vez de arrancar', () => {
    const e = leerEntorno({ VITE_API_MODE: 'live' });
    expect(e.errorConfiguracion).toBe(FALTA_URL);
    expect(FALTA_URL).toBe('Falta configurar la dirección del servidor.');
  });
  it('sin error de configuración en mock o live con URL', () => {
    expect(leerEntorno({}).errorConfiguracion).toBeNull();
    expect(leerEntorno({ VITE_API_MODE: 'live', VITE_API_URL: 'https://api.test' }).errorConfiguracion).toBeNull();
  });
  it('rechaza un modo inválido', () => expect(() => leerEntorno({ VITE_API_MODE: 'otro' })).toThrow());
});
