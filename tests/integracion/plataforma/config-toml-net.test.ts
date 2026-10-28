// H-131 (aceptado, opción a): la API pública no publica el esquema `net` de pg_net (supabase/config.toml, [api].schemas).
// Complementa las pruebas pgTAP «H-131» de supabase/tests/00_catalogo.test.sql. Si falla, revisar H-131.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';
import { parsearToml } from '../../soporte/toml';

const t = parsearToml(readFileSync(resolve(RAIZ, 'supabase/config.toml'), 'utf8'));

describe('H-131 esquemas publicados por la API', () => {
  it('H-131_net_no_esta_en_los_esquemas_de_la_API', () => {
    const esquemas = t.api?.schemas as string[];
    expect(Array.isArray(esquemas)).toBe(true);
    expect(esquemas).not.toContain('net');
  });
});
