// Administración de profesores (ADM-02, ADM-03, ADM-05; contratos.md §1 «Slug» y §3, RPC `[Adm]`).
// Las reglas del slug son las de `privado.slug_valido` (supabase/migrations/202611000510_*, ADR-018) y los
// largos los de SEC-09; la base valida igual y su 422 es la última barrera.
import { z } from 'zod';
import { mailSimple } from '../../lista/logica';

export const LARGO_MIN_SLUG = 3;
export const LARGO_MAX_SLUG = 30;
export const LARGO_MAX_NOMBRE_PROFESOR = 100;

/** Lista reservada de ADR-018: rutas de la web y nombres que no pueden ser el enlace de un profesor. */
export const SLUGS_RESERVADOS = [
  'admin',
  'p',
  'ingreso',
  'ficha',
  'mis-clases',
  'panel',
  'lista',
  'configuracion',
  'inicio',
  'api',
  'reservas',
  'soporte',
  'ayuda',
] as const;

const SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** ADM-02: de 3 a 30 caracteres, minúsculas, dígitos y guiones, sin guion en los bordes (sin mirar la reserva). */
export function slugConFormato(slug: string): boolean {
  return slug.length >= LARGO_MIN_SLUG && slug.length <= LARGO_MAX_SLUG && SLUG.test(slug);
}

/** ADM-02: el slug es una palabra reservada. */
export function slugReservado(slug: string): boolean {
  return (SLUGS_RESERVADOS as readonly string[]).includes(slug);
}

/** ADM-02: lo mismo que `privado.slug_valido`: con formato y no reservado. */
export function slugValido(slug: string): boolean {
  return slugConFormato(slug) && !slugReservado(slug);
}

/** Para el campo del formulario: sin espacios en los bordes y en minúsculas (ADM-02 pide minúsculas). */
export function normalizarSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export const MENSAJES_ADMIN = {
  mailInvalido: 'Escribí un mail válido.',
  nombreVacio: 'Escribí el nombre del profesor.',
  nombreLargo: `El nombre puede tener hasta ${LARGO_MAX_NOMBRE_PROFESOR} caracteres.`,
  slugFormato: `El enlace va de ${LARGO_MIN_SLUG} a ${LARGO_MAX_SLUG} caracteres: minúsculas, números y guiones, sin guion al principio ni al final.`,
  slugReservado: 'Ese enlace está reservado por la aplicación. Elegí otro.',
  /** 422 `{"campo":"p_slug"}` del servidor: no dice si fue el formato o la reserva. */
  slugNoValido: 'Ese enlace no se puede usar: revisá el formato o elegí otro.',
  /** 409 `MAIL_YA_REGISTRADO` en `alta_profesor` (DEC-31): de un profesor o de una persona con la ficha completa. */
  mailYaRegistrado: 'Ese mail ya es de un profesor o de una persona con su ficha completa.',
  /** `adoptado: true` (spec §8, ADR-021): el profesor que ya existía queda con el nombre y el enlace definitivos. */
  adoptado: 'Ese mail ya era de un profesor: quedó con este nombre y este enlace, y conserva su agenda y sus datos.',
  /** DEC-34: lo que se le avisa al dar de alta un profesor (también le llega por mail). */
  avisoDatosPublicos:
    'El nombre del profesor es público: lo ve cualquiera que abra su enlace. Su mail lo ven sus alumnos como dirección de respuesta.',
} as const;

/** Fila de `listar_profesores()` (ADM-03): solo columnas de `profesor`, nada de alumnos (ADM-04). */
export const esquemaProfesorFila = z.object({
  profesor_id: z.string(),
  nombre: z.string().nullable(),
  mail: z.string(),
  slug: z.string(),
  activo: z.boolean(),
  creado_en: z.string(),
});
export type ProfesorFila = z.infer<typeof esquemaProfesorFila>;

/** Fila de la lista con el enlace público para copiar (`origen + base + #/p/<slug>`, AGE-09). */
export interface ProfesorLista extends ProfesorFila {
  enlace: string;
}

export const esquemaRespuestaAltaProfesor = z.object({
  profesor_id: z.string(),
  slug: z.string(),
  adoptado: z.boolean(),
});

export const esquemaRespuestaEstadoProfesor = z.object({
  profesor_id: z.string(),
  activo: z.boolean(),
});

/** Formulario de alta (ADM-02): mail, nombre y enlace; el mismo orden de reglas que la base. */
export const esquemaAltaProfesor = z.object({
  mail: z.string().trim().refine(mailSimple, MENSAJES_ADMIN.mailInvalido),
  nombre: z
    .string()
    .trim()
    .min(1, MENSAJES_ADMIN.nombreVacio)
    .max(LARGO_MAX_NOMBRE_PROFESOR, MENSAJES_ADMIN.nombreLargo),
  slug: z
    .string()
    .trim()
    .superRefine((slug, ctx) => {
      if (!slugConFormato(slug)) ctx.addIssue({ code: 'custom', message: MENSAJES_ADMIN.slugFormato });
      else if (slugReservado(slug)) ctx.addIssue({ code: 'custom', message: MENSAJES_ADMIN.slugReservado });
    }),
});
export type ProfesorEntrada = z.input<typeof esquemaAltaProfesor>;

export const CAMPOS_ADMIN = ['mail', 'nombre', 'slug', 'activo'] as const;
export type CampoAdmin = (typeof CAMPOS_ADMIN)[number];
