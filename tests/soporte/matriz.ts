// Tipos de la matriz rol x RPC (SEC-06). Cada bolt agrega tests/integracion/seguridad/matriz/BB.ts con
// `export const filas: FilaRpc[]`; matriz-roles.spec.ts las une y falla si una RPC de lista_rpc no tiene fila.
import { ROLES, type Rol } from './usuarios';

export type Esperado =
  | { ok: true; forma?: (cuerpo: unknown) => void }
  | { error: number[]; message?: string };

export interface FilaRpc {
  rpc: string;
  args?: Record<string, unknown>;
  /** Un resultado por rol de ROLES (ROLES: anon, persona en cada estado, dos profesores y el Administrador). */
  esperado: Record<Rol, Esperado>;
  /** Caso de calidad o contrato que respalda la fila. */
  origen: string;
}

export const ok = (forma?: (cuerpo: unknown) => void): Esperado => ({ ok: true, forma });
export const error = (...http: number[]): Esperado => ({ error: http });

/** Mismo resultado para todos los roles salvo los que se indiquen. */
export function paraTodos(base: Esperado, excepciones: Partial<Record<Rol, Esperado>> = {}): Record<Rol, Esperado> {
  const todos = Object.fromEntries(ROLES.map((r) => [r, base])) as Record<Rol, Esperado>;
  return { ...todos, ...excepciones };
}
