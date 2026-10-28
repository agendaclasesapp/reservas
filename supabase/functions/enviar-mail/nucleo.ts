// Núcleo de la Edge Function `enviar-mail` (ADR-005 «Ajustes tras S01», contratos.md §4).
// Sin dependencias de red: la base, el SMTP y el reloj llegan inyectados (pruebas Deno).
// IDs: AVI-07, NFR-07, SEC-11, SEC-17, H-017.

/** SEC-11: máximo de `ids` por llamada y de pendientes con cuerpo `{}`. */
export const MAX_IDS = 50;
/** H-017: tope total por mail (no por fase de nodemailer). */
export const TOPE_MAIL_MS = 15_000;
/** H-017: deja de reclamar a los 100 s de la llamada (límite de reloj de Edge Functions en Free). */
export const PRESUPUESTO_MS = 100_000;
/** contratos.md §4: largo máximo de `motivo_fallo`. */
export const MAX_MOTIVO = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fila reclamada (`pendiente → enviando`). Nunca se registra ni se devuelve (SEC-17). */
export interface MailReclamado {
  id: string;
  destinatario: string | null;
  asunto: string | null;
  cuerpo: string | null;
  /** Nombre visible del From (ADR-019, WEB-12): el del profesor o «Agenda Clases App» (`NOMBRE_SERVICIO`). */
  remitente?: string | null;
  /** Reply-To (AVI-07): el mail del profesor en sus mails a alumnos; null en los demás. */
  responderA?: string | null;
}

/** Acceso a `mail_salida`; cada método lanza si la base no responde. */
export interface Repositorio {
  /** Ids `pendiente`, los más viejos primero. */
  pendientes(limite: number): Promise<string[]>;
  /** `update … set estado='enviando' where id=… and estado='pendiente' returning`; null si ya no está pendiente. */
  reclamar(id: string): Promise<MailReclamado | null>;
  /** Marca una fila `enviando` como `enviado` o `fallido` con su motivo. */
  marcar(id: string, estado: "enviado" | "fallido", motivo: string | null): Promise<void>;
}

/** Envía un mail; lanza con el texto del error SMTP. Debe abandonar el envío si `senal` se aborta. */
export type Enviar = (mail: MailReclamado, senal: AbortSignal) => Promise<void>;

/** Evento de log: solo ids, contadores y etapas; nunca destinatario, asunto, cuerpo, motivo ni credenciales. */
export type Evento = Record<string, string | number>;

export interface Dependencias {
  secreto: string;
  repo: Repositorio;
  enviar: Enviar;
  ahora?: () => number;
  registrar?: (evento: Evento) => void;
  topeMailMs?: number;
  presupuestoMs?: number;
}

export class ErrorBase extends Error {
  constructor(readonly etapa: string, readonly estado: number) {
    super(`Sin acceso a la base (${etapa}, ${estado})`);
  }
}

const codificador = new TextEncoder();

/** SEC-11: comparación en tiempo constante (no corta en el primer byte distinto). */
export function iguales(a: string, b: string): boolean {
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

/**
 * SEC-11: cuerpo `{}` (todas las pendientes, máx. 50) o `{"ids": [uuid, …]}` con 0 a 50 UUID.
 * Devuelve los ids sin repetir, `"todas"` o null si el pedido no es válido.
 */
export function leerIds(cuerpo: unknown): string[] | "todas" | null {
  if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) return null;
  const ids = (cuerpo as { ids?: unknown }).ids;
  if (ids === undefined) return "todas";
  if (!Array.isArray(ids) || ids.length > MAX_IDS) return null;
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return null;
  return [...new Set((ids as string[]).map((id) => id.toLowerCase()))];
}

/** Texto del error para `motivo_fallo`, cortado a 500 (NFR-07). */
export function motivoDe(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  return (texto.trim() || "Error desconocido al enviar").slice(0, MAX_MOTIVO);
}

/** H-017: el envío entero tiene un tope; al vencer se aborta la señal y se rechaza. */
async function enviarConTope(enviar: Enviar, mail: MailReclamado, topeMs: number): Promise<void> {
  const control = new AbortController();
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const vencido = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => {
      // Primero el rechazo: el motivo es el tope, no el error que provoca cerrar el transporte.
      rechazar(new Error(`Tiempo agotado: el envío superó ${topeMs / 1000} s`));
      control.abort();
    }, topeMs);
  });
  try {
    await Promise.race([enviar(mail, control.signal), vencido]);
  } finally {
    clearTimeout(reloj);
  }
}

/** Manejador HTTP de la función. */
export function crearManejador(deps: Dependencias): (req: Request) => Promise<Response> {
  const ahora = deps.ahora ?? Date.now;
  const registrar = deps.registrar ?? ((e: Evento) => console.log(JSON.stringify(e)));
  const topeMailMs = deps.topeMailMs ?? TOPE_MAIL_MS;
  const presupuestoMs = deps.presupuestoMs ?? PRESUPUESTO_MS;

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "Solo POST" });

    // SEC-11: sin secreto configurado o con uno distinto, 401 sin consultar la base.
    const recibido = req.headers.get("x-mail-secreto") ?? "";
    if (!deps.secreto || !iguales(recibido, deps.secreto)) {
      return json(401, { error: "No autorizado" });
    }

    let cuerpo: unknown;
    try {
      const texto = await req.text();
      cuerpo = texto.trim() === "" ? {} : JSON.parse(texto);
    } catch {
      return json(400, { error: "Pedido inválido" });
    }
    const pedido = leerIds(cuerpo);
    if (pedido === null) return json(400, { error: "Pedido inválido" });

    const inicio = ahora();
    let enviados = 0;
    let fallidos = 0;
    try {
      const ids = pedido === "todas" ? await deps.repo.pendientes(MAX_IDS) : pedido;
      for (const [i, id] of ids.entries()) {
        // H-017: lo no reclamado sigue `pendiente` para el barrido.
        if (ahora() - inicio >= presupuestoMs) {
          registrar({ evento: "presupuesto_agotado", sin_reclamar: ids.length - i });
          break;
        }
        const mail = await deps.repo.reclamar(id);
        if (!mail) continue;
        try {
          if (!mail.destinatario) throw new Error("Sin destinatario");
          await enviarConTope(deps.enviar, mail, topeMailMs);
        } catch (e) {
          // Sin reintento (DEC-10 b). El motivo queda solo en `mail_salida.motivo_fallo` (SEC-17).
          await deps.repo.marcar(id, "fallido", motivoDe(e));
          fallidos++;
          registrar({ evento: "mail", id, resultado: "fallido" });
          continue;
        }
        await deps.repo.marcar(id, "enviado", null);
        enviados++;
        registrar({ evento: "mail", id, resultado: "enviado" });
      }
    } catch (e) {
      registrar({
        evento: "error_base",
        etapa: e instanceof ErrorBase ? e.etapa : "desconocida",
        estado: e instanceof ErrorBase ? e.estado : 0,
      });
      return json(500, { error: "Sin acceso a la base" });
    }
    return json(200, { enviados, fallidos });
  };
}
