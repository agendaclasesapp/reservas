// B11 · T11.3 · borrar_alumno [P] con dos profesores por la API real (PostgREST local, como la usa la web). Reloj fijo (ADR-014): lunes
// 2026-11-02 12:00 de Montevideo. Usuarios de Auth reales para las personas con cuenta (su cuenta tiene que seguir en Auth).
// CA: CA-10 (texto de CR-002), CA-45 (tras borrar_alumno), CA-57. IDs: ALU-12, DEC-05 A, DEC-26 A, SEC-06, SEC-26, SEC-27.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rpc, sesionDe, SLUG_A, type Rol } from '../../soporte/usuarios';
import { detalle, mensaje } from '../reservas/ayuda';
import { leer } from '../respuestas/ayuda';
import { AHORA, type Persona, clase, idsProfesores, persona, preparar, rastrear, registrar, restos, terminar, type Ids } from './ayuda';

const S = `zzb${Date.now()}`;
const SR = `zzr${Date.now()}`; // centinela de Rosa (se crea antes que los demás casos)
const tel = () => `096 ${100 + Math.floor(Math.random() * 900)} ${100 + Math.floor(Math.random() * 900)}`;
const clave = (t: string) => t.replace(/\D/g, '').slice(-8);
const TEL_SOFI = tel();
const TEL_SEBA = tel();
let ids: Ids;
let cora: Persona;
let rosa: Persona;

