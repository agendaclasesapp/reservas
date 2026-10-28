// Pruebas Deno del núcleo de `enviar-mail` (contratos.md §4).
// npx --yes deno@2.1.4 test supabase/functions/enviar-mail/
import assert from "node:assert/strict";
import {
  crearManejador,
  type Dependencias,
  type Enviar,
  ErrorBase,
  type Evento,
  firmar,
  iguales,
  leerIds,
  type MailReclamado,
  MAX_MOTIVO,
  type Repositorio,
  tsVigente,
  VENTANA_FIRMA_S,
} from "./nucleo.ts";

const SECRETO = "secreto-de-prueba";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const DESTINATARIO = "centinela.alumno@example.test";
/** Reloj de la firma (H-130) fijo para las pruebas que usan `armar`. */
const AHORA_S = Math.floor(Date.now() / 1000);
const texto = new TextEncoder();

function mail(id: string): MailReclamado {
  return { id, destinatario: DESTINATARIO, asunto: "Asunto centinela", cuerpo: "Cuerpo centinela" };
}

class RepoFalso implements Repositorio {
  consultas = 0;
  reclamados: string[] = [];
  marcas: { id: string; estado: string; motivo: string | null }[] = [];
  constructor(private filas: Map<string, MailReclamado>, private falla?: string) {}
  pendientes(limite: number) {
    this.consultas++;
    if (this.falla === "pendientes") return Promise.reject(new ErrorBase("pendientes", 503));
    return Promise.resolve([...this.filas.keys()].slice(0, limite));
  }
  reclamar(id: string) {
    this.consultas++;
    if (this.falla === "reclamar") return Promise.reject(new ErrorBase("reclamar", 503));
    const f = this.filas.get(id) ?? null;
    this.filas.delete(id);
    if (f) this.reclamados.push(id);
    return Promise.resolve(f);
  }
  marcar(id: string, estado: "enviado" | "fallido", motivo: string | null) {
    this.consultas++;
    this.marcas.push({ id, estado, motivo });
    return Promise.resolve();
  }
}

interface OpcionesPedido {
  /** `x-mail-ts` (por defecto `AHORA_S`). */
  ts?: string;
  /** Cuerpo que viaja, si difiere del firmado (cuerpo alterado en el camino). */
  enviado?: string;
  /** Cabeceras extra o que reemplazan las firmadas. */
  cabeceras?: Record<string, string>;
}

/** Pedido firmado como lo firma `privado.disparar_mail` (H-130); `secreto` null: sin cabeceras de firma. */
async function pedido(
  cuerpo: unknown,
  secreto: string | null = SECRETO,
  metodo = "POST",
  op: OpcionesPedido = {},
): Promise<Request> {
  const firmado = metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secreto !== null) {
    const ts = op.ts ?? String(AHORA_S);
    headers["x-mail-ts"] = ts;
    // WebCrypto no importa una clave HMAC vacía: con secreto "" la firma va vacía.
    headers["x-mail-firma"] = secreto === "" ? "" : await firmar(secreto, ts, texto.encode(firmado));
  }
  Object.assign(headers, op.cabeceras);
  return new Request("http://local/enviar-mail", {
    method: metodo,
    headers,
    body: metodo === "POST" ? (op.enviado ?? firmado) : undefined,
  });
}

function armar(repo: RepoFalso, enviar: Enviar, extra: Partial<Dependencias> = {}) {
  const eventos: Evento[] = [];
  const manejar = crearManejador({
    secreto: SECRETO,
    repo,
    enviar,
    registrar: (e) => eventos.push(e),
    relojSeg: () => AHORA_S,
    ...extra,
  });
  return { manejar, eventos };
}

const enviarOk: Enviar = () => Promise.resolve();

// --- SEC-11: autenticación y validación antes de tocar la base ---

Deno.test("SEC_11_sin_cabecera_responde_401_sin_consultar_la_base", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  const { manejar } = armar(repo, enviarOk);
  const r = await manejar(await pedido({ ids: [ID1] }, null));
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "No autorizado" });
  assert.equal(repo.consultas, 0);
});

Deno.test("SEC_11_secreto_erroneo_responde_401_sin_consultar_la_base", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  const { manejar } = armar(repo, enviarOk);
  for (const otro of ["secreto-de-prueba-", "secreto-de-prueb", "x", ""]) {
    const r = await manejar(await pedido({ ids: [ID1] }, otro));
    assert.equal(r.status, 401, otro);
    await r.body?.cancel();
  }
  assert.equal(repo.consultas, 0);
});

Deno.test("SEC_11_sin_MAIL_SECRETO_configurado_rechaza_todo_con_401", async () => {
  const repo = new RepoFalso(new Map());
  const { manejar } = armar(repo, enviarOk, { secreto: "" });
  const r = await manejar(await pedido({}, ""));
  assert.equal(r.status, 401);
  await r.body?.cancel();
  assert.equal(repo.consultas, 0);
});

