/** UUID v4 para filas nuevas; con respaldo si el entorno no trae crypto.randomUUID. */
export function nuevoId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, h);
}

/** UUID determinista para la semilla: mismo número, mismo id. */
export function idSemilla(tipo: number, n: number): string {
  const t = tipo.toString(16).padStart(4, '0');
  return `00000000-${t}-4000-8000-${n.toString(16).padStart(12, '0')}`;
}
