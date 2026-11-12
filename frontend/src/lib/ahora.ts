import { useSyncExternalStore } from 'react';

const PERIODO_MS = 1000;

/**
 * Un solo reloj compartido para todos los cronómetros de la pantalla: un único `setInterval` mientras haya
 * algún suscriptor, en lugar de un temporizador por fila. Cada suscriptor recibe el instante en milisegundos.
 */
let instante = Date.now();
const oyentes = new Set<() => void>();
let temporizador: ReturnType<typeof setInterval> | undefined;

function latir() {
  instante = Date.now();
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  if (oyentes.size === 0) {
    instante = Date.now();
    temporizador = setInterval(latir, PERIODO_MS);
  }
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) {
      clearInterval(temporizador);
      temporizador = undefined;
    }
  };
}

const leer = () => instante;

/** Instante actual (ms desde la época), actualizado cada segundo para quien lo use. */
export function useAhoraCompartido(): number {
  return useSyncExternalStore(suscribir, leer, leer);
}
