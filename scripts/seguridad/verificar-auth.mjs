#!/usr/bin/env node
// Verifica la configuracion de Auth DESPLEGADA contra lo esperado (SEC-13, SEC-30). Node 22, sin dependencias.
//   SUPABASE_ACCESS_TOKEN=... node scripts/seguridad/verificar-auth.mjs --ref <ref> --sitio https://<usuario>.github.io/<repo>/
//   node scripts/seguridad/verificar-auth.mjs --archivo auth.json --sitio <url>     (JSON ya descargado)
// Lee GET /v1/projects/{ref}/config/auth de la API de gestion (solo lectura). Los campos de plantilla se
// verifican si la API los devuelve. Es el paso final de supabase-deploy.yml, despues de `config push`.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function evaluarAuth(c, { sitio }) {
  const errores = [];
  const exige = (cond, msg) => {
    if (!cond) errores.push(msg);
  };
  exige(c.mailer_otp_length === 6, `mailer_otp_length = ${c.mailer_otp_length}, se esperaba 6`);
  exige(typeof c.mailer_otp_exp === 'number' && c.mailer_otp_exp <= 600, `mailer_otp_exp = ${c.mailer_otp_exp}, se esperaba <= 600`);
  exige(c.mailer_autoconfirm === false, `mailer_autoconfirm = ${c.mailer_autoconfirm}: enable_confirmations debe ser true (H-003)`);
  exige(c.site_url === sitio, `site_url = ${JSON.stringify(c.site_url)}, se esperaba ${sitio}`);
  const permitidas = String(c.uri_allow_list ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  exige(permitidas.every((u) => u === sitio), `uri_allow_list = ${JSON.stringify(c.uri_allow_list)}: solo se admite la URL del sitio`);
  exige(!JSON.stringify(c).includes('127.0.0.1') && !JSON.stringify(c).includes('localhost'), 'la configuracion contiene 127.0.0.1 o localhost');
  exige(!JSON.stringify(c).includes('env('), 'la configuracion contiene env( sin resolver');
  exige(c.smtp_max_frequency === 60, `smtp_max_frequency = ${c.smtp_max_frequency}, se esperaba 60`);
  // H-290, CA-65, AVI-07: el SMTP de Auth vive en el panel (no en config.toml); el Sender name es un paso manual.
  exige(
    c.smtp_sender_name === 'Agenda Clases App',
    `smtp_sender_name = ${JSON.stringify(c.smtp_sender_name)}, se esperaba "Agenda Clases App": falta el paso manual del panel (Authentication > SMTP Settings > Sender name y Save), ver ops/mails.md (H-290, CA-65)`,
  );
  exige(c.rate_limit_anonymous_users >= 1, 'rate_limit_anonymous_users debe ser >= 1');
  // La API de gestion no tiene `rate_limit_sign_in_sign_ups`: el [auth.rate_limit] sign_in_sign_ups del config.toml
  // viaja como `rate_limit_otp` (y token_verifications como `rate_limit_verify`). H-280.
  exige(['rate_limit_otp', 'rate_limit_sign_in_sign_ups'].some((k) => typeof c[k] === 'number'), 'falta el limite de ingresos (rate_limit_otp) explicito');
  exige(['rate_limit_verify', 'rate_limit_otp', 'rate_limit_token_verifications'].some((k) => typeof c[k] === 'number'), 'falta el limite de verificaciones de codigo');
  exige(c.external_google_enabled === true, 'Google no esta habilitado');
  exige(c.external_anonymous_users_enabled !== true, 'los ingresos anonimos deben estar apagados');
  for (const t of ['confirmation', 'magic_link']) {
    const asunto = c[`mailer_subjects_${t}`];
    if (asunto !== undefined) exige(asunto === 'Tu código de ingreso', `asunto de ${t} = ${JSON.stringify(asunto)}`);
    const cuerpo = c[`mailer_templates_${t}_content`];
    if (cuerpo !== undefined) {
      exige(!/https?:|ConfirmationURL|SiteURL|href=/i.test(cuerpo), `la plantilla ${t} tiene enlaces (SEC-12)`);
      exige(cuerpo.includes('{{ .Token }}'), `la plantilla ${t} no trae {{ .Token }}`);
    }
  }
  return errores;
}

async function main(argv) {
  const args = Object.fromEntries(argv.slice(2).reduce((a, x, i, v) => (x.startsWith('--') ? [...a, [x.slice(2), v[i + 1]]] : a), []));
  if (!args.sitio || (!args.ref && !args.archivo)) {
    console.error('Uso: verificar-auth.mjs --ref <ref> --sitio <url> | --archivo <json> --sitio <url>');
    return 2;
  }
  let config;
  if (args.archivo) {
    config = JSON.parse(readFileSync(args.archivo, 'utf8'));
  } else {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) {
      console.error('Falta SUPABASE_ACCESS_TOKEN');
      return 2;
    }
    const r = await fetch(`https://api.supabase.com/v1/projects/${args.ref}/config/auth`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      console.error(`la API de gestion respondio ${r.status}`);
      return 1;
    }
    config = await r.json();
  }
  const errores = evaluarAuth(config, { sitio: args.sitio });
  if (errores.length > 0) {
    console.error(`verificar-auth: ${errores.length} diferencia(s) con lo esperado`);
    for (const e of errores) console.error(`  - ${e}`);
    return 1;
  }
  console.log('verificar-auth: la configuracion de Auth desplegada coincide con lo esperado');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv);
}
