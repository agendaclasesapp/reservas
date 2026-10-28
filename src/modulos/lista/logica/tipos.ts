// Lista de alumnos del profesor (ALU-03, ALU-04, ALU-05, ALU-07, ALU-08, ALU-09; contratos.md §2 `v_alumnos`
// y §3). Los límites son los de SEC-09 y coinciden con supabase/migrations/202611000501_* y 503_*.
import { z } from 'zod';
import type { Dia } from '../../../lib/fechas';
import { crearEsquemaPersona, LARGO_MAX_TELEFONO, MENSAJES_FICHA, telefonoValido } from '../../ficha/logica';

export const LARGO_MAX_MOTIVO = 500;
export const LARGO_MAX_MAIL = 254;

/** Mail simple: lo mismo que `privado.es_mail_simple` (contratos.md §4): una dirección, sin espacios, `,` `;` `<>`. */
const MAIL_SIMPLE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

export function mailSimple(mail: string): boolean {
  return mail.length <= LARGO_MAX_MAIL && MAIL_SIMPLE.test(mail);
}

/**
 * Códigos 409 de B05 que contratos.md §3 deja sin nombre (pendientes de entrar a §1 y a src/lib/errores.ts;
 * ver handoff de T05.1). Mientras tanto los traduce este módulo.
 */
export const CUENTA_NO_PENDIENTE = 'CUENTA_NO_PENDIENTE';
export const UNION_NO_VALIDA = 'UNION_NO_VALIDA';

export const MENSAJES_LISTA = {
  [CUENTA_NO_PENDIENTE]: 'Esa cuenta ya no está pendiente de aprobación. Actualizá la lista.',
  [UNION_NO_VALIDA]: 'Esa unión ya no es posible. Actualizá la lista.',
  motivoLargo: `El motivo puede tener hasta ${LARGO_MAX_MOTIVO} caracteres.`,
  mailInvalido: 'Escribí un solo mail válido, o dejalo vacío si el alumno no tiene mail.',
  /** ALU-03: el motivo de un rechazo lo ve la cuenta en su ficha y en Mis clases, y le llega por mail (AVI-03). */
  avisoMotivoVisible: 'La persona va a ver este motivo en su ficha y en Mis clases, y le llega por mail.',
  /** PRF-08: el profesor inactivo no aprueba accesos ni da de alta alumnos (409 `PROFESOR_INACTIVO`). */
  profesorInactivo:
    'Tu agenda está inactiva: no podés aprobar accesos ni dar de alta alumnos hasta que el Administrador la reactive.',
  /** 409 `MAIL_YA_REGISTRADO` con `alumno_id`: ya es alumna aprobada de quien llama (DEC-29 b). */
  mailYaEsTuAlumno: 'Esa persona ya es alumna tuya.',
  /** DEC-29 b: el alta con el mail de una persona existente la asocia aprobada sin tocar su ficha. */
  altaAsociada: 'Ese mail ya tenía cuenta: la persona quedó como alumna tuya, con la ficha que ya tenía.',
  /** DEC-32: la ficha la cargó otro, tiene usuario o la comparte con otro profesor. */
  noEditable: 'Esta ficha no se puede editar: la persona la maneja desde su cuenta o la comparte con otro profesor.',
} as const;

export const ESTADOS_LISTA = ['pendiente', 'aprobado', 'rechazado', 'sin_cuenta'] as const;
export type EstadoAlumno = (typeof ESTADOS_LISTA)[number];

/** Fila de `v_alumnos` (ALU-09): ficha, estado y edad calculada por la base con `app_ahora()`. */
export const esquemaAlumnoLista = z.object({
  id: z.string(),
  estado: z.enum(ESTADOS_LISTA),
  nombre: z.string().nullable(),
  mail: z.string().nullable(),
  telefono: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  como_llego: z.string().nullable(),
  motivo_estado: z.string().nullable(),
  /** La cuenta ya tiene usuario de Auth: su mail es su identidad de ingreso y no se edita. */
  con_usuario: z.boolean(),
  creado_en: z.string(),
  ficha_completada_en: z.string().nullable(),
  aprobado_en: z.string().nullable(),
  edad: z.number().int().nullable(),
  /** DEC-32: la cargó este profesor, sin usuario y sin otro profesor; si no, la ficha es de solo lectura. */
  editable: z.boolean(),
});
export type AlumnoLista = z.infer<typeof esquemaAlumnoLista>;

export const COLUMNAS_V_ALUMNOS =
  'id, estado, nombre, mail, telefono, fecha_nacimiento, como_llego, motivo_estado, con_usuario, creado_en, ficha_completada_en, aprobado_en, edad, editable';

/** Sugerencia de unión (ALU-04): un alumno sin cuenta con el mismo teléfono normalizado. */
export const esquemaSugerencia = z.object({
  sin_cuenta_id: z.string(),
  nombre: z.string().nullable(),
  telefono: z.string().nullable(),
});
export type Sugerencia = z.infer<typeof esquemaSugerencia>;

export const esquemaRespuestaCuenta = z.object({
  estado: z.enum(['aprobado', 'rechazado']),
  sugerencias: z.array(esquemaSugerencia),
});
export type RespuestaCuenta = z.infer<typeof esquemaRespuestaCuenta>;

/** Motivo opcional de aprobar o rechazar: vacío = sin motivo; hasta 500 caracteres (SEC-09). */
export const esquemaMotivo = z.string().trim().max(LARGO_MAX_MOTIVO, MENSAJES_LISTA.motivoLargo);

/**
 * Formulario de alta y de edición (ALU-07, ALU-08): nombre, teléfono y fecha de nacimiento como la
 * ficha; mail opcional (vacío = alumno sin cuenta). `hoy` es el día de hoy en el huso del profesor.
 */
export function crearEsquemaAlumno(hoy: Dia) {
  return crearEsquemaPersona(hoy).extend({
    telefono: z
      .string()
      .trim()
      .max(LARGO_MAX_TELEFONO, MENSAJES_FICHA.telefonoLargo)
      .refine(telefonoValido, MENSAJES_FICHA.telefonoInvalido),
    mail: z
      .string()
      .trim()
      .refine((v) => v === '' || mailSimple(v), MENSAJES_LISTA.mailInvalido),
  });
}

export type AlumnoEntrada = z.input<ReturnType<typeof crearEsquemaAlumno>>;

export const CAMPOS_LISTA = ['nombre', 'telefono', 'fecha_nacimiento', 'mail', 'motivo'] as const;
export type CampoLista = (typeof CAMPOS_LISTA)[number];
