// Pruebas de auditar.mjs (SEC-22): una excepcion vencida hace fallar el job.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avisosDe, evaluar, validarExcepciones } from './auditar.mjs';

const auditoria = (...avisos) => ({
  vulnerabilities: Object.fromEntries(
    avisos.map((a, i) => [`paquete${i}`, { via: [{ source: i, name: `paquete${i}`, title: 'titulo', url: `https://github.com/advisories/${a.id}`, severity: a.severidad }, 'otro'] }]),
  ),
});
const ALTA = { id: 'GHSA-aaaa-bbbb-cccc', severidad: 'high' };
const MEDIA = { id: 'GHSA-dddd-eeee-ffff', severidad: 'moderate' };
const exc = (cambios = {}) => ({ id: ALTA.id, motivo: 'sin parche', aprobada: '2026-10-20', vence: '2026-11-10', aceptadaPor: 'profesor', ...cambios });
const HOY = new Date('2026-10-25T12:00:00Z');

test('un aviso alto sin excepcion bloquea; uno moderado no', () => {
  assert.equal(evaluar(auditoria(ALTA), [], { hoy: HOY }).length, 1);
  assert.deepEqual(evaluar(auditoria(MEDIA), [], { hoy: HOY }), []);
  assert.deepEqual(evaluar(auditoria(), [], { hoy: HOY }), []);
});

test('un aviso critico bloquea tambien en el modo de desarrollo; uno alto no', () => {
  assert.deepEqual(evaluar(auditoria(ALTA), [], { minimo: 'critical', hoy: HOY }), []);
  assert.equal(evaluar(auditoria({ id: 'GHSA-gggg-hhhh-iiii', severidad: 'critical' }), [], { minimo: 'critical', hoy: HOY }).length, 1);
});

test('un aviso con excepcion vigente pasa', () => {
  assert.deepEqual(evaluar(auditoria(ALTA), [exc()], { hoy: HOY }), []);
});

test('una excepcion vencida hace fallar aunque el aviso siga o ya no exista', () => {
  const vencida = exc({ vence: '2026-10-24' });
  assert.match(evaluar(auditoria(ALTA), [vencida], { hoy: HOY }).join('\n'), /vencida/);
  assert.match(evaluar(auditoria(), [vencida], { hoy: HOY }).join('\n'), /vencida/);
});

test('una excepcion vence el dia indicado y falla al dia siguiente', () => {
  assert.deepEqual(validarExcepciones([exc({ vence: '2026-10-25' })], HOY), []);
  assert.equal(validarExcepciones([exc({ vence: '2026-10-25' })], new Date('2026-10-26T00:00:00Z')).length, 1);
});

test('una excepcion de mas de 30 dias, sin motivo, sin aceptacion o mal formada falla', () => {
  assert.match(validarExcepciones([exc({ vence: '2026-12-01' })], HOY)[0], /30 dias/);
  assert.match(validarExcepciones([exc({ motivo: '' })], HOY)[0], /motivo/);
  assert.match(validarExcepciones([exc({ aceptadaPor: undefined })], HOY)[0], /acepta/);
  assert.match(validarExcepciones([exc({ id: 'cualquiera' })], HOY)[0], /GHSA/);
  assert.match(validarExcepciones([exc({ vence: 'manana' })], HOY)[0], /fechas/);
});

test('avisosDe ignora las vias que son nombres de paquete', () => {
  assert.equal(avisosDe(auditoria(ALTA, MEDIA)).length, 2);
});
