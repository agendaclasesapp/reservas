// Une supabase/tests/lista_rpc/*.txt (cada bolt agrega el suyo, SEC-04) y lo incrusta entre los marcadores
// de supabase/tests/00_catalogo.test.sql: pg_prove corre dentro del contenedor de la base y no lee
// archivos del repositorio. Uso: node tests/soporte/sincronizar-lista-rpc.mjs [--verificar]
// Formato de cada línea (comentarios con #): `<rol> <funcion>` con rol = anon | authenticated.
//   anon          la ejecutan anon y authenticated (RPC [A] de contratos.md §3)
//   authenticated solo la ejecuta authenticated (RPC [U] y [P])
// El nombre va sin esquema y sin paréntesis; las sobrecargas comparten línea.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests/lista_rpc';
const DESTINO = 'supabase/tests/00_catalogo.test.sql';
const INI = '-- LISTA_RPC:INICIO (generado por tests/soporte/sincronizar-lista-rpc.mjs; no editar a mano)';
const FIN = '-- LISTA_RPC:FIN';

export function leerLista(dir = DIR) {
  const filas = new Map(); // funcion -> 'anon' | 'authenticated'
  for (const f of readdirSync(dir).filter((n) => /^\d+\.txt$/.test(n)).sort()) {
    for (const [i, crudo] of readFileSync(join(dir, f), 'utf8').split(/\r?\n/).entries()) {
      const linea = crudo.replace(/#.*/, '').trim();
      if (!linea) continue;
      const m = /^(anon|authenticated)\s+(?:public\.)?([a-z_][a-z0-9_]*)(?:\(.*\))?$/i.exec(linea);
      if (!m) throw new Error(`${f}:${i + 1}: línea inválida «${crudo}» (esperado «anon|authenticated <funcion>»)`);
      const [, rol, fn] = m;
      const previo = filas.get(fn);
      if (!previo || rol === 'anon') filas.set(fn, rol);
    }
  }
  return [...filas.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function bloque(filas) {
  const valores = filas.length
    ? filas.map(([fn, rol]) => `  ('${rol}', '${fn}')`).join(',\n')
    : "  (null, null)";
  return `${INI}\ninsert into lista_rpc (rol, funcion) values\n${valores};\n${filas.length ? '' : 'delete from lista_rpc where rol is null;\n'}${FIN}`;
}

export function incrustar(texto, filas) {
  const a = texto.indexOf(INI);
  const b = texto.indexOf(FIN);
  if (a < 0 || b < 0) throw new Error(`${DESTINO} no tiene los marcadores LISTA_RPC`);
  // Conserva el fin de línea del archivo (Git en Windows puede dejarlo en CRLF).
  const crlf = texto.includes('\r\n');
  const nuevo = crlf ? bloque(filas).replaceAll('\n', '\r\n') : bloque(filas);
  return texto.slice(0, a) + nuevo + texto.slice(b + FIN.length);
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('sincronizar-lista-rpc.mjs')) {
  const actual = readFileSync(DESTINO, 'utf8');
  const nuevo = incrustar(actual, leerLista());
  if (process.argv.includes('--verificar')) {
    if (nuevo !== actual) {
      console.error('00_catalogo.test.sql está desactualizado: corre node tests/soporte/sincronizar-lista-rpc.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(DESTINO, nuevo);
    console.log('lista_rpc incrustada en', DESTINO);
  }
}
