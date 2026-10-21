// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR_UI = join(process.cwd(), 'src', 'ui');
const tokensCss = readFileSync(join(DIR_UI, 'tokens.css'), 'utf8');

function token(nombre: string): string {
  const coincide = new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6});`).exec(tokensCss);
  if (!coincide?.[1]) throw new Error(`Falta el token de color --${nombre}`);
  return coincide[1];
}

function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = canales;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

// [texto o componente, fondo, mínimo]; 4,5 texto normal, 3 componentes de interfaz (1.4.11).
const PARES: ReadonlyArray<readonly [string, string, number]> = [
  ['c-texto', 'c-fondo', 4.5],
  ['c-texto', 'c-superficie', 4.5],
  ['c-texto-suave', 'c-fondo', 4.5],
  ['c-texto-suave', 'c-superficie', 4.5],
  ['c-sobre-primario', 'c-primario', 4.5],
  ['c-sobre-primario', 'c-primario-hover', 4.5],
  ['c-primario', 'c-fondo', 4.5],
  ['c-primario', 'c-superficie', 4.5],
  ['c-sobre-error', 'c-error', 4.5],
  ['c-sobre-error', 'c-error-hover', 4.5],
  ['c-error', 'c-fondo', 4.5],
  ['c-error', 'c-error-fondo', 4.5],
  ['c-aviso-texto', 'c-aviso-fondo', 4.5],
  ['c-info-texto', 'c-info-fondo', 4.5],
  ['c-exito-texto', 'c-exito-fondo', 4.5],
  ['c-libre-texto', 'c-libre-fondo', 4.5],
  ['c-ocupado-texto', 'c-ocupado-fondo', 4.5],
  ['c-bloqueado-texto', 'c-bloqueado-fondo', 4.5],
  ['c-borde', 'c-fondo', 3],
  ['c-borde', 'c-superficie', 3],
  ['c-libre-borde', 'c-fondo', 3],
  ['c-ocupado-borde', 'c-fondo', 3],
  ['c-bloqueado-borde', 'c-fondo', 3],
  ['c-primario', 'c-fondo', 3],
];

describe('tokens.css · contraste de cada par (A11Y-06, NFR-05)', () => {
  it.each(PARES)('%s sobre %s >= %s:1', (texto, fondo, minimo) => {
    expect(contraste(token(texto), token(fondo))).toBeGreaterThanOrEqual(minimo);
  });
});

describe('tokens.css · tamaños (NFR-06, CA-38)', () => {
  it('define el área táctil mínima de 44 px y el foco de 3 px', () => {
    expect(tokensCss).toMatch(/--tactil-min:\s*2\.75rem;/);
    expect(tokensCss).toMatch(/--foco-ancho:\s*3px;/);
  });
});

describe('estilos de src/ui · sin valores literales fuera de tokens.css', () => {
  const archivos = readdirSync(DIR_UI).filter((f) => f.endsWith('.module.css') || f === 'base.css' || f.endsWith('.tsx'));

  it('hay estilos que revisar', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it.each(archivos)('%s no usa colores, píxeles ni sombras literales', (archivo) => {
    const texto = readFileSync(join(DIR_UI, archivo), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const colores = texto.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
    expect(colores).toEqual([]);
    if (archivo.endsWith('.tsx')) return;
    const pixeles = texto.match(/\b\d+(\.\d+)?px\b/g) ?? [];
    expect(pixeles).toEqual([]);
    expect(texto).not.toMatch(/box-shadow:(?!\s*(?:var\(|none))/);
  });
});
