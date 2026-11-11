import { z } from 'zod';
import type { ClienteCrear, ClienteEditar, MotoCrear, MotoEditar } from '@/api';

type MotoEnAlta = NonNullable<ClienteCrear['motos']>[number];
import { normalizarPlaca } from '@/lib/formato';

// Los límites replican los de `ClienteCrear`, `ClienteEditar`, `MotoCrear` y `MotoEditar` del contrato.
export const LIMITES = { nombre: [2, 120], notas: 500, email: 254, marca: 40, color: 30, motos: 5 } as const;

export const MENSAJES = {
  nombre: 'Escribe el nombre.',
  documento: 'El documento debe tener entre 5 y 20 letras o números.',
  telefono: 'El teléfono debe tener entre 7 y 15 dígitos.',
  email: 'Ese email no parece válido.',
  placa: 'La placa debe tener entre 4 y 7 letras o números.',
  documentoDuplicado: 'Ya existe un cliente con ese documento.',
  placaDuplicada: 'Esa placa ya está registrada.',
} as const;

const RE_DOCUMENTO = /^[A-Za-z0-9]{5,20}$/;
const RE_TELEFONO = /^\+?[0-9]{7,15}$/;
const RE_PLACA = /^[A-Z0-9]{4,7}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El teléfono se escribe a gusto ("300 000 0001"); al validar y enviar se quitan espacios, guiones y paréntesis. */
export const limpiarTelefono = (t: string) => t.replace(/[\s\-().]/g, '');

const texto = (max: number, mensaje: string) => z.string().trim().max(max, mensaje);

export const esquemaMoto = z.object({
  placa: z.string().transform(normalizarPlaca).pipe(z.string().regex(RE_PLACA, MENSAJES.placa)),
  marca: texto(LIMITES.marca, `Máximo ${LIMITES.marca} caracteres.`),
  color: texto(LIMITES.color, `Máximo ${LIMITES.color} caracteres.`),
});

const camposCliente = {
  nombre: z.string().trim().min(LIMITES.nombre[0], MENSAJES.nombre).max(LIMITES.nombre[1], `Máximo ${LIMITES.nombre[1]} caracteres.`),
  documento: z.string().trim().regex(RE_DOCUMENTO, MENSAJES.documento),
  telefono: z.string().transform((t) => limpiarTelefono(t.trim())).pipe(z.string().regex(RE_TELEFONO, MENSAJES.telefono)),
  email: z.string().trim().max(LIMITES.email, MENSAJES.email).refine((e) => e === '' || RE_EMAIL.test(e), MENSAJES.email),
  notas: texto(LIMITES.notas, `Máximo ${LIMITES.notas} caracteres.`),
};

export const esquemaClienteEdicion = z.object(camposCliente);
export const esquemaClienteAlta = z.object({ ...camposCliente, motos: z.array(esquemaMoto).max(LIMITES.motos, `Máximo ${LIMITES.motos} motos.`) });

export type ValoresMoto = z.input<typeof esquemaMoto>;
export type ValoresClienteEdicion = z.input<typeof esquemaClienteEdicion>;
export type ValoresClienteAlta = z.input<typeof esquemaClienteAlta>;

const vacioANull = (s: string) => (s === '' ? null : s);

export function aMotoEnAlta(v: z.output<typeof esquemaMoto>): MotoEnAlta {
  return { placa: v.placa, marca: vacioANull(v.marca), color: vacioANull(v.color) };
}
export function aMotoCrear(v: z.output<typeof esquemaMoto>, clienteId: string): MotoCrear {
  return { ...aMotoEnAlta(v), cliente_id: clienteId };
}
export function aMotoEditar(v: z.output<typeof esquemaMoto>): MotoEditar {
  return { placa: v.placa, marca: vacioANull(v.marca), color: vacioANull(v.color) };
}
export function aClienteCrear(v: z.output<typeof esquemaClienteAlta>): ClienteCrear {
  return {
    nombre: v.nombre, documento: v.documento, telefono: v.telefono, email: vacioANull(v.email), notas: vacioANull(v.notas),
    motos: v.motos.map(aMotoEnAlta),
  };
}
export function aClienteEditar(v: z.output<typeof esquemaClienteEdicion>): ClienteEditar {
  return { nombre: v.nombre, documento: v.documento, telefono: v.telefono, email: vacioANull(v.email), notas: vacioANull(v.notas) };
}
