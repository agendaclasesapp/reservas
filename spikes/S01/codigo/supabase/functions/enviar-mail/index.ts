// Spike S01 (ADR-005): Edge Function minima de envio por SMTP con nodemailer.
// Codigo descartable: B03 la reescribe como `enviar-mail` reclamando filas de `mail_salida`.
//
// Variables de entorno:
//   GMAIL_USER          remitente (From) y usuario SMTP
//   GMAIL_APP_PASSWORD  contrasena de aplicacion; vacia = sin AUTH (Mailpit local)
//   MAIL_SECRETO        valor que debe llegar en la cabecera x-mail-secreto
//   SMTP_HOST           por defecto smtp.gmail.com
//   SMTP_PORT           por defecto 465
//   SMTP_TLS            "true" = TLS implicito (465); por defecto true
//   SMTP_TIMEOUT_MS     tope de conexion, saludo y socket; por defecto 10000
//   MAIL_ESQUEMA        esquema de la tabla mail_prueba; por defecto public
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (inyectadas por Supabase) para marcar la fila
//
// Cuerpo opcional `clave_invalida: true` (solo con el secreto): usa una contrasena fija
// equivocada para probar el error de AUTH sin tocar el secreto real (S01 en la nube).
import nodemailer from "npm:nodemailer@6.9.16";

type Pedido = {
  id?: number;
  para: string;
  asunto: string;
  cuerpo: string;
  clave_invalida?: boolean;
};

// Variables que la plataforma podria inyectar; se informa solo si existen, nunca el valor.
const CLAVES_PLATAFORMA = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_SECRET_KEYS",
];

function entorno(): Record<string, boolean> {
  return Object.fromEntries(
    CLAVES_PLATAFORMA.map((k) => [k, Boolean(Deno.env.get(k))]),
  );
}

const codificador = new TextEncoder();

// Comparacion en tiempo constante (no corta en el primer byte distinto).
function iguales(a: string, b: string): boolean {
  const x = codificador.encode(a);
  const y = codificador.encode(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

function json(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

async function marcarFila(id: number, estado: string, motivo: string | null) {
  const url = Deno.env.get("SUPABASE_URL");
  const clave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !clave) return "sin-credenciales";
  const esquema = Deno.env.get("MAIL_ESQUEMA") || "public";
  const r = await fetch(`${url}/rest/v1/mail_prueba?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Profile": esquema,
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ estado, motivo }),
  });
  return r.ok ? "marcada" : `error-${r.status}`;
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get("MAIL_SECRETO") ?? "";
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Solo POST" });
  }
  if (!secreto || !iguales(req.headers.get("x-mail-secreto") ?? "", secreto)) {
    return json(401, { ok: false, error: "No autorizado" });
  }

  let p: Pedido;
  try {
    p = await req.json();
  } catch {
    return json(400, { ok: false, error: "Cuerpo JSON invalido" });
  }
  if (!p?.para || !p?.asunto || typeof p.cuerpo !== "string") {
    return json(400, { ok: false, error: "Faltan para, asunto o cuerpo" });
  }

  const usuario = Deno.env.get("GMAIL_USER") ?? "";
  const clave = p.clave_invalida === true
    ? "clave-invalida-s01"
    : Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
  const tope = Number(Deno.env.get("SMTP_TIMEOUT_MS") || "10000");
  const host = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const transporte = nodemailer.createTransport({
    // En local usar el alias de red "inbucket": los nombres con "_" (supabase_inbucket_<id>)
    // no resuelven en el edge runtime (EDNS "queryA UNKNOWN").
    host,
    port: Number(Deno.env.get("SMTP_PORT") || "465"),
    secure: (Deno.env.get("SMTP_TLS") || "true") === "true",
    auth: clave ? { user: usuario, pass: clave } : undefined,
    connectionTimeout: tope,
    greetingTimeout: tope,
    socketTimeout: tope,
  });

  const t0 = Date.now();
  try {
    const info = await transporte.sendMail({
      from: usuario,
      to: p.para,
      subject: p.asunto,
      text: p.cuerpo,
    });
    const fila = p.id ? await marcarFila(p.id, "enviado", null) : null;
    return json(200, {
      ok: true,
      messageId: info.messageId,
      ms: Date.now() - t0,
      fila,
      entorno: entorno(),
    });
  } catch (e) {
    const err = e as { message?: string; code?: string; responseCode?: number };
    const motivo = String(err.message ?? e).slice(0, 500);
    const fila = p.id ? await marcarFila(p.id, "fallido", motivo) : null;
    return json(502, {
      ok: false,
      error: motivo,
      codigo: err.code ?? null,
      responseCode: err.responseCode ?? null,
      ms: Date.now() - t0,
      fila,
      entorno: entorno(),
    });
  } finally {
    transporte.close();
  }
});
