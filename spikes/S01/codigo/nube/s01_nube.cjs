// Spike S01 en el proyecto: aplica s01_nube.sql, carga Vault y prueba el trigger sin db push.
// Uso: node s01_nube.cjs <aplicar|vault|insertar ASUNTO|rollback ASUNTO|estado|limpiar>
// Entorno (nunca se imprime): SUPABASE_DB_PASSWORD, MAIL_SECRETO (solo para `vault`),
//   S01_REF (id del proyecto), S01_PARA (casilla destino), S01_POOLER (host del pooler de sesion).
// Requiere el paquete `pg` (NODE_PATH apuntando a un node_modules fuera del repo).
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ref = process.env.S01_REF;
const host = process.env.S01_POOLER || "aws-1-sa-east-1.pooler.supabase.com";
const para = process.env.S01_PARA;

async function conectar() {
  const c = new Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!ref || !process.env.SUPABASE_DB_PASSWORD) throw new Error("falta S01_REF o SUPABASE_DB_PASSWORD");
  const c = await conectar();
  try {
    if (cmd === "aplicar" || cmd === "limpiar") {
      const archivo = cmd === "aplicar" ? "s01_nube.sql" : "limpieza.sql";
      await c.query(fs.readFileSync(path.join(__dirname, archivo), "utf8"));
      console.log(`${archivo} aplicado`);
    } else if (cmd === "vault") {
      const url = `https://${ref}.supabase.co/functions/v1/enviar-mail`;
      for (const [nombre, valor] of [["s01_mail_secreto", process.env.MAIL_SECRETO], ["s01_url_funcion_mail", url]]) {
        if (!valor) throw new Error(`falta valor para ${nombre}`);
        const r = await c.query("select id from vault.secrets where name = $1", [nombre]);
        if (r.rowCount) await c.query("select vault.update_secret($1, $2)", [r.rows[0].id, valor]);
        else await c.query("select vault.create_secret($1, $2)", [valor, nombre]);
      }
      const r = await c.query(
        "select name, length(decrypted_secret) as largo from vault.decrypted_secrets where name like 's01_%' order by name");
      console.log(r.rows);
    } else if (cmd === "insertar" || cmd === "rollback") {
      if (!para || !arg) throw new Error("falta S01_PARA o ASUNTO");
      await c.query("begin");
      const r = await c.query(
        "insert into spike_s01.mail_prueba(para, asunto, cuerpo) values ($1, $2, $3) returning id",
        [para, arg, "Prueba del spike S01 (trigger after insert + pg_net + Vault)."]);
      const q = await c.query("select count(*)::int as cola from net.http_request_queue");
      console.log({ id: r.rows[0].id, cola_en_tx: q.rows[0].cola });
      await c.query(cmd === "insertar" ? "commit" : "rollback");
      console.log(cmd === "insertar" ? "commit" : "rollback");
    } else if (cmd === "estado") {
      const r = await c.query(`
        select m.id, m.asunto, m.request_id, h.status_code, h.error_msg,
               left(h.content, 400) as contenido, m.creado
          from spike_s01.mail_prueba m
          left join net._http_response h on h.id = m.request_id
         order by m.id`);
      console.log(JSON.stringify(r.rows, null, 1));
      const q = await c.query("select count(*)::int as cola from net.http_request_queue");
      console.log(q.rows[0]);
    } else {
      throw new Error("comando desconocido");
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
