// @vitest-environment jsdom
// EnlaceAccion (NFR-06, CA-38, H-404): enlace autónomo con su texto y destino; el área táctil sale del token en el CSS.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EnlaceAccion } from '../../../src/ui/EnlaceAccion';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

describe('EnlaceAccion', () => {
  it('es un enlace con su nombre accesible y su destino (NFR-06)', () => {
    render(<EnlaceAccion href="#/p/ana">Ver la agenda de Ana</EnlaceAccion>);
    expect(screen.getByRole('link', { name: 'Ver la agenda de Ana' }).getAttribute('href')).toBe('#/p/ana');
  });

  it('no tiene violaciones de axe', async () => {
    const { container } = render(<EnlaceAccion href="#/">Ver la agenda</EnlaceAccion>);
    await sinViolacionesAxe(container);
  });

  it('pide al menos --tactil-min de alto (CA-38, H-404)', () => {
    const css = readFileSync('src/ui/EnlaceAccion.module.css', 'utf-8');
    expect(css).toMatch(/min-block-size:\s*var\(--tactil-min\)/);
  });
});
