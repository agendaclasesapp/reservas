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

/** Subconjunto de nodemailer que usa la función. */
export interface Transporte {
  sendMail(m: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  close(): void;
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
      // AVI-07: el remitente es siempre GMAIL_USER; cuerpo en texto plano (SEC-11).
      await transporte.sendMail({
        from: config.usuario,
        to: mail.destinatario ?? "",
        subject: mail.asunto ?? "",
        text: mail.cuerpo ?? "",
      });
    } finally {
      senal.removeEventListener("abort", cerrar);
      transporte.close();
    }
  };
}
