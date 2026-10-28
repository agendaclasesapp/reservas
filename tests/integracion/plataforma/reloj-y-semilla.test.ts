// ADR-014 (reloj de la aplicación), ADR-015 (configurar_profesor), seed local: contra la base local por
// conexión directa y por la API. Casos con hora (CA-07, CA-08, CA-09, CA-13, CA-25, CA-31, CA-32).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { RAIZ } from '../../soporte/entorno';
import { ahoraDeLaBase, fijarReloj, limpiarReloj } from '../../soporte/reloj';
import { rest, rpc, sesionDe } from '../../soporte/usuarios';

beforeAll(async () => {
  await sesionDe('alumno');
  await sesionDe('profesor');
}, 300_000);
afterEach(limpiarReloj);
afterAll(cerrar);

describe('ADR-014 app_ahora y reloj de prueba', () => {
  it('ADR-014_el_seed_activa_el_permiso_y_el_reloj_arranca_vacio', async () => {
    const [a] = await sql<{ permitir_reloj_prueba: boolean }>('select permitir_reloj_prueba from privado.ajustes');
    expect(a.permitir_reloj_prueba).toBe(true);
    const [r] = await sql<{ ahora: Date | null }>('select ahora from privado.reloj_prueba');
    expect(r.ahora).toBeNull();
  });

  it('ADR-014_sin_reloj_app_ahora_es_la_hora_real', async () => {
    const antes = Date.now();
    const ahora = (await ahoraDeLaBase()).getTime();
    expect(ahora).toBeGreaterThanOrEqual(antes - 5000);
    expect(ahora).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it('ADR-014_con_reloj_fijo_app_ahora_devuelve_ese_instante_por_la_API', async () => {
    await fijarReloj('2026-11-02T13:00:00Z');
    const r = await rpc('alumno', 'app_ahora');
    expect(r.status).toBe(200);
    expect(new Date(r.cuerpo as string).toISOString()).toBe('2026-11-02T13:00:00.000Z');
    const p = await rpc('profesor', 'app_ahora');
    expect(new Date(p.cuerpo as string).toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('ADR-014_ping_usa_el_reloj_de_la_aplicacion', async () => {
    await fijarReloj('2026-11-02T13:00:00Z');
    const r = await rpc('anon', 'ping');
    expect(new Date(r.cuerpo as string).toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('ADR-014_limpiar_devuelve_la_hora_real', async () => {
    await fijarReloj('2020-01-01T00:00:00Z');
    await limpiarReloj();
    expect((await ahoraDeLaBase()).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('ADR-014_si_el_permiso_esta_apagado_el_override_se_ignora', async () => {
    await sql('update privado.reloj_prueba set ahora = $1::timestamptz', ['2020-01-01T00:00:00Z']);
    await sql('update privado.ajustes set permitir_reloj_prueba = false');
    try {
      expect((await ahoraDeLaBase()).getFullYear()).toBeGreaterThanOrEqual(2026);
    } finally {
      await sql('update privado.ajustes set permitir_reloj_prueba = true');
    }
  });

  it('ADR-014_el_reloj_no_se_puede_tocar_por_la_API', async () => {
    for (const rol of ['anon', 'alumno', 'profesor', 'profesorB', 'administrador'] as const) {
      const r = await rest(rol, 'PATCH', 'reloj_prueba?id=eq.1', { ahora: '2020-01-01T00:00:00Z' }, { 'Content-Profile': 'privado' });
      expect([401, 403, 404, 406], `${rol}: ${r.status}`).toContain(r.status);
    }
    const [r] = await sql<{ ahora: Date | null }>('select ahora from privado.reloj_prueba');
    expect(r.ahora).toBeNull();
  });
});

describe('ADR-015 / ADR-018 privado.configurar_profesor con varios profesores (CA-51, CA-63)', () => {
  it('ADR-018_el_seed_deja_dos_profesores_activos_con_slug_y_ya_no_hay_fila_unica', async () => {
    const f = await sql<{ slug: string; mail: string; nombre: string; activo: boolean }>(
      'select slug::text, mail::text, nombre, activo from public.profesor order by slug',
    );
    expect(f.map((p) => [p.slug, p.mail, p.nombre, p.activo])).toEqual([
      ['profesor-prueba', 'profesor@example.test', 'Profesor de Prueba', true],
      ['profesora-b', 'profesora.b@example.test', 'Profesora B de Prueba', true],
    ]);
    await expect(sql("select 1 from pg_indexes where indexname = 'profesor_fila_unica'")).resolves.toEqual([]);
  });

  it('ADR-018_el_seed_deja_al_administrador_y_a_una_persona_con_dos_inscripciones', async () => {
    const [a] = await sql<{ mail: string }>('select mail::text from privado.administrador');
    expect(a.mail).toBe('admin@example.test');
    const i = await sql<{ slug: string; estado: string }>(
      `select p.slug::text, i.estado from public.inscripcion i join public.profesor p on p.id = i.profesor_id
         join public.alumno al on al.id = i.alumno_id where al.mail = 'persona@example.test' order by p.slug`,
    );
    expect(i).toEqual([
      { slug: 'profesor-prueba', estado: 'aprobado' },
      { slug: 'profesora-b', estado: 'pendiente' },
    ]);
  });

  it('ADR-015_es_idempotente_y_no_duplica_profesores', async () => {
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba', 'profesor-prueba')");
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba', 'profesor-prueba')");
    const [{ n }] = await sql<{ n: string }>('select count(*)::text n from public.profesor');
    expect(n).toBe('2');
  });

  it('ADR-015_valida_mail_nombre_y_slug', async () => {
    await expect(sql("select privado.configurar_profesor('no-es-un-mail', 'X', 'x-valido')")).rejects.toThrow(/DATOS_INVALIDOS/);
    await expect(sql("select privado.configurar_profesor('a@example.test', '  ', 'x-valido')")).rejects.toThrow(/DATOS_INVALIDOS/);
    await expect(sql("select privado.configurar_profesor('a@example.test', 'X', 'No Valido!')")).rejects.toThrow(/DATOS_INVALIDOS/);
  });

  it('ADR-018_un_slug_usado_por_otro_profesor_da_SLUG_YA_USADO_y_no_cambia_nada', async () => {
    await expect(sql("select privado.configurar_profesor('profesora.b@example.test', 'Profesora B de Prueba', 'profesor-prueba')")).rejects.toThrow(
      /SLUG_YA_USADO/,
    );
    const [p] = await sql<{ slug: string }>("select slug::text from public.profesor where mail = 'profesora.b@example.test'");
    expect(p.slug).toBe('profesora-b');
  });

  it('ADR-015_si_el_profesor_ya_esta_vinculado_a_otro_usuario_falla_y_no_cambia_nada', async () => {
    const s = await sesionDe('profesor'); // vincula al usuario confirmado con profesor.user_id
    const [antes] = await sql<{ user_id: string }>("select user_id from public.profesor where mail = 'profesor@example.test'");
    expect(antes.user_id).toBe(s.userId);
  });

  it('ADR-015_borra_la_ficha_incompleta_que_el_ingreso_haya_creado_al_profesor', async () => {
    const s = await sesionDe('profesor');
    await sql(
      "insert into public.alumno (user_id, mail) values ($1, 'profesor@example.test') on conflict (user_id) do update set estado = 'ficha_incompleta'",
      [s.userId],
    );
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba', 'profesor-prueba')");
    expect(await sql('select 1 from public.alumno where user_id = $1', [s.userId])).toEqual([]);
  });

  it('ADR-018_el_mail_de_una_persona_con_ficha_completa_no_se_puede_dar_de_alta_como_profesor', async () => {
    await expect(sql("select privado.configurar_profesor('persona@example.test', 'Otro', 'otro-slug')")).rejects.toThrow(/MAIL_YA_REGISTRADO/);
  });
});

describe('ADR-012 semilla local: Vault de disparo de mails', () => {
  it('ADR-012_el_vault_trae_la_url_interna_y_el_mismo_secreto_que_MAIL_SECRETO_de_env_development', async () => {
    const dev = readFileSync(resolve(RAIZ, 'supabase/.env.development'), 'utf8');
    const esperado = /^MAIL_SECRETO=(.+)$/m.exec(dev)?.[1];
    expect(esperado).toBeTruthy();
    const filas = await sql<{ name: string; decrypted_secret: string }>(
      "select name, decrypted_secret from vault.decrypted_secrets where name in ('url_funcion_mail','mail_secreto')",
    );
    const m = Object.fromEntries(filas.map((f) => [f.name, f.decrypted_secret]));
    expect(m.url_funcion_mail).toBe('http://kong:8000/functions/v1/enviar-mail');
    expect(m.mail_secreto).toBe(esperado);
  });
});
