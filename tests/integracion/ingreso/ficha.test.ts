// B04 · T04.4 · ficha, personas a cargo y tope de fichas por la API (CA-02, CA-05 rama ALU-06, CA-43, ALU-13, SEC-09,
// SEC-10, SEC-14, SEC-29; casos T-ALU-04, T-ALU-05, T-ALU-15, T-WEB-01). Sesiones reales por código de Mailpit; el
// reloj de la aplicación se fija por la base (ADR-014) y se restaura siempre al terminar cada prueba.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { mailUnico } from '../../soporte/correo';
import { fijarReloj } from '../../soporte/reloj';
import { ingresarPorCodigo, rest, rpc, sesionDe, type RespuestaApi } from '../../soporte/usuarios';
import { entorno } from '../../soporte/entorno';
import { alumnoDe, borrarPorMail, restaurarReloj } from './ayuda';

const AHORA = '2026-11-02T15:00:00Z';
const FICHA = { p_nombre: 'Ana Pérez', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_como_llego: 'Amigos' };
const creados: string[] = [];
const fillers: string[] = [];

/** RPC con el token de una sesión de `ingresarPorCodigo`. */
async function rpcCon(token: string, nombre: string, args: Record<string, unknown>): Promise<RespuestaApi> {
  const r = await fetch(`${entorno().apiUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: entorno().anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  return { status: r.status, cuerpo: t ? JSON.parse(t) : null };
}

async function usuarioNuevo(p: string) {
  const mail = mailUnico(`b04.${p}`);
  creados.push(mail);
  const s = await ingresarPorCodigo(mail);
  return { mail, ...s };
}

beforeAll(async () => {
  await sesionDe('alumno');
  await sesionDe('alumnoB');
  await sesionDe('ficha_incompleta');
  await sesionDe('rechazado');
  await sesionDe('profesor');
}, 300_000);

afterEach(async () => {
  await restaurarReloj();
  if (fillers.length) await sql('delete from public.alumno where id = any($1::uuid[])', [fillers.splice(0)]);
  await borrarPorMail(creados.splice(0));
});
afterAll(cerrar);

describe('CA-02 ficha obligatoria', () => {
  it('CA-02_completar_ficha_con_los_4_campos_pasa_a_pendiente_y_fija_ficha_completada_en', async () => {
    const u = await usuarioNuevo('ficha');
    const antes = await rpcCon(u.accessToken, 'sesion_actual', {});
    expect(antes.cuerpo).toMatchObject({ rol: 'alumno', estado: 'ficha_incompleta', motivo_rechazo: null });
    const r = await rpcCon(u.accessToken, 'completar_ficha', FICHA);
    expect(r).toEqual({ status: 200, cuerpo: { estado: 'pendiente' } });
    const [f] = await sql<{ estado: string; ficha_completada_en: Date | null }>('select estado, ficha_completada_en from public.alumno where user_id = $1', [u.userId]);
    expect(f.estado).toBe('pendiente');
    expect(f.ficha_completada_en).not.toBeNull();
    expect((await rpcCon(u.accessToken, 'completar_ficha', FICHA)).status, 'repetir la ficha').toBe(409);
  });

  it.each([
    ['p_nombre', ''],
    ['p_telefono', ''],
    ['p_telefono', 'abc'],
    ['p_fecha_nacimiento', '2999-01-01'],
    ['p_como_llego', ''],
    ['p_nombre', 'x'.repeat(101)],
  ])('T-ALU-05_sin_o_con_%s_invalido_(%s)_se_rechaza_con_422_y_el_estado_no_cambia', async (campo, valor) => {
    const r = await rpc('ficha_incompleta', 'completar_ficha', { ...FICHA, [campo]: valor });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.cuerpo)).toContain(campo);
    const s = await sesionDe('ficha_incompleta');
    expect((await alumnoDe(s.userId!))!.estado).toBe('ficha_incompleta');
  });

  it('SEC-14_un_usuario_de_Auth_sin_alumno_vinculado_recibe_401_en_sesion_actual', async () => {
    // Usuario sin confirmar el mail: no tiene fila de alumno (se prueba con el token de un usuario confirmado y borrado).
    const u = await usuarioNuevo('sinvinculo');
    await sql('delete from public.alumno where user_id = $1', [u.userId]);
    const r = await rpcCon(u.accessToken, 'sesion_actual', {});
    expect(r.status).toBe(401);
  });

  it('WEB-03_sesion_actual_trae_motivo_rechazo_solo_si_esta_rechazado', async () => {
    const rech = await rpc('rechazado', 'sesion_actual');
    expect(rech.cuerpo).toMatchObject({ estado: 'rechazado', motivo_rechazo: 'Motivo de prueba' });
    for (const rol of ['ficha_incompleta', 'pendiente', 'alumno'] as const) {
      const r = await rpc(rol, 'sesion_actual');
      expect((r.cuerpo as { motivo_rechazo: unknown }).motivo_rechazo, rol).toBeNull();
    }
    // Un resto de motivo en una cuenta que no está rechazada no se expone.
    const a = await sesionDe('alumno');
    await sql("update public.alumno set motivo_estado = 'Resto' where id = $1", [a.alumnoId]);
    try {
      expect(((await rpc('alumno', 'sesion_actual')).cuerpo as { motivo_rechazo: unknown }).motivo_rechazo).toBeNull();
    } finally {
      await sql('update public.alumno set motivo_estado = null where id = $1', [a.alumnoId]);
    }
  });
});

describe('CA-05 rama ALU-06 personas a cargo (T-ALU-15, SEC-29)', () => {
  it('ALU-06_el_alumno_da_de_alta_edita_y_lista_sus_personas_a_cargo', async () => {
    const a = await sesionDe('alumno');
    const alta = await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'Hija de prueba', p_fecha_nacimiento: '2015-05-05' });
    expect(alta.status).toBe(200);
    const id = (alta.cuerpo as { id: string }).id;
    try {
      expect((await rpc('alumno', 'guardar_persona_a_cargo', { p_id: id, p_nombre: 'Hija editada', p_fecha_nacimiento: '2015-05-06' })).status).toBe(200);
      const l = await rest('alumno', 'GET', `persona_a_cargo?id=eq.${id}&select=*`);
      expect(l.cuerpo).toEqual([{ id, profesor_id: expect.any(String), alumno_id: a.alumnoId, nombre: 'Hija editada', fecha_nacimiento: '2015-05-06' }]);
      // Otro alumno: cero filas, no edita (403) y no inserta directo.
      expect((await rest('alumnoB', 'GET', `persona_a_cargo?id=eq.${id}`)).cuerpo).toEqual([]);
      expect((await rpc('alumnoB', 'guardar_persona_a_cargo', { p_id: id, p_nombre: 'Intruso', p_fecha_nacimiento: '2015-05-06' })).status).toBe(403);
      const b = await sesionDe('alumnoB');
      const directo = await rest('alumnoB', 'POST', 'persona_a_cargo', { profesor_id: (await sql<{ id: string }>('select id from public.profesor'))[0].id, alumno_id: b.alumnoId, nombre: 'Directo' });
      expect([401, 403]).toContain(directo.status);
      expect((await rest('alumnoB', 'PATCH', `persona_a_cargo?id=eq.${id}`, { nombre: 'X' })).status).toBeGreaterThanOrEqual(400);
      expect((await sql<{ nombre: string }>('select nombre from public.persona_a_cargo where id = $1', [id]))[0].nombre).toBe('Hija editada');
    } finally {
      await sql('delete from public.persona_a_cargo where id = $1', [id]);
    }
  });

  it('ALU-06_con_la_ficha_incompleta_no_se_cargan_personas_a_cargo_y_un_id_inexistente_da_404', async () => {
    const r = await rpc('ficha_incompleta', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'Hija', p_fecha_nacimiento: '2015-05-05' });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.cuerpo)).toContain('FICHA_INCOMPLETA');
    const n = await rpc('alumno', 'guardar_persona_a_cargo', { p_id: '00000000-0000-0000-0000-000000000099', p_nombre: 'X', p_fecha_nacimiento: '2015-05-05' });
    expect(n.status).toBe(404);
  });

  it('SEC-09_persona_a_cargo_sin_nombre_o_con_nacimiento_futuro_da_422', async () => {
    expect((await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: ' ', p_fecha_nacimiento: '2015-05-05' })).status).toBe(422);
    expect((await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'Futuro', p_fecha_nacimiento: '2999-01-01' })).status).toBe(422);
  });

  it('SEC-29_la_persona_a_cargo_guarda_solo_nombre_y_fecha_de_nacimiento', async () => {
    const cols = await sql<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'persona_a_cargo' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(['alumno_id', 'fecha_nacimiento', 'id', 'nombre', 'profesor_id']);
  });
});

describe('CA-43 tope de fichas por hora (ALU-13, SEC-10) con reloj fijo', () => {
  it('CA-43_con_10_fichas_en_60_min_la_11_da_429_LIMITE_EXCEDIDO_sin_cambiar_estado_ni_mail_y_a_los_61_min_pasa', async () => {
    await fijarReloj(AHORA);
    await sql('update public.alumno set ficha_completada_en = null where ficha_completada_en is not null');
    const [{ id: profesor }] = await sql<{ id: string }>('select id from public.profesor');
    const rellenos = await sql<{ id: string }>(
      `insert into public.alumno (profesor_id, estado, nombre, telefono, fecha_nacimiento, como_llego, ficha_completada_en)
       select $1, 'pendiente', 'Relleno B04 ' || g, '+598 99123456', '2000-01-01', 'Amigos', '2026-11-02T14:55:00Z'::timestamptz
         from generate_series(1, 10) g returning id`,
      [profesor],
    );
    fillers.push(...rellenos.map((r) => r.id));
    const [{ n: mailsAntes }] = await sql<{ n: string }>('select count(*)::text n from public.mail_salida');
    const u = await usuarioNuevo('tope');

    const r = await rpcCon(u.accessToken, 'completar_ficha', FICHA);
    expect(r.status).toBe(429);
    expect(r.cuerpo).toMatchObject({ message: 'LIMITE_EXCEDIDO' });
    expect(JSON.parse((r.cuerpo as { details: string }).details)).toEqual({ tope: 'fichas', limite: 10 });
    expect((await alumnoDe(u.userId))!.estado).toBe('ficha_incompleta');
    expect((await sql<{ n: string }>('select count(*)::text n from public.mail_salida'))[0].n).toBe(mailsAntes);

    // 61 minutos después de las fichas anteriores ya no cuentan.
    await fijarReloj('2026-11-02T15:56:00Z');
    const ok = await rpcCon(u.accessToken, 'completar_ficha', FICHA);
    expect(ok).toEqual({ status: 200, cuerpo: { estado: 'pendiente' } });
  });
});

describe('ADR-013 revinculación por la API', () => {
  it('ALU-01_tras_borrar_el_usuario_de_Auth_el_alumno_vuelve_a_ingresar_con_su_estado', async () => {
    const mail = mailUnico('b04.revincula');
    creados.push(mail);
    const u1 = await ingresarPorCodigo(mail);
    await rpcCon(u1.accessToken, 'completar_ficha', FICHA);
    const antes = (await alumnoDe(u1.userId))!;
    await sql('delete from auth.users where id = $1', [u1.userId]);
    const u2 = await ingresarPorCodigo(mail);
    expect(u2.userId).not.toBe(u1.userId);
    const s = await rpcCon(u2.accessToken, 'sesion_actual', {});
    expect(s.cuerpo).toMatchObject({ alumno_id: antes.id, estado: 'pendiente', nombre: 'Ana Pérez' });
  });
});
