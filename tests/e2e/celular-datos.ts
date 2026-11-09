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
  await sql(`delete from public.solicitud where alumno_id in (${ids})`);
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO_CEL}%'`);
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

// ---------------------------------------------------------------------------------------------------------------------
// Calendario del Panel (B22, T22.2): datos sintéticos `CEL Cal …` para accesibilidad, celular y teclado. Fechas en el huso del
// profesor; la grilla del profesor A se guarda, se reemplaza por una conocida y se restaura.
// ---------------------------------------------------------------------------------------------------------------------
export const TZ_PANEL = 'America/Montevideo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_PANEL, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Un miércoles a 15 o más días de hoy: todo futuro (hay huecos libres) y distinto del miércoles de 7 a 8 días que usan otras pruebas. */
export function miercolesFuturo(): string {
  const d = new Date(Date.now() + 15 * 86_400_000);
  while (new Date(fmtDia.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmtDia.format(d);
}
export const sumarDiasPanel = (dia: string, n: number) => fmtDia.format(new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000));

export type TramoPanel = { dia_semana: number; desde: string; hasta: string };
/** Lunes a domingo, 08:00-13:00 y 14:00-18:00. */
export const GRILLA_PANEL: TramoPanel[] = [1, 2, 3, 4, 5, 6, 7].flatMap((dia_semana) => [
  { dia_semana, desde: '08:00', hasta: '13:00' },
  { dia_semana, desde: '14:00', hasta: '18:00' },
]);
export async function leerGrillaPanel(slug: string = SLUG_A): Promise<TramoPanel[]> {
  return sql<TramoPanel>(
    'select dia_semana::int, desde::text, hasta::text from public.grilla_tramo where profesor_id = (select id from public.profesor where slug = $1)',
    [slug],
  );
}
export async function ponerGrillaPanel(tramos: TramoPanel[], slug: string = SLUG_A): Promise<void> {
  const p = '(select id from public.profesor where slug = $1)';
  await sql(`delete from public.grilla_tramo where profesor_id = ${p}`, [slug]);
  for (const t of tramos) {
    await sql(`insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values (${p}, $2, $3, $4)`, [slug, t.dia_semana, t.desde, t.hasta]);
  }
}
/** Una clase suelta de `minutos` minutos a las `hora` (HH:MM, huso de Montevideo) del `dia`; `pendiente` agrega su solicitud. */
export async function crearClasePanelCel(
  alumnoId: string,
  dia: string,
  hora: string,
  minutos: number,
  estado: 'confirmada' | 'pendiente' = 'confirmada',
  slug: string = SLUG_A,
): Promise<string> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const p = '(select id from public.profesor where slug = $1)';
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     values (${p}, $2, 'suelta', (($3::timestamptz) at time zone '${TZ_PANEL}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ_PANEL}')::smallint, $4, $5, (($3::timestamptz) at time zone '${TZ_PANEL}')::date, $6) returning id`,
    [slug, alumnoId, inicio, minutos, estado, estado === 'pendiente' ? 'solicitud' : 'profesor'],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values (${p}, $2, $3, $4::timestamptz, $4::timestamptz + ($5::int * interval '1 minute'), $6) returning id`,
    [slug, r.id, alumnoId, inicio, minutos, estado],
  );
  if (estado === 'pendiente') {
    await sql(`insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado) values (${p}, $2, 'reserva', $3, $4::timestamptz, 'pendiente')`, [
      slug,
      alumnoId,
      r.id,
      inicio,
    ]);
  }
  return c.id;
}
export async function crearBloqueoCel(dia: string, desde: string, hasta: string, motivo: string, slug: string = SLUG_A): Promise<void> {
  await sql(
    `insert into public.bloqueo (profesor_id, periodo, motivo) values ((select id from public.profesor where slug = $1), tstzrange($2::timestamptz, $3::timestamptz), $4)`,
    [slug, `${dia}T${desde}:00-03:00`, `${dia}T${hasta}:00-03:00`, `${PREFIJO_CEL}${motivo}`],
  );
}
/** Datos del calendario de una prueba: Ana 10:00-11:00 confirmada, Beto 11:00-12:00 pendiente, Cora 12:00-12:30 confirmada (corta, DEC-50 A) y un bloqueo 15:00-16:00. */
export async function datosCalendarioCel(dia: string): Promise<void> {
  await limpiarCalendarioCel();
  const ana = await crearAlumnoCel({ nombre: 'Cal Ana Pérez', estado: 'aprobado', telefono: '+598 99000011', mail: mailCel('cal.ana') });
  const beto = await crearAlumnoCel({ nombre: 'Cal Beto Gómez', estado: 'aprobado', telefono: '+598 99000012', mail: mailCel('cal.beto') });
  const cora = await crearAlumnoCel({ nombre: 'Cal Cora Díaz', estado: 'aprobado', telefono: '+598 99000013', mail: mailCel('cal.cora') });
  await crearClasePanelCel(ana, dia, '10:00', 60, 'confirmada');
  await crearClasePanelCel(beto, dia, '11:00', 60, 'pendiente');
  await crearClasePanelCel(cora, dia, '12:00', 30, 'confirmada');
  await crearBloqueoCel(dia, '15:00', '16:00', 'Torneo');
}
/** Borra los datos `CEL Cal …` y deja la agenda activa. */
export async function limpiarCalendarioCel(): Promise<void> {
  const ids = `select id from public.alumno where nombre like '${PREFIJO_CEL}Cal %'`;
  await sql(`delete from public.solicitud where alumno_id in (${ids})`);
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO_CEL}%'`);
  await sql(`delete from public.clase where alumno_id in (${ids})`);
  await sql(`delete from public.reserva where alumno_id in (${ids})`);
  await sql(`delete from public.mail_salida where alumno_id in (${ids})`);
  await sql(`delete from public.inscripcion where alumno_id in (${ids})`);
  await sql(`delete from public.alumno where nombre like '${PREFIJO_CEL}Cal %'`);
  await sql(`delete from auth.users where email like 'cel.cal.%'`);
}
