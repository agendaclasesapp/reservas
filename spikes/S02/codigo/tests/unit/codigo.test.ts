import { describe, expect, it } from 'vitest';
import { clasificarErrorCodigo, VIGENCIA_CODIGO_MS } from '../../src/codigo';

const GOTRUE = { status: 403, code: 'otp_expired' };
const PEDIDO = Date.UTC(2026, 9, 21, 12, 0, 0);

describe('S02 plan B de WEB-02: distinguir código erróneo de vencido en la SPA', () => {
  it('S02_WEB_02_antes_de_600s_es_incorrecto', () => {
    expect(clasificarErrorCodigo(GOTRUE, PEDIDO, PEDIDO + VIGENCIA_CODIGO_MS - 1)).toBe('incorrecto');
  });
  it('S02_WEB_02_desde_600s_es_vencido', () => {
    expect(clasificarErrorCodigo(GOTRUE, PEDIDO, PEDIDO + VIGENCIA_CODIGO_MS)).toBe('vencido');
  });
  it('S02_WEB_02_429_es_demasiados_intentos_y_sin_error_es_null', () => {
    expect(clasificarErrorCodigo({ status: 429, code: 'over_request_rate_limit' }, PEDIDO, PEDIDO)).toBe('demasiados_intentos');
    expect(clasificarErrorCodigo({ status: 500 }, PEDIDO, PEDIDO)).toBe('otro');
    expect(clasificarErrorCodigo(null, PEDIDO, PEDIDO)).toBeNull();
  });
});
