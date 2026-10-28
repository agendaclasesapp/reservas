// Prepara los datos sintéticos de la medición (prefijo «PERF »): dos profesores con una agenda realista, 24 alumnos aprobados
// con sesión firmada localmente y dos días fijos: D1 (miércoles) para CA-36 y D2 (jueves) con huecos libres para CA-17.
// Uso: node perf/preparar.mjs [limpiar]
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { conectar, PREFIJO, SLUGS, firmarJwt } from './lib.mjs';

const N_ALUMNOS = 24;
const c = await conectar();
const q = async (t, p = []) => (await c.query(t, p)).rows;

async function limpiar() {
  const ids = `select id from public.alumno where nombre like '${PREFIJO}%'`;
  await q(`delete from public.clase where alumno_id in (${ids})`);
  await q(`delete from public.solicitud where alumno_id in (${ids})`);
  await q(`delete from public.reserva where alumno_id in (${ids})`);
  await q(`delete from public.mail_salida where alumno_id in (${ids})`);
  await q(`delete from public.inscripcion where alumno_id in (${ids})`);
  await q(`delete from public.bloqueo where motivo like '${PREFIJO}%'`);
  await q(`delete from public.alumno where nombre like '${PREFIJO}%'`);
  await q(`delete from auth.users where email like 'perf.%@example.test'`);
}
await limpiar();
if (process.argv[2] === 'limpiar') {
  await c.end();
  console.log('LIMPIO');
  process.exit(0);
}

const [{ hoy }] = await q(`select to_char((public.app_ahora() at time zone 'America/Montevideo')::date,'YYYY-MM-DD') hoy`);
const profes = {};
for (const s of SLUGS) profes[s] = (await q('select id from public.profesor where slug=$1', [s]))[0].id;

// Alumnos aprobados con ambos profesores, con usuario de Auth confirmado.
const alumnos = [];
for (let i = 1; i <= N_ALUMNOS; i++) {
  const nn = String(i).padStart(2, '0');
  const mail = `perf.${nn}@example.test`;
  const uid = randomUUID();
  await q(
    `insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ($1,'authenticated','authenticated',$2, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')`,
    [uid, mail],
  );
  let [a] = await q('select id from public.alumno where user_id=$1', [uid]);
  if (!a) [a] = await q('insert into public.alumno (user_id, mail) values ($1,$2) returning id', [uid, mail]);
  await q(
    `update public.alumno set estado='completa', nombre=$2, telefono=$3, fecha_nacimiento='1995-05-05',
            ficha_completada_en='2026-01-01T12:00:00Z', ficha_origen_profesor_id=$4 where id=$1`,
    [a.id, `${PREFIJO}Alumno ${nn}`, `+598 99${String(100000 + i)}`, profes[SLUGS[0]]],
  );
  for (const s of SLUGS) {
    await q(
      `insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, aprobado_en) values ($1,$2,'aprobado','Amigos','2026-01-02T12:00:00Z')
       on conflict (alumno_id, profesor_id) do update set estado='aprobado'`,
      [a.id, profes[s]],
    );
  }
  alumnos.push({ n: i, mail, alumno_id: a.id, user_id: uid, jwt: firmarJwt(uid, mail, 6) });
}

// Próximo miércoles y jueves a 3 días o más de hoy (dentro del horizonte de 26 semanas y con la anticipación de 24 h).
const [{ d1, d2 }] = await q(
  `select to_char(x1, 'YYYY-MM-DD') d1, to_char(x2, 'YYYY-MM-DD') d2 from (
     select (select g::date from generate_series($1::date + 3, $1::date + 12, interval '1 day') g where extract(isodow from g) = 3 limit 1) x1,
            (select g::date from generate_series($1::date + 3, $1::date + 12, interval '1 day') g where extract(isodow from g) = 4 limit 1) x2) t`,
  [hoy],
);

const [{ d3 }] = await q(`select to_char($1::date + 1, 'YYYY-MM-DD') d3`, [d2]);

async function clase(prof, alumnoId, dia, hora, estado) {
  const [r] = await q(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, hasta, origen)
     values ($1,$2,'suelta',$4::time, extract(isodow from $3::date), 60, $5, $3::date, $3::date, 'profesor') returning id`,
    [prof, alumnoId, dia, hora, estado],
  );
  await q(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ($1,$2,$3, ($4::date + $5::time) at time zone 'America/Montevideo', ($4::date + $5::time + interval '1 hour') at time zone 'America/Montevideo', $6)`,
    [prof, r.id, alumnoId, dia, hora, estado],
  );
}
async function bloqueo(prof, dia, desde, hasta) {
  await q(
    `insert into public.bloqueo (profesor_id, periodo, motivo)
     values ($1, tstzrange(($2::date + $3::time) at time zone 'America/Montevideo', ($2::date + $4::time) at time zone 'America/Montevideo','[)'), $5)`,
    [prof, dia, desde, hasta, `${PREFIJO}bloqueo`],
  );
}

// D1: 9 huecos de la grilla (08..12 y 14..17): 4 ocupados (pendiente/confirmada), 2 bloqueados, 3 libres.
for (const [k, s] of SLUGS.entries()) {
  const p = profes[s];
  const al = (i) => alumnos[(i + k * 4) % N_ALUMNOS].alumno_id;
  await clase(p, al(0), d1, '09:00', 'confirmada');
  await clase(p, al(1), d1, '10:00', 'confirmada');
  await clase(p, al(2), d1, '14:00', 'pendiente');
  await clase(p, al(3), d1, '16:00', 'confirmada');
  await bloqueo(p, d1, '12:00', '13:00');
  await bloqueo(p, d1, '15:00', '16:00');
  // Historial y semanas futuras: unas 120 clases por profesor en otros días, para que los índices tengan cuerpo.
  let n = 0;
  for (let dd = -42; dd <= 84 && n < 120; dd++) {
    const [{ dia, iso }] = await q(`select to_char(($1::date + $2::int),'YYYY-MM-DD') dia, extract(isodow from ($1::date + $2::int))::int iso`, [hoy, dd]);
    if (iso > 5 || dia === d1 || dia === d2 || dia === d3) continue;
    for (const hora of ['08:00', '11:00', '14:00', '17:00']) {
      if ((dd + hora.charCodeAt(1) + k + 100) % 3 !== 0) continue;
      await clase(p, al(n % N_ALUMNOS), dia, hora, dd < 0 ? 'confirmada' : n % 5 === 0 ? 'pendiente' : 'confirmada');
      n++;
    }
  }
}
// D2 (jueves): todo libre en el profesor A para CA-17 (T-RES-04): se usan 6 huecos.
const estado = {
  generado: new Date().toISOString(),
  hoy,
  d1,
  d2,
  d3,
  profesores: profes,
  huecosCA17: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00'],
  alumnos: alumnos.map(({ n, mail, alumno_id, user_id }) => ({ n, mail, alumno_id, user_id })),
};
mkdirSync('perf/.estado', { recursive: true });
writeFileSync('perf/.estado/datos.json', JSON.stringify(estado, null, 1));
writeFileSync('perf/.estado/jwt.json', JSON.stringify(Object.fromEntries(alumnos.map((a) => [a.alumno_id, a.jwt]))));
const [{ cl }] = await q(`select count(*)::int cl from public.clase where alumno_id in (select id from public.alumno where nombre like '${PREFIJO}%')`);
console.log(JSON.stringify({ hoy, d1, d2, alumnos: alumnos.length, clases: cl }));
await c.end();
