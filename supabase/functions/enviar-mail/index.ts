// Edge Function `enviar-mail` (B03 · T03.1; ADR-005, contratos.md §4). Reemplaza la del spike S01:
// sin `clave_invalida` ni `entorno`. La llama pg_net (trigger de `mail_salida` y `privado.barrer_mails`)
// con las cabeceras `x-mail-ts` y `x-mail-firma` (HMAC-SHA256 con MAIL_SECRETO, H-130) y `verify_jwt = false`.
// Entorno: MAIL_SECRETO, GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_HOST, SMTP_PORT, SMTP_TLS (smtp.ts) y
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, que inyecta Supabase.
// @ts-types="npm:@types/nodemailer@6.4.17"
import nodemailer from "npm:nodemailer@6.9.16";
import { crearManejador } from "./nucleo.ts";
import { crearRepositorio } from "./repositorio.ts";
import { crearEnviador, type CrearTransporte, leerConfigSmtp } from "./smtp.ts";

const leer = (clave: string) => Deno.env.get(clave);

Deno.serve(
  crearManejador({
    secreto: leer("MAIL_SECRETO") ?? "",
    repo: crearRepositorio(leer("SUPABASE_URL") ?? "", leer("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
    enviar: crearEnviador(leerConfigSmtp(leer), nodemailer.createTransport as unknown as CrearTransporte),
  }),
);
