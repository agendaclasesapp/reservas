// Pruebas Deno de la configuración SMTP y del envío (AVI-07, H-017, H-018, SEC-11).
import assert from "node:assert/strict";
import type { MailReclamado } from "./nucleo.ts";
import { crearEnviador, type CrearTransporte, leerConfigSmtp, type Transporte } from "./smtp.ts";

const MAIL: MailReclamado = {
  id: "11111111-1111-4111-8111-111111111111",
  destinatario: "alumno@example.test",
  asunto: "Clase confirmada",
  cuerpo: "Hola",
};

const entorno = (v: Record<string, string>) => (k: string) => v[k];

function transporteFalso(enviar: () => Promise<unknown> = () => Promise.resolve({})) {
  const estado = { opciones: [] as Parameters<CrearTransporte>[0][], enviados: [] as unknown[], cierres: 0 };
  const crear: CrearTransporte = (o) => {
    estado.opciones.push(o);
    const t: Transporte = {
      sendMail: (m) => {
        estado.enviados.push(m);
        return enviar();
      },
      close: () => {
        estado.cierres++;
      },
    };
    return t;
  };
  return { crear, estado };
}

Deno.test("AVI_07_por_defecto_gmail_465_con_TLS_implicito", () => {
  assert.deepEqual(leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com", GMAIL_APP_PASSWORD: "abcd" })), {
    host: "smtp.gmail.com",
    port: 465,
    tls: true,
    usuario: "casilla@gmail.com",
    clave: "abcd",
  });
});

Deno.test("AVI_07_SMTP_configurable_local_inbucket_1025_sin_TLS", () => {
  const c = leerConfigSmtp(
    entorno({ SMTP_HOST: "inbucket", SMTP_PORT: "1025", SMTP_TLS: "false", GMAIL_USER: "p@x.test" }),
  );
  assert.equal(c.host, "inbucket");
  assert.equal(c.port, 1025);
  assert.equal(c.tls, false);
  assert.equal(c.clave, "");
  assert.equal(leerConfigSmtp(entorno({ SMTP_PORT: "no" })).port, 465);
});

Deno.test("H_018_la_contrasena_de_aplicacion_se_usa_sin_espacios", () => {
  assert.equal(leerConfigSmtp(entorno({ GMAIL_APP_PASSWORD: " abcd efgh\tijkl mnop \n" })).clave, "abcdefghijklmnop");
});

Deno.test("AVI_07_el_remitente_es_GMAIL_USER_y_el_cuerpo_va_en_texto_plano", async () => {
  const { crear, estado } = transporteFalso();
  const enviar = crearEnviador(
    leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com", GMAIL_APP_PASSWORD: "ab cd" })),
    crear,
  );
  await enviar(MAIL, new AbortController().signal);
  assert.deepEqual(estado.enviados, [{
    from: "casilla@gmail.com",
    to: MAIL.destinatario,
    subject: MAIL.asunto,
    text: MAIL.cuerpo,
  }]);
  assert.deepEqual(estado.opciones[0].auth, { user: "casilla@gmail.com", pass: "abcd" });
  assert.equal(estado.opciones[0].secure, true);
  assert.equal(estado.cierres, 1);
});

Deno.test("AVI_07_sin_contrasena_no_autentica_y_sin_GMAIL_USER_falla", async () => {
  const { crear, estado } = transporteFalso();
  await crearEnviador(leerConfigSmtp(entorno({ GMAIL_USER: "p@x.test" })), crear)(MAIL, new AbortController().signal);
  assert.equal(estado.opciones[0].auth, undefined);
  await assert.rejects(
    crearEnviador(leerConfigSmtp(entorno({})), crear)(MAIL, new AbortController().signal),
    /Falta GMAIL_USER/,
  );
});

Deno.test("H_017_abortar_la_senal_cierra_el_transporte_y_el_error_smtp_se_propaga", async () => {
  let rechazar: (e: Error) => void = () => {};
  const { crear, estado } = transporteFalso(() => new Promise((_, r) => (rechazar = r)));
  const control = new AbortController();
  const envio = crearEnviador(leerConfigSmtp(entorno({ GMAIL_USER: "p@x.test" })), crear)(MAIL, control.signal);
  control.abort();
  assert.equal(estado.cierres, 1);
  rechazar(new Error("Connection closed"));
  await assert.rejects(envio, /Connection closed/);
  assert.equal(estado.cierres, 2);
});
