// Lector mínimo de TOML para `supabase/config.toml`: secciones `[a.b]` y pares `clave = valor`
// (cadenas, números, booleanos y arreglos, también de varias líneas). Sin dependencias: alcanza para
// las reglas de SEC-12 y SEC-13 y no interpreta nada más.
export type Valor = string | number | boolean | Valor[];
export type Secciones = Record<string, Record<string, Valor>>;

function quitarComentario(linea: string): string {
  let comillas: string | null = null;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '\\' && comillas === '"') i++;
      else if (c === comillas) comillas = null;
    } else if (c === '"' || c === "'") comillas = c;
    else if (c === '#') return linea.slice(0, i);
  }
  return linea;
}

function parsearValor(crudo: string): Valor {
  const t = crudo.trim();
  if (t.startsWith('[')) {
    const interior = t.slice(1, t.lastIndexOf(']'));
    const items: Valor[] = [];
    const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|([^,\s][^,]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(interior))) items.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : parsearValor(m[3]));
    return items;
  }
  if (t.startsWith('"')) return t.slice(1, t.lastIndexOf('"')).replace(/\\(.)/g, '$1');
  if (t.startsWith("'")) return t.slice(1, t.lastIndexOf("'"));
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

export function parsearToml(texto: string): Secciones {
  const salida: Secciones = { '': {} };
  let actual = '';
  const lineas = texto.split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const linea = quitarComentario(lineas[i]).trim();
    if (!linea) continue;
    const sec = /^\[([^\]]+)\]$/.exec(linea);
    if (sec) {
      actual = sec[1].trim();
      salida[actual] ??= {};
      continue;
    }
    const par = /^([A-Za-z0-9_.\-"]+)\s*=\s*(.*)$/.exec(linea);
    if (!par) continue;
    let valor = par[2];
    // Arreglos de varias líneas: acumula hasta cerrar los corchetes.
    while (valor.trim().startsWith('[') && (valor.match(/\[/g) ?? []).length > (valor.match(/\]/g) ?? []).length && i + 1 < lineas.length) {
      valor += ' ' + quitarComentario(lineas[++i]).trim();
    }
    salida[actual][par[1].replace(/"/g, '')] = parsearValor(valor);
  }
  return salida;
}
