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
    for (const rol of ['anon', 'alumno', 'profesor'] as const) {
      const r = await rest(rol, 'PATCH', 'reloj_prueba?id=eq.1', { ahora: '2020-01-01T00:00:00Z' }, { 'Content-Profile': 'privado' });
      expect([401, 403, 404, 406], `${rol}: ${r.status}`).toContain(r.status);
    }
    const [r] = await sql<{ ahora: Date | null }>('select ahora from privado.reloj_prueba');
    expect(r.ahora).toBeNull();
  });
});

describe('ADR-015 privado.configurar_profesor', () => {
  it('ADR-015_la_migracion_deja_una_unica_fila_de_profesor_y_el_indice_impide_otra', async () => {
    const [{ n }] = await sql<{ n: string }>('select count(*)::text n from public.profesor');
    expect(n).toBe('1');
    await expect(sql('insert into public.profesor default values')).rejects.toThrow(/profesor_fila_unica|duplicate/);
  });

  it('ADR-015_el_seed_fijo_el_mail_de_prueba', async () => {
    const [p] = await sql<{ mail: string; nombre: string }>('select mail::text, nombre from public.profesor');
    expect(p.mail).toBe('profesor@example.test');
    expect(p.nombre).toBe('Profesor de Prueba');
  });

  it('ADR-015_es_idempotente', async () => {
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba')");
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba')");
    const [p] = await sql<{ mail: string }>('select mail::text from public.profesor');
    expect(p.mail).toBe('profesor@example.test');
  });

  it('ADR-015_valida_mail_y_nombre', async () => {
    await expect(sql("select privado.configurar_profesor('no-es-un-mail', 'X')")).rejects.toThrow(/DATOS_INVALIDOS/);
    await expect(sql("select privado.configurar_profesor('a@example.test', '  ')")).rejects.toThrow(/DATOS_INVALIDOS/);
  });

  it('ADR-015_si_ya_hay_otro_usuario_vinculado_falla_y_no_cambia_nada', async () => {
    await sesionDe('profesor'); // vincula al usuario confirmado con profesor.user_id
    await expect(sql("select privado.configurar_profesor('otro.profesor@example.test', 'Otro')")).rejects.toThrow(/PROFESOR_YA_VINCULADO/);
    const [p] = await sql<{ mail: string }>('select mail::text from public.profesor');
    expect(p.mail).toBe('profesor@example.test');
  });

  it('ADR-015_borra_la_ficha_incompleta_que_el_ingreso_haya_creado_al_profesor', async () => {
    const s = await sesionDe('profesor');
    await sql(
      "insert into public.alumno (profesor_id, user_id, mail) values ((select id from public.profesor), $1, 'profesor@example.test') on conflict (user_id) do update set estado = 'ficha_incompleta'",
      [s.userId],
    );
    await sql("select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba')");
    expect(await sql('select 1 from public.alumno where user_id = $1', [s.userId])).toEqual([]);
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
