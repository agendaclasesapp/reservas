// Pruebas Deno de la configuración SMTP y del envío (AVI-07, H-017, H-018, SEC-11).
import assert from "node:assert/strict";
import type { MailReclamado } from "./nucleo.ts";
import {
  crearEnviador,
  type CrearTransporte,
  leerConfigSmtp,
  type Mensaje,
  nombreRemitente,
  responderA,
  type Transporte,
} from "./smtp.ts";

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

Deno.test("AVI_07_sin_remitente_en_la_fila_sale_con_el_nombre_del_servicio_y_sin_Reply_To", async () => {
  const { crear, estado } = transporteFalso();
  const enviar = crearEnviador(
    leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com", GMAIL_APP_PASSWORD: "ab cd" })),
    crear,
  );
  await enviar(MAIL, new AbortController().signal);
  assert.deepEqual(estado.enviados, [{
    from: { name: "Agenda Clases App", address: "casilla@gmail.com" },
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

Deno.test("AVI_07_mail_de_un_profesor_sale_de_GMAIL_USER_con_su_nombre_y_Reply_To_a_su_mail", async () => {
  const { crear, estado } = transporteFalso();
  const enviar = crearEnviador(leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com" })), crear);
  await enviar(
    { ...MAIL, remitente: "Ana Pérez", responderA: "ana.profe@example.test" },
    new AbortController().signal,
  );
  assert.deepEqual(estado.enviados, [{
    from: { name: "Ana Pérez", address: "casilla@gmail.com" },
    to: MAIL.destinatario,
    replyTo: "ana.profe@example.test",
    subject: MAIL.asunto,
    text: MAIL.cuerpo,
  }]);
});

Deno.test("SEC_11_el_nombre_del_remitente_va_como_objeto_sin_saltos_comillas_ni_corchetes", async () => {
  const { crear, estado } = transporteFalso();
  const enviar = crearEnviador(leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com" })), crear);
  await enviar(
    { ...MAIL, remitente: 'Ana\r\nBcc: x@y.test "<evil@y.test>"\\', responderA: null },
    new AbortController().signal,
  );
  const m = estado.enviados[0] as Mensaje;
  assert.equal(typeof m.from, "object");
  assert.equal(m.from.address, "casilla@gmail.com");
  assert.doesNotMatch(m.from.name, /[\r\n"<>\\]/);
  assert.equal(m.from.name, "Ana Bcc: x@y.test evil@y.test");
  assert.equal("replyTo" in m, false);
});

Deno.test("SEC_11_nombreRemitente_corta_a_70_y_vacio_es_el_servicio", () => {
  assert.equal(nombreRemitente("a".repeat(90)).length, 70);
  assert.equal(nombreRemitente("    "), "Agenda Clases App");
  assert.equal(nombreRemitente(null), "Agenda Clases App");
});

Deno.test("WEB_12_SEC_11_un_nombre_con_espacios_sale_entero_en_from_name_sin_cabecera_armada_a_mano", async () => {
  const { crear, estado } = transporteFalso();
  const enviar = crearEnviador(leerConfigSmtp(entorno({ GMAIL_USER: "casilla@gmail.com" })), crear);
  await enviar(MAIL, new AbortController().signal);
  await enviar({ ...MAIL, remitente: "Ana María  Pérez" }, new AbortController().signal);
  const [servicio, profesor] = estado.enviados as Mensaje[];
  // nodemailer recibe el objeto y codifica el nombre; ni comillas ni «<dirección>» armados aquí.
  assert.deepEqual(servicio.from, { name: "Agenda Clases App", address: "casilla@gmail.com" });
  assert.deepEqual(profesor.from, { name: "Ana María Pérez", address: "casilla@gmail.com" });
  for (const m of [servicio, profesor]) assert.doesNotMatch(m.from.name, /["<>]/);
});

Deno.test("SEC_11_Reply_To_solo_con_un_mail_simple", () => {
  assert.equal(responderA("profe@example.test"), "profe@example.test");
  assert.equal(responderA("a@x.test, b@y.test"), undefined);
  assert.equal(responderA("Profe <p@x.test>"), undefined);
  assert.equal(responderA("p@x.test\r\nBcc: z@y.test"), undefined);
  assert.equal(responderA(`${"a".repeat(250)}@x.test`), undefined);
  assert.equal(responderA(null), undefined);
});
