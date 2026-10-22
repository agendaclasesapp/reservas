// Arranca la `enviar-mail` REAL (supabase/functions/enviar-mail/index.ts) en un puerto local con Deno, para las
// pruebas que necesitan otro SMTP que el del stack (credenciales inválidas, CA-34). Solo fija el puerto y delega.
// Uso (lo lanza fallos.test.ts): deno run -A --node-modules-dir=none servidor-local.ts  (PUERTO_FUNCION, SMTP_*, ...)
// Es código Deno: lo verifican `deno check`/`deno lint`; el tsc del front lo excluye (tsconfig.json).
const puerto = Number(Deno.env.get("PUERTO_FUNCION"));
const original = Deno.serve.bind(Deno);
const fijado = Reflect.set(Deno, "serve", (manejador: Deno.ServeHandler) =>
  original({ port: puerto, hostname: "127.0.0.1", onListen: () => console.log("LISTO") }, manejador));
if (!fijado) throw new Error("No se pudo reemplazar Deno.serve");
await import("../../../supabase/functions/enviar-mail/index.ts");