// --- H-130: firma HMAC del disparo (ts + cuerpo crudo), sin el secreto en la llamada ---

Deno.test("H_130_firmar_coincide_con_la_hmac_de_pgcrypto_de_disparar_mail", async () => {
  // Calculado en la base local: encode(extensions.hmac(convert_to('1700000000.' || cuerpo, 'UTF8'),
  // convert_to('secreto-de-prueba', 'UTF8'), 'sha256'), 'hex') con cuerpo = jsonb_build_object(...)::text.
  const cuerpo = `{"ids": ["${ID1}"]}`;
  assert.equal(
    await firmar(SECRETO, "1700000000", texto.encode(cuerpo)),
    "9a4db3544322dd15a17691c155fef7947f68e8d55db50399ba0f6f4ba1b1e9f5",
  );
});

Deno.test("H_130_firma_buena_con_ts_en_los_bordes_de_la_ventana_responde_200", async () => {
  for (const ts of [AHORA_S, AHORA_S - VENTANA_FIRMA_S, AHORA_S + VENTANA_FIRMA_S]) {
    const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
    const { manejar } = armar(repo, enviarOk);
    const r = await manejar(await pedido({ ids: [ID1] }, SECRETO, "POST", { ts: String(ts) }));
    assert.equal(r.status, 200, String(ts));
    assert.deepEqual(await r.json(), { enviados: 1, fallidos: 0 });
  }
});

Deno.test("H_130_firma_mala_responde_401_sin_consultar_la_base", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  const { manejar } = armar(repo, enviarOk);
  const firmado = texto.encode(JSON.stringify({ ids: [ID1] }));
  const buena = await firmar(SECRETO, String(AHORA_S), firmado);
  const otraClave = await firmar("otro-secreto", String(AHORA_S), firmado);
  const cambiada = (buena[0] === "0" ? "1" : "0") + buena.slice(1);
  for (const firma of [otraClave, cambiada, buena.slice(0, -1), `${buena}0`, "z".repeat(64), SECRETO, ""]) {
    const r = await manejar(await pedido({ ids: [ID1] }, SECRETO, "POST", { cabeceras: { "x-mail-firma": firma } }));
    assert.equal(r.status, 401, firma);
    assert.deepEqual(await r.json(), { error: "No autorizado" });
  }
  assert.equal(repo.consultas, 0);
});

Deno.test("H_130_ts_viejo_futuro_o_mal_formado_responde_401_aunque_la_firma_sea_buena", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  const { manejar } = armar(repo, enviarOk);
  const casos = [
    String(AHORA_S - VENTANA_FIRMA_S - 1), // viejo
    String(AHORA_S + VENTANA_FIRMA_S + 1), // futuro
    `${AHORA_S}.5`,
    `-${AHORA_S}`,
    `${AHORA_S}000`,
    "abc",
    "",
  ];
  for (const ts of casos) {
    // La firma se calcula con el mismo ts: solo falla la ventana o el formato.
    const r = await manejar(await pedido({ ids: [ID1] }, SECRETO, "POST", { ts }));
    assert.equal(r.status, 401, ts);
    await r.body?.cancel();
  }
  assert.equal(repo.consultas, 0);
  assert.equal(tsVigente(String(AHORA_S), AHORA_S), true);
  assert.equal(tsVigente("1e9", 1e9), false);
});

Deno.test("H_130_cuerpo_alterado_tras_firmar_responde_401_sin_consultar_la_base", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)]]));
  const { manejar } = armar(repo, enviarOk);
  const firmado = JSON.stringify({ ids: [ID1] });
  for (
    const enviado of [JSON.stringify({ ids: [ID2] }), JSON.stringify({ ids: [ID1, ID2] }), `${firmado} `, "{}", ""]
  ) {
    const r = await manejar(await pedido(firmado, SECRETO, "POST", { enviado }));
    assert.equal(r.status, 401, enviado);
    await r.body?.cancel();
  }
  // La firma de un ts no vale para otro ts.
  const firma = await firmar(SECRETO, String(AHORA_S), texto.encode(firmado));
  const r = await manejar(
    await pedido(firmado, SECRETO, "POST", { ts: String(AHORA_S - 1), cabeceras: { "x-mail-firma": firma } }),
  );
  assert.equal(r.status, 401);
  await r.body?.cancel();
  assert.equal(repo.consultas, 0);
});