const borrar = (rol: 'profesor' | 'profesorB', id: string) => rpc(rol, 'borrar_alumno', { p_alumno_id: id });
async function huecoA(dia: string, inicioIso: string): Promise<string | undefined> {
  const r = await rpc('anon', 'agenda_publica', { p_slug: SLUG_A, p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return (r.cuerpo as { inicio: string; estado: string }[]).find((x) => new Date(x.inicio).getTime() === new Date(inicioIso).getTime())?.estado;
}
const inscripciones = (id: string) =>
  sql<{ profesor: string; estado: string; motivo_estado: string | null; como_llego: string | null }>(
    `select case when profesor_id = $2 then 'A' else 'B' end as profesor, estado, motivo_estado, como_llego from public.inscripcion where alumno_id = $1 order by 1`,
    [id, ids.PA],
  );
const mailsDe = async (id: string) => Number((await sql<{ n: string }>('select count(*)::text as n from public.mail_salida where alumno_id = $1', [id]))[0].n);

beforeAll(async () => {
  for (const r of ['profesor', 'profesorB'] as Rol[]) await sesionDe(r);
  ids = await idsProfesores();
  await preparar();
  // Los ingresos reales (código por mail) se hacen una vez, antes de los casos.
  cora = await persona('t11cora', 'T11 Cora', ids, { cuenta: true, con: { PA: 'aprobado', PB: 'aprobado' } });
  rosa = await persona('t11rosa', 'T11 Rosa', ids, { cuenta: true, con: { PA: 'rechazado' }, motivo: `motivo ${SR}`, como: `como ${SR}` });
}, 300_000);
afterAll(async () => {
  await terminar();
  await cerrar();
});

describe('CA-10 / CA-57 el profesor borra a un alumno con cuenta que también es de otro', () => {
  it('CA-57_A_borra_a_Cora_sus_clases_futuras_con_A_se_cancelan_y_la_cuenta_la_ficha_y_lo_de_B_siguen', async () => {
    const c1 = await clase(ids.PA, cora.id, '2026-11-04T13:00:00Z');
    const c2 = await clase(ids.PA, cora.id, '2026-11-11T13:00:00Z');
    const pasada = await clase(ids.PA, cora.id, '2026-10-20T13:00:00Z', { observacion: `obs ${S}` });
    const cb = await clase(ids.PB, cora.id, '2026-11-05T10:00:00Z');
    expect(await huecoA('2026-11-04', '2026-11-04T13:00:00Z')).toBe('ocupado');

    const r = await borrar('profesor', cora.id);
    registrar('CA-57_cora', { rpc: 'borrar_alumno', como: 'profesor A', alumno: cora.id, reloj: AHORA }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo).toEqual({ clases_canceladas: 2, solicitudes_anuladas: 0 });

    const clases = await sql<{ id: string; estado: string }>('select id, estado from public.clase where alumno_id = $1', [cora.id]);
    const est = (id: string) => clases.find((c) => c.id === id)?.estado;
    expect([est(c1), est(c2), est(pasada), est(cb)]).toEqual(['cancelada', 'cancelada', 'confirmada', 'confirmada']);
    expect(await huecoA('2026-11-04', '2026-11-04T13:00:00Z')).toBe('libre');
    expect(await huecoA('2026-11-11', '2026-11-11T13:00:00Z')).toBe('libre');
    expect(await inscripciones(cora.id)).toEqual([
      { profesor: 'A', estado: 'baja', motivo_estado: null, como_llego: null },
      { profesor: 'B', estado: 'aprobado', motivo_estado: null, como_llego: 'Amigos' },
    ]);
    const [a] = await sql<{ nombre: string; estado: string; user_id: string | null }>('select nombre, estado, user_id from public.alumno where id = $1', [cora.id]);
    expect(a).toMatchObject({ nombre: 'T11 Cora', estado: 'completa', user_id: cora.userId });
    expect((await sql('select 1 from auth.users where id = $1', [cora.userId])).length).toBe(1);
    expect((await sql('select 1 from public.reserva where alumno_id = $1 and observacion is not null', [cora.id])).length).toBe(0);
    expect(await mailsDe(cora.id)).toBe(0); // DEC-05 A: sin mails

    // A conserva su historial sin el nombre; B sigue viendo a Cora con su nombre.
    const deA = await leer<{ id: string; titular: string | null }>('profesor', 'v_clases', `id=in.(${[c1, c2, pasada].join(',')})`);
    const deB = await leer<{ id: string; titular: string | null }>('profesorB', 'v_clases', `id=eq.${cb}`);
    registrar('CA-57_vistas', { vista: 'v_clases' }, { A: deA, B: deB });
    expect(deA).toHaveLength(3);
    expect(deA.every((x) => x.titular === null)).toBe(true);
    expect(deB.map((x) => x.titular)).toEqual(['T11 Cora']);

    const otra = await borrar('profesor', cora.id);
    expect(otra.status).toBe(404);
    expect(mensaje(otra)).toBe('NO_ENCONTRADO');
  });

  it('SEC-06_B_no_puede_borrar_a_un_alumno_que_solo_es_de_A_y_la_respuesta_es_la_de_un_id_inexistente', async () => {
    const solo = await persona('t11solo', 'T11 Solo de A', ids, { cuenta: false, con: { PA: 'aprobado' } });
    const x = await borrar('profesorB', solo.id);
    const nada = await borrar('profesorB', '00000000-0000-0000-0000-00000000dead');
    registrar('SEC-06_borrar', { como: 'profesor B', alumno_de: 'A' }, { x: [x.status, x.cuerpo], inexistente: [nada.status, nada.cuerpo] });
    expect(x.status).toBe(404);
    expect(mensaje(x)).toBe('NO_ENCONTRADO');
    expect(x.cuerpo).toEqual(nada.cuerpo);
    expect(detalle(x)).toEqual(detalle(nada));
    expect((await inscripciones(solo.id)).map((i) => i.estado)).toEqual(['aprobado']);
  });
});

describe('CA-10 / CA-57 alumno sin cuenta', () => {
  it('CA-10_sin_cuenta_y_sin_otro_profesor_sus_datos_se_borran_como_en_ALU-10', async () => {
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: `Sofi ${S}`, p_telefono: TEL_SOFI, p_fecha_nacimiento: '1994-04-04', p_mail: null });
    expect(alta.status, JSON.stringify(alta.cuerpo)).toBe(200);
    const id = (alta.cuerpo as { alumno_id: string }).alumno_id;
    rastrear(id);
    const [pc] = await sql<{ id: string }>(`insert into public.persona_a_cargo (alumno_id, nombre, fecha_nacimiento) values ($1, $2, '2016-06-06') returning id`, [id, `Hijo ${S}`]);
    const pasada = await clase(ids.PA, id, '2026-10-19T13:00:00Z');
    await sql('update public.clase set persona_a_cargo_id = $2 where id = $1', [pasada, pc.id]);
    const futura = await clase(ids.PA, id, '2026-11-09T13:00:00Z');
    expect(await huecoA('2026-11-09', '2026-11-09T13:00:00Z')).toBe('ocupado');

    const r = await borrar('profesor', id);
    registrar('CA-10_sin_cuenta', { alumno: id, con: 'solo A', clases: ['pasada', 'futura'] }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo).toEqual({ clases_canceladas: 1, solicitudes_anuladas: 0 });
    const [a] = await sql<Record<string, unknown>>('select nombre, mail, telefono, fecha_nacimiento::text as nac, user_id, estado from public.alumno where id = $1', [id]);
    expect(a).toEqual({ nombre: null, mail: null, telefono: null, nac: null, user_id: null, estado: 'borrado' });
    expect((await sql('select 1 from public.persona_a_cargo where alumno_id = $1', [id])).length).toBe(0);
    const clases = await sql<{ id: string; estado: string; persona_a_cargo_id: string | null }>('select id, estado, persona_a_cargo_id from public.clase where alumno_id = $1', [id]);
    expect(clases.find((c) => c.id === pasada)).toMatchObject({ estado: 'confirmada', persona_a_cargo_id: null });
    expect(clases.find((c) => c.id === futura)?.estado).toBe('cancelada');
    expect(await huecoA('2026-11-09', '2026-11-09T13:00:00Z')).toBe('libre');
    const pat = [S, TEL_SOFI, clave(TEL_SOFI)].join('|');
    expect(await restos(pat), JSON.stringify(await sql('select x::text as t from public.inscripcion x where x::text ~* $1', [pat]))).toBe('');
  });

  it('CA-57_sin_cuenta_pero_tambien_de_B_sigue_hasta_que_el_ultimo_profesor_lo_borra', async () => {
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: `Seba ${S}`, p_telefono: TEL_SEBA, p_fecha_nacimiento: '1995-05-05', p_mail: null });
    expect(alta.status, JSON.stringify(alta.cuerpo)).toBe(200);
    const id = (alta.cuerpo as { alumno_id: string }).alumno_id;
    rastrear(id);
    await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, $2, 'sin_cuenta')`, [id, ids.PB]);
    const cb = await clase(ids.PB, id, '2026-11-12T10:00:00Z');

    const ra = await borrar('profesor', id);
    registrar('CA-57_seba_A', { alumno: id, quien: 'profesor A' }, { status: ra.status, cuerpo: ra.cuerpo });
    expect(ra.status, JSON.stringify(ra.cuerpo)).toBe(200);
    const [a1] = await sql<{ nombre: string | null; estado: string }>('select nombre, estado from public.alumno where id = $1', [id]);
    expect(a1).toEqual({ nombre: `Seba ${S}`, estado: 'completa' });
    expect((await inscripciones(id)).map((i) => `${i.profesor}:${i.estado}`)).toEqual(['A:baja', 'B:sin_cuenta']);
    expect((await sql<{ estado: string }>('select estado from public.clase where id = $1', [cb]))[0].estado).toBe('confirmada');

    const rb = await borrar('profesorB', id);
    registrar('CA-57_seba_B', { alumno: id, quien: 'profesor B' }, { status: rb.status, cuerpo: rb.cuerpo });
    expect(rb.status, JSON.stringify(rb.cuerpo)).toBe(200);
    expect(rb.cuerpo).toEqual({ clases_canceladas: 1, solicitudes_anuladas: 0 });
    const [a2] = await sql<{ nombre: string | null; estado: string }>('select nombre, estado from public.alumno where id = $1', [id]);
    expect(a2).toEqual({ nombre: null, estado: 'borrado' });
    expect(await restos(`Seba ${S}|${TEL_SEBA}|${clave(TEL_SEBA)}`)).toBe('');
  });
});

describe('CA-45 cierre: tras borrar_alumno no queda el motivo de rechazo', () => {
  it('CA-45_A_borra_a_una_cuenta_rechazada_con_motivo_y_inscripcion_motivo_estado_queda_nulo_con_la_cuenta_en_pie', async () => {
    expect((await inscripciones(rosa.id))[0]).toMatchObject({ estado: 'rechazado', motivo_estado: `motivo ${SR}` });
    const r = await borrar('profesor', rosa.id);
    registrar('CA-45_borrar', { alumno: rosa.id, motivo: `motivo ${SR}` }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(await inscripciones(rosa.id)).toEqual([{ profesor: 'A', estado: 'baja', motivo_estado: null, como_llego: null }]);
    expect((await sql('select 1 from auth.users where id = $1', [rosa.userId])).length).toBe(1);
    expect(await restos(SR)).toBe('');
  });
});
