// Configuración SMTP por entorno y envío (ADR-005, contratos.md §4). Sin import de nodemailer: el
// transporte llega inyectado (index.ts usa `npm:nodemailer@6.9.16`; las pruebas, uno falso).
// Variables (secretos de Edge Functions; en local `supabase/.env.development`):
//   GMAIL_USER          remitente fijo y usuario SMTP (AVI-07)
//   GMAIL_APP_PASSWORD  contraseña de aplicación; se le quitan los espacios (H-018); vacía = sin AUTH
//   SMTP_HOST           por defecto smtp.gmail.com (local y CI: inbucket)
//   SMTP_PORT           por defecto 465 (local y CI: 1025)
//   SMTP_TLS            "true" = TLS implícito; por defecto true (local y CI: false)
import { type Enviar, TOPE_MAIL_MS } from "./nucleo.ts";

export interface ConfigSmtp {
  host: string;
  port: number;
  tls: boolean;
  usuario: string;
  clave: string;
}

export function leerConfigSmtp(leer: (clave: string) => string | undefined): ConfigSmtp {
  const puerto = Number(leer("SMTP_PORT"));
  return {
    host: leer("SMTP_HOST")?.trim() || "smtp.gmail.com",
    port: Number.isInteger(puerto) && puerto > 0 ? puerto : 465,
    tls: (leer("SMTP_TLS")?.trim() || "true").toLowerCase() !== "false",
    usuario: leer("GMAIL_USER")?.trim() ?? "",
    clave: (leer("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, ""),
  };
}

/** Dirección como objeto de nodemailer: él codifica el nombre (SEC-11, sin cabeceras armadas a mano). */
export interface Direccion {
  name: string;
  address: string;
}

/** Mensaje que la función pasa a nodemailer. */
export interface Mensaje {
  from: Direccion;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}

/** Subconjunto de nodemailer que usa la función. */
export interface Transporte {
  sendMail(m: Mensaje): Promise<unknown>;
  close(): void;
}

/** AVI-07: nombre del servicio cuando la fila no trae remitente (avisos al profesor y de la aplicación). */
export const NOMBRE_SERVICIO = "Agenda Clases App";

// SEC-11: controles, separadores de línea y los caracteres que delimitan una dirección. La base ya los
// quita al encolar (ADR-019); esto es la segunda barrera. Los controles son a propósito.
// deno-lint-ignore no-control-regex
const NO_NOMBRE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029"<>\\]+/g;
const MAIL_SIMPLE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

/** Nombre visible del From: saneado, hasta 70 caracteres; vacío = nombre del servicio. */
export function nombreRemitente(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").replace(NO_NOMBRE, " ").replace(/\s+/g, " ").trim().slice(0, 70).trim();
  return limpio || NOMBRE_SERVICIO;
}

/** Reply-To: solo un mail simple de hasta 254 caracteres; si no, se omite. */
export function responderA(mail: string | null | undefined): string | undefined {
  const m = (mail ?? "").trim();
  return m.length <= 254 && MAIL_SIMPLE.test(m) ? m : undefined;
}

export type CrearTransporte = (opciones: {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}) => Transporte;

/** Un transporte por mail; se cierra al terminar o al abortar por el tope de 15 s (H-017). */
export function crearEnviador(config: ConfigSmtp, crearTransporte: CrearTransporte): Enviar {
  return async (mail, senal) => {
    if (!config.usuario) throw new Error("Falta GMAIL_USER");
    const transporte = crearTransporte({
      host: config.host,
      port: config.port,
      secure: config.tls,
      auth: config.clave ? { user: config.usuario, pass: config.clave } : undefined,
      connectionTimeout: TOPE_MAIL_MS,
      greetingTimeout: TOPE_MAIL_MS,
      socketTimeout: TOPE_MAIL_MS,
    });
    const cerrar = () => transporte.close();
    senal.addEventListener("abort", cerrar, { once: true });
    try {
      // AVI-07, ADR-019: la dirección del From es siempre GMAIL_USER (SPF/DKIM de Gmail) con el nombre de la
      // fila; Reply-To al mail del profesor si lo trae. Cuerpo en texto plano (SEC-11).
      const mensaje: Mensaje = {
        from: { name: nombreRemitente(mail.remitente), address: config.usuario },
        to: mail.destinatario ?? "",
        subject: mail.asunto ?? "",
        text: mail.cuerpo ?? "",
      };
      const replyTo = responderA(mail.responderA);
      if (replyTo) mensaje.replyTo = replyTo;
      await transporte.sendMail(mensaje);
    } finally {
      senal.removeEventListener("abort", cerrar);
      transporte.close();
    }
  };
}