Deno.test("H_130_sin_cabeceras_o_con_solo_una_o_con_el_x_mail_secreto_viejo_responde_401", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  const { manejar } = armar(repo, enviarOk);
  const firma = await firmar(SECRETO, String(AHORA_S), texto.encode(JSON.stringify({ ids: [ID1] })));
  for (
    const cabeceras of <Record<string, string>[]> [
      {},
      { "x-mail-ts": String(AHORA_S) },
      { "x-mail-firma": firma },
      { "x-mail-secreto": SECRETO },
    ]
  ) {
    const r = await manejar(await pedido({ ids: [ID1] }, null, "POST", { cabeceras }));
    assert.equal(r.status, 401, JSON.stringify(Object.keys(cabeceras)));
    await r.body?.cancel();
  }
  assert.equal(repo.consultas, 0);
});

Deno.test("H_130_AVI_07_replay_del_mismo_pedido_firmado_dentro_de_la_ventana_no_reenvia", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  let llamadas = 0;
  const { manejar } = armar(repo, () => {
    llamadas++;
    return Promise.resolve();
  });
  const original = await pedido({ ids: [ID1] });
  const copia = original.clone();
  assert.deepEqual(await (await manejar(original)).json(), { enviados: 1, fallidos: 0 });
  const r = await manejar(copia);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enviados: 0, fallidos: 0 });
  assert.equal(llamadas, 1);
});

Deno.test("SEC_11_ids_invalidos_responden_400_sin_consultar_la_base", async () => {
  const repo = new RepoFalso(new Map());
  const { manejar } = armar(repo, enviarOk);
  const muchos = Array.from({ length: 51 }, () => ID1);
  for (
    const cuerpo of [
      { ids: ["no-es-uuid"] },
      { ids: [ID1, "1; drop table"] },
      { ids: [42] },
      { ids: ID1 },
      { ids: muchos },
      [ID1],
      "{no json",
      "null",
    ]
  ) {
    const r = await manejar(await pedido(cuerpo));
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.deepEqual(await r.json(), { error: "Pedido inválido" });
  }
  assert.equal(repo.consultas, 0);
});

Deno.test("SEC_11_iguales_compara_contenido_y_largo", () => {
  assert.equal(iguales("abc", "abc"), true);
  assert.equal(iguales("abc", "abd"), false);
  assert.equal(iguales("abc", "abcd"), false);
  assert.equal(iguales("", ""), true);
});

Deno.test("SEC_11_leerIds_acepta_hasta_50_uuid_y_quita_repetidos", () => {
  assert.deepEqual(leerIds({ ids: [ID1, ID1.toUpperCase(), ID2] }), [ID1, ID2]);
  assert.equal(leerIds({}), "todas");
  assert.deepEqual(leerIds({ ids: Array.from({ length: 50 }, () => ID1) }), [ID1]);
  assert.equal(leerIds({ ids: Array.from({ length: 51 }, () => ID1) }), null);
});

Deno.test("contratos_4_metodo_distinto_de_POST_responde_405", async () => {
  const repo = new RepoFalso(new Map());
  const { manejar } = armar(repo, enviarOk);
  const r = await manejar(await pedido(null, SECRETO, "GET"));
  assert.equal(r.status, 405);
  await r.body?.cancel();
  assert.equal(repo.consultas, 0);
});

// --- AVI-07 / NFR-07: envío y registro ---

Deno.test("AVI_07_envia_los_ids_reclamados_y_los_marca_enviado", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)]]));
  const enviados: MailReclamado[] = [];
  const { manejar } = armar(repo, (m) => {
    enviados.push(m);
    return Promise.resolve();
  });
  const r = await manejar(await pedido({ ids: [ID1, ID2] }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enviados: 2, fallidos: 0 });
  assert.deepEqual(enviados.map((m) => m.id), [ID1, ID2]);
  assert.deepEqual(repo.marcas, [
    { id: ID1, estado: "enviado", motivo: null },
    { id: ID2, estado: "enviado", motivo: null },
  ]);
});

Deno.test("AVI_07_cuerpo_vacio_toma_hasta_50_pendientes", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)]]));
  const { manejar } = armar(repo, enviarOk);
  const r = await manejar(await pedido(""));
  assert.deepEqual(await r.json(), { enviados: 2, fallidos: 0 });
});

Deno.test("AVI_07_fila_ya_reclamada_no_se_envia_dos_veces", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  let llamadas = 0;
  const { manejar } = armar(repo, () => {
    llamadas++;
    return Promise.resolve();
  });
  await (await manejar(await pedido({ ids: [ID1] }))).body?.cancel();
  const r = await manejar(await pedido({ ids: [ID1] }));
  assert.deepEqual(await r.json(), { enviados: 0, fallidos: 0 });
  assert.equal(llamadas, 1);
});

