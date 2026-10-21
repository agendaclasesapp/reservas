// Ejecuta un archivo SQL (o una consulta con -c) contra el proyecto real, sin `db push`.
// Uso: node nube/sql.mjs <archivo.sql> | node nube/sql.mjs -c "<consulta>"
import { readFileSync } from 'node:fs';
import { conectar } from './comun.mjs';

const [a, b] = process.argv.slice(2);
const sql = a === '-c' ? b : readFileSync(a, 'utf8');
const db = await conectar();
try {
  const r = await db.query(sql);
  for (const x of [r].flat()) if (x.rows?.length) console.table(x.rows);
  console.log('OK');
} catch (e) {
  console.log('ERROR', e.code ?? '', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
