// Acceso a `public.mail_salida` por PostgREST con la clave de servicio (ADR-005, H-011).
// Toca solo `mail_salida`; la base además limita la escritura a `estado` y `motivo_fallo`.
import { ErrorBase, type MailReclamado, type Repositorio } from "./nucleo.ts";

type Fetch = typeof fetch;

export function crearRepositorio(url: string, clave: string, fetchPropio: Fetch = fetch): Repositorio {
  const base = `${url.replace(/\/+$/, "")}/rest/v1/mail_salida`;
  const cabeceras = (prefer: string): HeadersInit => ({
    apikey: clave,
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  });

  async function pedir(etapa: string, ruta: string, init: RequestInit): Promise<Response> {
    if (!url || !clave) throw new ErrorBase(etapa, 0);
    let r: Response;
    try {
      r = await fetchPropio(`${base}?${ruta}`, init);
    } catch {
      throw new ErrorBase(etapa, 0);
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new ErrorBase(etapa, r.status);
    }
    return r;
  }

  return {
    async pendientes(limite) {
      const r = await pedir(
        "pendientes",
        `select=id&estado=eq.pendiente&order=creado_en.asc&limit=${limite}`,
        { method: "GET", headers: cabeceras("count=none") },
      );
      const filas = (await r.json()) as { id: string }[];
      return filas.map((f) => f.id);
    },

    async reclamar(id) {
      const r = await pedir(
        "reclamar",
        `id=eq.${id}&estado=eq.pendiente&select=id,destinatario,asunto,cuerpo_texto`,
        {
          method: "PATCH",
          headers: cabeceras("return=representation"),
          body: JSON.stringify({ estado: "enviando" }),
        },
      );
      const filas = (await r.json()) as {
        id: string;
        destinatario: string | null;
        asunto: string | null;
        cuerpo_texto: string | null;
      }[];
      const f = filas[0];
      if (!f) return null;
      const mail: MailReclamado = {
        id: f.id,
        destinatario: f.destinatario,
        asunto: f.asunto,
        cuerpo: f.cuerpo_texto,
      };
      return mail;
    },

    async marcar(id, estado, motivo) {
      const r = await pedir("marcar", `id=eq.${id}&estado=eq.enviando`, {
        method: "PATCH",
        headers: cabeceras("return=minimal"),
        body: JSON.stringify({ estado, motivo_fallo: motivo }),
      });
      await r.body?.cancel();
    },
  };
}