Deno.test("NFR_07_error_smtp_marca_fallido_con_el_texto_del_error_cortado_a_500", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)]]));
  const largo = "Invalid login: 535-5.7.8 Username and Password not accepted " + "x".repeat(600);
  const { manejar } = armar(repo, (m) => m.id === ID1 ? Promise.reject(new Error(largo)) : Promise.resolve());
  const r = await manejar(await pedido({ ids: [ID1, ID2] }));
  assert.deepEqual(await r.json(), { enviados: 1, fallidos: 1 });
  assert.equal(repo.marcas[0].estado, "fallido");
  assert.equal(repo.marcas[0].motivo, largo.slice(0, MAX_MOTIVO));
  assert.equal(repo.marcas[1].estado, "enviado");
});

Deno.test("NFR_07_fila_sin_destinatario_queda_fallida_sin_intentar_el_envio", async () => {
  const repo = new RepoFalso(new Map([[ID1, { ...mail(ID1), destinatario: null }]]));
  let llamadas = 0;
  const { manejar } = armar(repo, () => {
    llamadas++;
    return Promise.resolve();
  });
  const r = await manejar(await pedido({ ids: [ID1] }));
  assert.deepEqual(await r.json(), { enviados: 0, fallidos: 1 });
  assert.equal(llamadas, 0);
  assert.deepEqual(repo.marcas, [{ id: ID1, estado: "fallido", motivo: "Sin destinatario" }]);
});

// --- H-017: tiempos ---

Deno.test("H_017_un_envio_que_supera_el_tope_queda_fallido_y_aborta_el_transporte", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]));
  let abortado = false;
  const colgado: Enviar = (_m, senal) =>
    new Promise((_, rechazar) => {
      senal.addEventListener("abort", () => {
        abortado = true;
        rechazar(new Error("cerrado"));
      });
    });
  const { manejar } = armar(repo, colgado, { topeMailMs: 20 });
  const r = await manejar(await pedido({ ids: [ID1] }));
  assert.deepEqual(await r.json(), { enviados: 0, fallidos: 1 });
  assert.equal(abortado, true);
  assert.equal(repo.marcas[0].motivo, "Tiempo agotado: el envío superó 0.02 s");
});

Deno.test("H_017_al_agotar_el_presupuesto_deja_de_reclamar_y_el_resto_sigue_pendiente", async () => {
  const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)], [ID3, mail(ID3)]]));
  let reloj = 0;
  const { manejar, eventos } = armar(repo, () => {
    reloj += 60_000; // cada envío «tarda» 60 s
    return Promise.resolve();
  }, { ahora: () => reloj, presupuestoMs: 100_000 });
  const r = await manejar(await pedido({ ids: [ID1, ID2, ID3] }));
  assert.deepEqual(await r.json(), { enviados: 2, fallidos: 0 });
  assert.deepEqual(repo.reclamados, [ID1, ID2]);
  assert.deepEqual(eventos.at(-1), { evento: "presupuesto_agotado", sin_reclamar: 1 });
});

// --- Errores de base ---

Deno.test("contratos_4_sin_acceso_a_la_base_responde_500", async () => {
  for (const falla of ["pendientes", "reclamar"]) {
    const repo = new RepoFalso(new Map([[ID1, mail(ID1)]]), falla);
    const { manejar, eventos } = armar(repo, enviarOk);
    const r = await manejar(await pedido(falla === "pendientes" ? {} : { ids: [ID1] }));
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "Sin acceso a la base" });
    assert.deepEqual(eventos, [{ evento: "error_base", etapa: falla, estado: 503 }]);
  }
});

// --- SEC-17: los logs no llevan destinatario, asunto, cuerpo, motivo ni secreto ---

Deno.test("SEC_17_logs_capturados_no_contienen_destinatario_ni_datos_del_mail", async () => {
  const capturado: string[] = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const capturar = (...a: unknown[]) =>
    capturado.push(a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "));
  console.log =
    console.error =
    console.warn =
    console.info =
      capturar;
  try {
    const repo = new RepoFalso(new Map([[ID1, mail(ID1)], [ID2, mail(ID2)]]));
    // Registro por defecto (console.log), como en producción.
    const manejar = crearManejador({
      secreto: SECRETO,
      repo,
      enviar: (m) =>
        m.id === ID1 ? Promise.reject(new Error(`550 5.1.1 <${DESTINATARIO}> rechazado`)) : Promise.resolve(),
    });
    await (await manejar(await pedido({ ids: [ID1, ID2] }))).body?.cancel();
    await (await manejar(await pedido({}, "otro"))).body?.cancel();
    await (await manejar(await pedido({}, SECRETO, "POST", { ts: "1" }))).body?.cancel();
  } finally {
    Object.assign(console, originales);
  }
  const todo = capturado.join("\n");
  assert.ok(capturado.length >= 2, "se registran eventos");
  for (const prohibido of [DESTINATARIO, "Asunto centinela", "Cuerpo centinela", "rechazado", SECRETO]) {
    assert.ok(!todo.includes(prohibido), `el log contiene «${prohibido}»`);
  }
});
