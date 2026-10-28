// Datos sintéticos propios de celular.spec.ts (B12, T12.1b). Prefijo `CEL ` y mails `cel.*@example.test`, distintos de los
// de `T05 ` que borra limpiarT05 en otras pruebas (accesibilidad.spec.ts corre en paralelo y no debe tocar estos datos).
import { sql } from '../soporte/bd';
import { SLUG_A } from '../soporte/usuarios';

export const PREFIJO_CEL = 'CEL ';
export const mailCel = (etiqueta: string) => `cel.${etiqueta}@example.test`;

export async function crearAlumnoCel(
  a: { nombre: string; estado: 'pendiente' | 'aprobado' | 'rechazado'; telefono: string; mail: string },
  slug: string = SLUG_A,
): Promise<string> {
  const [p] = await sql<{ id: string }>('select id from public.profesor where slug = $1', [slug]);
  const [f] = await sql<{ id: string }>(
    `insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en, ficha_origen_profesor_id, creado_por)
     values ('completa', $1, $2, '1990-01-01', $3, '2026-01-01T12:00:00Z', $4, $4) returning id`,
    [PREFIJO_CEL + a.nombre, a.telefono, a.mail, p.id],
  );
  await sql('insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, $2, $3)', [f.id, p.id, a.estado]);
  return f.id;
}

export async function limpiarCel(): Promise<void> {
  const ids = `select id from public.alumno where nombre like '${PREFIJO_CEL}%' or mail like 'cel.%'`;
  await sql(`delete from public.clase where alumno_id in (${ids})`);
  await sql(`delete from public.reserva where alumno_id in (${ids})`);
  await sql(`delete from public.persona_a_cargo where alumno_id in (${ids})`);
  await sql(`delete from public.mail_salida where alumno_id in (${ids})`);
  await sql(`delete from public.inscripcion where alumno_id in (${ids})`);
  await sql(`delete from public.alumno where nombre like '${PREFIJO_CEL}%' or mail like 'cel.%'`);
  const profs = `select id from public.profesor where slug like 'cel-adm-%' or mail like 'cel.adm.%'`;
  await sql(`delete from public.mail_salida where profesor_id in (${profs}) or destinatario like 'cel.adm.%'`);
  await sql(`delete from public.grilla_tramo where profesor_id in (${profs})`);
  await sql(`delete from public.profesor where id in (${profs})`);
  await sql(`delete from auth.users where email like 'cel.%'`);
}
