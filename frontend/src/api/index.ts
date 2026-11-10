import type { ApiClient } from './client';
import { createMockApi } from './mock';

const mode = import.meta.env.VITE_API_MODE ?? 'mock';

function build(): ApiClient {
  if (mode === 'mock') return createMockApi();
  // El adaptador live lo construye el hilo de convergencia (C-01).
  throw new Error('VITE_API_MODE=live aún no está implementado');
}

export const api: ApiClient = build();
export const isDemo = mode === 'mock';
export type { ApiClient } from './client';
export { ApiError } from './client';
export * from './types';
