// CA-35 / NFR-02 (T-NFR-01, T-NFR-02): ni el repositorio ni `dist/` contienen la contraseña de aplicación de Gmail,
// el secreto OAuth de Google ni la clave de servicio; y los escaneos detectan un secreto sembrado (eficacia).
// Los secretos falsos se arman al vuelo: ninguno aparece literal en el repositorio.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asegurarDist } from '../../soporte/dist';
import { RAIZ } from '../../soporte/entorno';
import { escanearDirectorio, escanearRepo, escanearTexto, jwtFalso } from '../../soporte/secretos';

const REF = 'refdeprueba';
const escaneoDist = (dir: string) =>
  spawnSync(process.execPath, [resolve(RAIZ, 'scripts/seguridad/escanear-dist.mjs'), dir, '--ref', REF], { encoding: 'utf8', cwd: RAIZ });

describe('CA-35 repositorio sin secretos (T-NFR-01, T-NFR-02)', () => {
  it('CA-35_el_repositorio_no_tiene_gmail_oauth_ni_service_role', () => {
    expect(escanearRepo(RAIZ)).toEqual([]);
  });
});

describe('CA-35 eficacia del detector propio (secreto sembrado)', () => {
  const sembrados: Record<string, string> = {
    service_role_jwt: `const k = "${jwtFalso('service_role')}";`,
    sb_secret: `KEY=sb_secret_${'A1b2'.repeat(6)}`,
    oauth_google: `secret: GOCSPX-${'Zy9x'.repeat(6)}`,
    gmail_asignacion: `GMAIL_APP_PASSWORD=${'abcd'.repeat(4)}`,
    gmail_con_espacios: `app password: "${['abcd', 'efgh', 'ijkl', 'mnop'].join(' ')}"`,
  };
  for (const [nombre, texto] of Object.entries(sembrados)) {
    it(`CA-35_detecta_${nombre}`, () => {
      expect(escanearTexto('sembrado.txt', texto).length).toBeGreaterThan(0);
    });
  }
  it('CA-35_no_marca_la_anon_ni_las_referencias_por_env', () => {
    expect(escanearTexto('a.js', `x="${jwtFalso('anon', { ref: REF })}"`)).toEqual([]);
    expect(escanearTexto('config.toml', 'GMAIL_APP_PASSWORD = "env(GMAIL_APP_PASSWORD)"')).toEqual([]);
    expect(escanearTexto('wf.yml', 'GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}')).toEqual([]);
  });
});

describe('CA-35 / H-008 escanear-dist.mjs con un dist de prueba (scripts/seguridad)', () => {
  let base: string;
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'rtc-dist-'));
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  function dist(nombre: string, js: string): string {
    const d = join(base, nombre);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.html'), '<!doctype html><html><body></body></html>');
    writeFileSync(join(d, 'app.js'), js);
    return d;
  }

  it('H-008_un_dist_con_JWT_service_role_falso_falla', () => {
    const r = escaneoDist(dist('service', `export const k="${jwtFalso('service_role', { ref: REF })}";`));
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
  });
  it('H-008_un_dist_con_la_anon_key_pasa', () => {
    const r = escaneoDist(dist('anon', `export const k="${jwtFalso('anon', { ref: REF })}";`));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
  it('H-008_un_dist_con_secreto_OAuth_o_sb_secret_falla', () => {
    expect(escaneoDist(dist('oauth', `x="GOCSPX-${'Zy9x'.repeat(6)}"`)).status).not.toBe(0);
    expect(escaneoDist(dist('sbsecret', `x="sb_secret_${'A1b2'.repeat(6)}"`)).status).not.toBe(0);
  });
  it('H-008_un_dist_con_source_map_o_env_falla', () => {
    const d = dist('map', 'x=1');
    writeFileSync(join(d, 'app.js.map'), '{}');
    expect(escaneoDist(d).status).not.toBe(0);
    const e = dist('env', 'x=1');
    writeFileSync(join(e, '.env.local'), 'A=1');
    expect(escaneoDist(e).status).not.toBe(0);
  });
  it('CA-35_el_detector_propio_coincide_con_el_del_pipeline_sobre_los_mismos_dist', () => {
    expect(escanearDirectorio(join(base, 'service')).length).toBeGreaterThan(0);
    expect(escanearDirectorio(join(base, 'anon'))).toEqual([]);
  });
});

describe('CA-35 dist/ construido sin secretos', () => {
  beforeAll(() => {
    asegurarDist();
  }, 300_000);
  it('CA-35_dist_no_tiene_gmail_oauth_ni_service_role_segun_el_detector_propio', async () => {
    const { DIST } = await import('../../soporte/dist');
    expect(escanearDirectorio(DIST)).toEqual([]);
  });
  it('CA-35_dist_pasa_escanear_dist_mjs_del_pipeline', async () => {
    const { DIST } = await import('../../soporte/dist');
    // Con la URL local de Supabase el ref de producción no existe: solo se exige que no haya service_role ni secretos
    // (un JWT anon con otro ref es lo único tolerado; en CI/Pages el ref real lo verifica verificar-publicado).
    const r = spawnSync(process.execPath, [resolve(RAIZ, 'scripts/seguridad/escanear-dist.mjs'), DIST, '--ref', REF], { encoding: 'utf8', cwd: RAIZ, env: process.env });
    const sinRef = /JWT anon con ref=|JWT anon sin ref esperado/;
    const graves = (r.stdout + r.stderr).split('\n').filter((l) => /service_role|secreto|\.map|\.env|supabase\//.test(l));
    expect(graves, r.stdout + r.stderr).toEqual([]);
    if (r.status !== 0) expect(r.stdout + r.stderr).toMatch(sinRef);
  });
});
