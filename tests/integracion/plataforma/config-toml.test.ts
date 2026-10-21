// supabase/config.toml (SEC-13, SEC-04, SEC-12, ADR-007, ADR-012, H-005): reglas de Auth y de funciones.
// Casos: T-ALU-01 (código de 6 dígitos), NFR-02 (ningún 127.0.0.1 fuera de supabase/.env.development).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';
import { parsearToml } from '../../soporte/toml';

const texto = readFileSync(resolve(RAIZ, 'supabase/config.toml'), 'utf8');
const t = parsearToml(texto);

describe('SEC-13 config.toml de Auth', () => {
  it('SEC-13_enable_confirmations_true', () => {
    expect(t['auth.email']?.enable_confirmations).toBe(true);
  });
  it('SEC-13_otp_de_6_digitos_y_vence_en_600s_como_maximo', () => {
    expect(t['auth.email']?.otp_length).toBe(6);
    expect(Number(t['auth.email']?.otp_expiry)).toBeLessThanOrEqual(600);
    expect(Number(t['auth.email']?.otp_expiry)).toBeGreaterThan(0);
  });
  it('SEC-13_max_frequency_60s', () => {
    expect(t['auth.email']?.max_frequency).toBe('60s');
  });
  it('SEC-13_rate_limit_explicito_con_anonymous_users_mayor_o_igual_a_1', () => {
    const rl = t['auth.rate_limit'];
    expect(rl, 'falta la sección [auth.rate_limit]').toBeDefined();
    expect(Number(rl?.anonymous_users)).toBeGreaterThanOrEqual(1);
    for (const clave of ['email_sent', 'sign_in_sign_ups', 'token_verifications']) {
      expect(Number(rl?.[clave]), `[auth.rate_limit] ${clave} explícito`).toBeGreaterThan(0);
    }
  });
  it('SEC-13_sin_smtp_propio_de_auth', () => {
    expect(t['auth.email.smtp'], 'no debe haber [auth.email.smtp] activo (ADR-007)').toBeUndefined();
  });
  it('SEC-13_site_url_y_redirecciones_por_env_y_nunca_127_0_0_1', () => {
    expect(String(t.auth?.site_url)).toMatch(/^env\(\w+\)$/);
    const redirs = t.auth?.additional_redirect_urls as string[];
    expect(redirs.length).toBeGreaterThan(0);
    for (const r of redirs) expect(r).toMatch(/^env\(\w+\)$/);
  });
  it('SEC-13_las_dos_plantillas_dicen_Tu_codigo_de_ingreso', () => {
    for (const s of ['auth.email.template.confirmation', 'auth.email.template.magic_link']) {
      expect(t[s]?.subject, s).toBe('Tu código de ingreso');
      expect(String(t[s]?.content_path), s).toMatch(/supabase\/templates\//);
    }
  });
  it('SEC-13_mfa_totp_y_pooler_iguales_al_proyecto', () => {
    expect(t['db.pooler']?.pool_mode).toBe('transaction');
    expect(t['db.pooler']?.default_pool_size).toBe(15);
    expect(t['db.pooler']?.max_client_conn).toBe(600);
    expect(t['storage.vector']?.enabled).toBe(false);
    expect(t['auth.mfa.totp']?.enroll_enabled).toBe(true);
    expect(t['auth.mfa.totp']?.verify_enabled).toBe(true);
  });
  it('SEC-13_el_bloque_vault_del_spike_no_cae_dentro_de_db_pooler', () => {
    const permitidas = new Set(['enabled', 'port', 'pool_mode', 'default_pool_size', 'max_client_conn']);
    for (const k of Object.keys(t['db.pooler'] ?? {})) expect(permitidas.has(k), `clave inesperada en [db.pooler]: ${k}`).toBe(true);
    expect(texto).not.toMatch(/^\s*(url_funcion_mail|mail_secreto)\s*=/m);
  });
});

describe('SEC-04 y S01 config.toml de API y funciones', () => {
  it('SEC-04_privado_no_esta_en_los_esquemas_de_la_API', () => {
    const esquemas = t.api?.schemas as string[];
    expect(esquemas).toContain('public');
    expect(esquemas).not.toContain('privado');
  });
  it('S01_enviar_mail_sin_verify_jwt', () => {
    // La función se declara en B03 (con el bloque y sin el código `supabase start` falla): hasta entonces el bloque
    // va comentado con verify_jwt = false; declarado, debe ser false (SEC-30).
    const declarado = t['functions.enviar-mail'];
    if (declarado) expect(declarado.verify_jwt).toBe(false);
    else expect(texto).toMatch(/^# \[functions\.enviar-mail\]\s+# verify_jwt = false/m);
  });
  it('S01_secretos_de_edge_runtime_por_env', () => {
    const s = t['edge_runtime.secrets'] ?? {};
    for (const n of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_SECRETO', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS']) {
      expect(s[n], n).toBe(`env(${n})`);
    }
  });
});

describe('NFR-02 / H-005 valores locales solo en supabase/.env.development', () => {
  it('ningun_127_0_0_1_en_config_toml_fuera_del_studio_local', () => {
    let seccion = '';
    const hallazgos: string[] = [];
    texto.split(/\r?\n/).forEach((l, i) => {
      const s = /^\s*\[([^\]]+)\]/.exec(l);
      if (s) seccion = s[1];
      if (/^\s*#/.test(l)) return;
      // [studio] api_url es el valor por defecto del CLI (solo local, no va a `config push`).
      if (/127\.0\.0\.1|localhost/.test(l) && seccion !== 'studio') hallazgos.push(`config.toml:${i + 1} [${seccion}] ${l.trim()}`);
    });
    expect(hallazgos).toEqual([]);
  });
  it('supabase_env_development_versionado_y_supabase_env_ignorado', () => {
    const ign = readFileSync(resolve(RAIZ, '.gitignore'), 'utf8');
    expect(ign).toMatch(/^!supabase\/\.env\.development$/m);
    expect(ign).toMatch(/^supabase\/\.env$/m);
    expect(() => readFileSync(resolve(RAIZ, 'supabase/.env.development'), 'utf8')).not.toThrow();
  });
  it('env_development_define_lo_que_config_toml_pide_por_env', () => {
    const dev = readFileSync(resolve(RAIZ, 'supabase/.env.development'), 'utf8');
    const pedidas = new Set([...texto.matchAll(/env\((\w+)\)/g)].map((m) => m[1]));
    for (const n of ['RTC_SITE_URL', 'RTC_REDIRECT_URL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_SECRETO', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS']) {
      expect(pedidas.has(n), `config.toml usa env(${n})`).toBe(true);
      expect(dev, `supabase/.env.development define ${n}`).toMatch(new RegExp(`^${n}=`, 'm'));
    }
    expect(dev).toMatch(/^SMTP_HOST=inbucket$/m);
    expect(dev).toMatch(/^SMTP_PORT=1025$/m);
    expect(dev).toMatch(/^SMTP_TLS=false$/m);
  });
});
