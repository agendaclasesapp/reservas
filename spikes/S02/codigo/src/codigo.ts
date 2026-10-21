// Plan B del spike S02 para WEB-02: GoTrue responde lo mismo (403 otp_expired, "Token has expired
// or is invalid") a un código erróneo, vencido o ya usado. La SPA distingue "vencido" con la hora en
// que pidió el código y la vigencia configurada (otp_expiry = 600 s, DEC-11).

export const VIGENCIA_CODIGO_MS = 600_000;

export type ErrorCodigo = 'vencido' | 'incorrecto' | 'demasiados_intentos' | 'otro';

export function clasificarErrorCodigo(
  error: { status?: number; code?: string } | null,
  pedidoEnMs: number,
  ahoraMs: number,
): ErrorCodigo | null {
  if (error === null) return null;
  if (error.status === 429) return 'demasiados_intentos';
  if (error.code !== 'otp_expired') return 'otro';
  return ahoraMs - pedidoEnMs >= VIGENCIA_CODIGO_MS ? 'vencido' : 'incorrecto';
}
