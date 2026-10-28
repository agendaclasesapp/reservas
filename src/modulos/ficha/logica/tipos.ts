// Ficha de la persona y personas a cargo (ALU-02, ALU-06, ALU-14, WEB-03; contratos.md §3). Los límites son
// los de SEC-09 y coinciden con los CHECK y la validación de supabase/migrations/202611000401_* y 0522_*.
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
  /** El profesor del enlace ya no existe o está inactivo: la ficha se vuelve a guardar sin vínculo (ALU-14). */
  origenNoDisponible:
    'El profesor del enlace no está disponible. Volvé a guardar: tu ficha queda guardada y después podés pedirle acceso desde su enlace.',
  /** `pedir_inscripcion` con un vínculo que ya existe (409 `CUENTA_NO_PENDIENTE`). */
  yaPediste: 'Ya pediste acceso a este profesor.',
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

function comoLlego() {
  return z
    .string()
    .trim()
    .min(1, MENSAJES_FICHA.comoLlegoVacio)
    .max(LARGO_MAX_COMO_LLEGO, MENSAJES_FICHA.comoLlegoLargo);
}

/**
 * Esquema del formulario de la ficha; `hoy` es el día de hoy (la base valida con `zona_horaria_app`).
 * `conComoLlego`: true solo con un profesor de origen (ALU-14, DEC-33); sin él, «cómo llegaste» no se
 * pregunta ni se manda y el campo puede quedar vacío.
 */
export function crearEsquemaFicha(hoy: Dia, conComoLlego = true) {
  return z.object({
    nombre: nombre(),
    telefono: z
      .string()
      .trim()
      .max(LARGO_MAX_TELEFONO, MENSAJES_FICHA.telefonoLargo)
      .refine(telefonoValido, MENSAJES_FICHA.telefonoInvalido),
    fecha_nacimiento: fechaNacimiento(hoy),
    como_llego: conComoLlego ? comoLlego() : z.string().trim().max(LARGO_MAX_COMO_LLEGO, MENSAJES_FICHA.comoLlegoLargo),
  });
}

/** «Pedir acceso» (ALU-14, DEC-33): solo «cómo llegaste» a ese profesor. */
export function crearEsquemaPedirAcceso() {
  return z.object({ como_llego: comoLlego() });
}

export type PedirAccesoEntrada = z.input<ReturnType<typeof crearEsquemaPedirAcceso>>;

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

/**
 * La fila propia de `alumno` que la ficha muestra (RLS: solo la suya). «Cómo llegaste» ya no es de la
 * persona: va en el vínculo con cada profesor (ALU-14, WEB-03).
 */
export const esquemaMiFicha = z.object({
  nombre: z.string().nullable(),
  mail: z.string().nullable(),
  telefono: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
});

/** Estado del vínculo con un profesor tal como lo muestra la ficha (WEB-03, ALU-03). */
export interface VinculoFicha {
  profesorId: string;
  slug: string;
  /** Texto (SEC-16). */
  profesorNombre: string;
  profesorActivo: boolean;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'sin_cuenta';
  /** Motivo del profesor que rechazó, solo si lo escribió (ALU-03); si no, `null`. */
  motivo: string | null;
}
export type MiFicha = z.infer<typeof esquemaMiFicha>;
