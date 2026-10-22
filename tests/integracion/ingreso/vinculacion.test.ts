// B04 · T04.4 · vinculación de usuarios de Auth con la app, contra la base local (CA-01, CA-02, ALU-01, SEC-14,
// SEC-15; casos T-ALU-01, T-ALU-06 rama de datos). Google se simula como lo hace GoTrue: el usuario nace sin
// confirmar y un UPDATE posterior lo confirma con `full_name` ya presente; además el insert ya confirmado y la
// repetición (idempotencia). Las columnas de token van en '' como las deja GoTrue.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { mailUnico } from '../../soporte/correo';
import { alumnoDe, borrarPorMail, confirmarUsuarioAuth, crearUsuarioAuth } from './ayuda';

const creados: string[] = [];
const mail = (p: string) => {
  const m = mailUnico(`b04.${p}`);
  creados.push(m);
  return m;
};

afterEach(async () => {
  await borrarPorMail(creados.splice(0));
});
afterAll(cerrar);

describe('Google simulado como GoTrue (CA-01 rama de datos, CA-02 precarga)', () => {
  it('CA-02_insert_sin_confirmar_no_crea_alumno_y_el_update_confirmado_lo_crea_con_el_nombre_de_google', async () => {
    const m = mail('google');
    const id = await crearUsuarioAuth({ mail: m, confirmado: false, meta: { full_name: 'Ana Google', name: 'Ana G.' } });
    expect(await alumnoDe(id), 'SEC-14: sin confirmar no hay alumno').toBeNull();
    await confirmarUsuarioAuth(id);
    expect(await alumnoDe(id)).toMatchObject({ estado: 'ficha_incompleta', nombre: 'Ana Google', mail: m });
  });

  it('CA-01_insert_ya_confirmado_crea_el_alumno_y_repetir_la_confirmacion_es_idempotente', async () => {
    const m = mail('confirmado');
    const id = await crearUsuarioAuth({ mail: m, confirmado: true });
    const a = await alumnoDe(id);
    expect(a).toMatchObject({ estado: 'ficha_incompleta', nombre: null, mail: m });
    await confirmarUsuarioAuth(id);
    await confirmarUsuarioAuth(id);
    await sql('update auth.users set last_sign_in_at = now() where id = $1', [id]);
    const filas = await sql('select id from public.alumno where user_id = $1', [id]);
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe(a!.id);
  });

  it('SEC-09_el_nombre_de_google_se_recorta_a_100_caracteres', async () => {
    const id = await crearUsuarioAuth({ mail: mail('largo'), confirmado: false, meta: { full_name: 'y'.repeat(180) } });
    await confirmarUsuarioAuth(id);
    expect((await alumnoDe(id))!.nombre).toHaveLength(100);
  });
});

describe('Usuario sin confirmar no vincula (SEC-14)', () => {
  it('SEC-14_un_usuario_sin_confirmar_no_se_vincula_a_un_alumno_con_su_mail_ni_crea_otro', async () => {
    const m = mail('sinvinculo');
    const [{ id: profesor }] = await sql<{ id: string }>('select id from public.profesor');
    const [alta] = await sql<{ id: string }>(
      "insert into public.alumno (profesor_id, estado, nombre, mail) values ($1, 'aprobado', 'Alta del profesor', $2) returning id",
      [profesor, m],
    );
    const id = await crearUsuarioAuth({ mail: m, confirmado: false });
    expect(await sql('select 1 from public.alumno where user_id = $1', [id])).toEqual([]);
    expect(await sql('select user_id from public.alumno where id = $1', [alta.id])).toEqual([{ user_id: null }]);
    expect(await sql('select 1 from public.alumno where lower(mail::text) = $1', [m.toLowerCase()])).toHaveLength(1);
    await confirmarUsuarioAuth(id);
    expect(await sql('select user_id from public.alumno where id = $1', [alta.id])).toEqual([{ user_id: id }]);
  });

  it('SEC-15_un_usuario_confirmado_con_otro_mail_no_se_vuelve_profesor', async () => {
    const id = await crearUsuarioAuth({ mail: mail('noprof'), confirmado: true });
    expect(await sql('select 1 from public.profesor where user_id = $1', [id])).toEqual([]);
    expect(await alumnoDe(id)).not.toBeNull();
  });
});

describe('Revinculación tras borrar el usuario de Auth (ADR-013)', () => {
  it('ALU-01_el_alumno_conserva_estado_e_id_al_volver_a_ingresar_con_el_mismo_mail', async () => {
    const m = mail('revincula');
    const id1 = await crearUsuarioAuth({ mail: m, confirmado: true });
    const a = (await alumnoDe(id1))!;
    await sql("update public.alumno set estado = 'aprobado', nombre = 'Aprobado Previo' where id = $1", [a.id]);
    await sql('delete from auth.users where id = $1', [id1]);
    expect(await sql('select user_id from public.alumno where id = $1', [a.id])).toEqual([{ user_id: null }]);
    const id2 = await crearUsuarioAuth({ mail: m.toUpperCase(), confirmado: true });
    expect(await alumnoDe(id2)).toMatchObject({ id: a.id, estado: 'aprobado', nombre: 'Aprobado Previo' });
    expect(await sql('select 1 from public.alumno where lower(mail::text) = $1', [m.toLowerCase()])).toHaveLength(1);
  });
});
