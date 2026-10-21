// Lector de Mailpit (stack local). Correo de prueba solo a dominios @example.test (NFR-02).
import { entorno } from './entorno';

export interface Mail {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

export function mailUnico(prefijo: string): string {
  return `${prefijo}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function buscar(to: string): Promise<{ ID: string }[]> {
  const r = await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await r.json()) as { messages: { ID: string }[] }).messages;
}

/** Espera el mail número `n` (1 = el primero) dirigido a `to`; devuelve también el código de 6 dígitos. */
export async function esperarMail(to: string, n = 1): Promise<Mail & { codigo: string | null }> {
  for (let i = 0; i < 60; i++) {
    const mensajes = await buscar(to);
    if (mensajes.length >= n) {
      const id = mensajes[mensajes.length - n].ID; // Mailpit ordena del más nuevo al más viejo
      const m = (await (await fetch(`${entorno().mailpitUrl}/api/v1/message/${id}`)).json()) as Mail;
      return { ...m, codigo: /\b(\d{6})\b/.exec(m.Text)?.[1] ?? null };
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó el mail ${n} a ${to}`);
}

export async function vaciarBuzon(): Promise<void> {
  await fetch(`${entorno().mailpitUrl}/api/v1/messages`, { method: 'DELETE' });
}
