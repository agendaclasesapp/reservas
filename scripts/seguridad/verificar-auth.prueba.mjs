// Pruebas de verificar-auth.mjs (SEC-13).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluarAuth } from './verificar-auth.mjs';

const SITIO = 'https://agendaclasesapp.github.io/reservas/';
const bueno = () => ({
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
  mailer_autoconfirm: false,
  site_url: SITIO,
  uri_allow_list: SITIO,
  smtp_max_frequency: 60,
  rate_limit_anonymous_users: 30,
  rate_limit_sign_in_sign_ups: 20,
  rate_limit_otp: 20,
  external_google_enabled: true,
  mailer_subjects_confirmation: 'Tu código de ingreso',
  mailer_subjects_magic_link: 'Tu código de ingreso',
  mailer_templates_confirmation_content: '<p>{{ .Token }}</p>',
  mailer_templates_magic_link_content: '<p>{{ .Token }}</p>',
});

test('la configuracion esperada pasa', () => {
  assert.deepEqual(evaluarAuth(bueno(), { sitio: SITIO }), []);
});

test('cada desvio se detecta', () => {
  const casos = {
    mailer_otp_length: 8,
    mailer_otp_exp: 3600,
    mailer_autoconfirm: true,
    site_url: 'http://localhost:3000',
    uri_allow_list: 'http://127.0.0.1:5173/reservas/',
    smtp_max_frequency: 1,
    rate_limit_anonymous_users: 0,
    external_google_enabled: false,
    mailer_templates_magic_link_content: '<a href="{{ .ConfirmationURL }}">entrar</a>',
  };
  for (const [campo, valor] of Object.entries(casos)) {
    const c = { ...bueno(), [campo]: valor };
    assert.ok(evaluarAuth(c, { sitio: SITIO }).length >= 1, campo);
  }
});

test('una variable sin resolver (env() o 127.0.0.1) en cualquier campo falla', () => {
  assert.ok(evaluarAuth({ ...bueno(), external_google_client_id: 'env(RTC_GOOGLE_CLIENT_ID)' }, { sitio: SITIO }).length >= 1);
});
