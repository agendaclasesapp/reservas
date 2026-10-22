// Ficha del alumno y personas a cargo (ALU-02, ALU-06, WEB-03; contratos.md §3). Los límites son
// los de SEC-09 y coinciden con los CHECK y la validación de supabase/migrations/202611000401_*.
import { z } from 'zod';
import type { Dia } from '../../../lib/fechas';

export const LARGO_MAX_NOMBRE = 100;
export const LARGO_MAX_TELEFONO = 20;
export const LARGO_MAX_COMO_LLEGO = 200;
export const DIGITOS_MIN_TELEFONO = 6;
export const DIGITOS_MAX_TELEFONO = 15;
export const FECHA_NACIMIENTO_MINIMA: Dia = '1900-01-01';
/** Caracteres admitidos en el teléfono: dígitos, espacios, `+` inicial, `(`, `)`, `-` y `.`. */
export const TELEFONO_PERMITIDO = /^\+?[0-9 ().-]+$/;

export const MENSAJES_FICHA = {
  nombreVacio: 'Escribí el nombre.',
  nombreLargo: `El nombre puede tener hasta ${LARGO_MAX_NOMBRE} caracteres.`,
  telefonoInvalido: 'Escribí un teléfono o WhatsApp válido: números, espacios, +, guiones o paréntesis.',
  telefonoLargo: `El teléfono puede tener hasta ${LARGO_MAX_TELEFONO} caracteres.`,
  fechaInvalida: 'Elegí una fecha de nacimiento válida.',
  comoLlegoVacio: 'Contanos cómo llegaste al profesor.',
  comoLlegoLargo: `Puede tener hasta ${LARGO_MAX_COMO_LLEGO} caracteres.`,
} as const;

export function digitosDeTelefono(telefono: string): number {
  return telefono.replace(/\D/g, '').length;
}

/** Teléfono válido según SEC-09 (lo mismo que comprueba la base). */
export function telefonoValido(telefono: string): boolean {
  const t = telefono.trim();
  const digitos = digitosDeTelefono(t);
  return (
    t.length <= LARGO_MAX_TELEFONO &&
    TELEFONO_PERMITIDO.test(t) &&
    digitos >= DIGITOS_MIN_TELEFONO &&
    digitos <= DIGITOS_MAX_TELEFONO
  );
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaReal(valor: string): boolean {
  if (!DIA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function nombre() {
  return z
    .string()
    .trim()
    .min(1, MENSAJES_FICHA.nombreVacio)
    .max(LARGO_MAX_NOMBRE, MENSAJES_FICHA.nombreLargo);
}

function fechaNacimiento(hoy: Dia) {
  return z
    .string()
    .trim()
    .refine((v) => diaReal(v) && v >= FECHA_NACIMIENTO_MINIMA && v <= hoy, MENSAJES_FICHA.fechaInvalida);
}

/** Esquema del formulario de la ficha; `hoy` es el día de hoy en el huso del profesor. */
export function crearEsquemaFicha(hoy: Dia) {
  return z.object({
    nombre: nombre(),
    telefono: z
      .string()
      .trim()
      .max(LARGO_MAX_TELEFONO, MENSAJES_FICHA.telefonoLargo)
      .refine(telefonoValido, MENSAJES_FICHA.telefonoInvalido),
    fecha_nacimiento: fechaNacimiento(hoy),
    como_llego: z
      .string()
      .trim()
      .min(1, MENSAJES_FICHA.comoLlegoVacio)
      .max(LARGO_MAX_COMO_LLEGO, MENSAJES_FICHA.comoLlegoLargo),
  });
}

/** Esquema de una persona a cargo (ALU-06): nombre y fecha de nacimiento, nada más (SEC-29). */
export function crearEsquemaPersona(hoy: Dia) {
  return z.object({ nombre: nombre(), fecha_nacimiento: fechaNacimiento(hoy) });
}

export type FichaEntrada = z.input<ReturnType<typeof crearEsquemaFicha>>;
export type PersonaEntrada = z.input<ReturnType<typeof crearEsquemaPersona>> & { id: string | null };

export const CAMPOS_FICHA = ['nombre', 'telefono', 'fecha_nacimiento', 'como_llego'] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number];

export const esquemaPersonaACargo = z.object({
  id: z.string(),
  nombre: z.string(),
  fecha_nacimiento: z.string().nullable(),
});
export type PersonaACargo = z.infer<typeof esquemaPersonaACargo>;

/** La fila propia de `alumno` que la ficha muestra (RLS: solo la suya). */
export const esquemaMiFicha = z.object({
  nombre: z.string().nullable(),
  mail: z.string().nullable(),
  telefono: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  como_llego: z.string().nullable(),
});
export type MiFicha = z.infer<typeof esquemaMiFicha>;
