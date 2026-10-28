// Pruebas Deno del acceso a `mail_salida` por PostgREST (contratos.md §4, H-011).
import assert from "node:assert/strict";
import { ErrorBase } from "./nucleo.ts";
import { crearRepositorio } from "./repositorio.ts";

const ID = "11111111-1111-4111-8111-111111111111";

type Llamada = { url: string; init: RequestInit };

function fetchFalso(respuestas: Response[]) {
  const llamadas: Llamada[] = [];
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    const r = respuestas.shift();
    return r ? Promise.resolve(r) : Promise.reject(new TypeError("sin red"));
  }) as typeof fetch;
  return { f, llamadas };
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

Deno.test("AVI_07_reclamar_pasa_de_pendiente_a_enviando_en_un_solo_update", async () => {
  const { f, llamadas } = fetchFalso([
    json([{
      id: ID,
      destinatario: "a@example.test",
      asunto: "A",
      cuerpo_texto: "C",
      remitente_nombre: "Ana Profe",
      responder_a: "ana@example.test",
    }]),
  ]);
  const repo = crearRepositorio("http://kong:8000/", "clave-servicio", f);
  const mail = await repo.reclamar(ID);
  assert.deepEqual(mail, {
    id: ID,
    destinatario: "a@example.test",
    asunto: "A",
    cuerpo: "C",
    remitente: "Ana Profe",
    responderA: "ana@example.test",
  });
  const { url, init } = llamadas[0];
  assert.equal(
    url,
    `http://kong:8000/rest/v1/mail_salida?id=eq.${ID}&estado=eq.pendiente&select=id,destinatario,asunto,cuerpo_texto,remitente_nombre,responder_a`,
  );
  assert.equal(init.method, "PATCH");
  assert.equal(init.body, JSON.stringify({ estado: "enviando" }));
  const h = init.headers as Record<string, string>;
  assert.equal(h.apikey, "clave-servicio");
  assert.equal(h.Authorization, "Bearer clave-servicio");
  assert.equal(h.Prefer, "return=representation");
});

Deno.test("AVI_07_reclamar_una_fila_sin_remitente_lo_deja_en_null", async () => {
  const { f } = fetchFalso([json([{ id: ID, destinatario: "a@example.test", asunto: "A", cuerpo_texto: "C" }])]);
  const mail = await crearRepositorio("http://x", "k", f).reclamar(ID);
  assert.equal(mail?.remitente, null);
  assert.equal(mail?.responderA, null);
});

Deno.test("AVI_07_reclamar_una_fila_que_ya_no_esta_pendiente_devuelve_null", async () => {
  const { f } = fetchFalso([json([])]);
  assert.equal(await crearRepositorio("http://x", "k", f).reclamar(ID), null);
});

Deno.test("NFR_07_marcar_solo_toca_una_fila_enviando_con_estado_y_motivo", async () => {
  const { f, llamadas } = fetchFalso([new Response(null, { status: 204 })]);
  await crearRepositorio("http://x", "k", f).marcar(ID, "fallido", "535 auth");
  assert.equal(llamadas[0].url, `http://x/rest/v1/mail_salida?id=eq.${ID}&estado=eq.enviando`);
  assert.equal(llamadas[0].init.body, JSON.stringify({ estado: "fallido", motivo_fallo: "535 auth" }));
});

Deno.test("AVI_07_pendientes_lee_ids_por_antiguedad_con_limite", async () => {
  const { f, llamadas } = fetchFalso([json([{ id: ID }])]);
  assert.deepEqual(await crearRepositorio("http://x", "k", f).pendientes(50), [ID]);
  assert.equal(
    llamadas[0].url,
    "http://x/rest/v1/mail_salida?select=id&estado=eq.pendiente&order=creado_en.asc&limit=50",
  );
});

Deno.test("contratos_4_error_http_o_de_red_o_sin_credenciales_lanza_ErrorBase", async () => {
  const { f } = fetchFalso([json({ message: "permiso" }, 401)]);
  await assert.rejects(crearRepositorio("http://x", "k", f).pendientes(50), (e) => {
    assert.ok(e instanceof ErrorBase);
    assert.equal(e.etapa, "pendientes");
    assert.equal(e.estado, 401);
    return true;
  });
  const red = fetchFalso([]);
  await assert.rejects(crearRepositorio("http://x", "k", red.f).reclamar(ID), ErrorBase);
  const sin = fetchFalso([]);
  await assert.rejects(crearRepositorio("", "", sin.f).marcar(ID, "enviado", null), ErrorBase);
  assert.equal(sin.llamadas.length, 0);
});
