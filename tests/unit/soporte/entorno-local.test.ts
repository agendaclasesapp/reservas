// H-408 / H-420: la guardia de host local mira el host analizado de la URL, no el texto.
import { describe, expect, it } from 'vitest';
import { esLocal } from '../../soporte/entorno';

describe('H-408 H-420 esLocal', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321/x',
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:x@[::1]:54322/postgres',
  ])('acepta %s', (u) => expect(esLocal(u)).toBe(true));

  it.each([
    'postgresql://postgres:x@db.prod.example.com:5432/postgres?application_name=localhost',
    'https://abc.supabase.co/?x=localhost',
    'https://localhost.evil.com/',
    'http://user:localhost@evil.com/',
    'https://evil.com/127.0.0.1',
    'no es una url',
    '',
  ])('rechaza %s', (u) => expect(esLocal(u)).toBe(false));
});
