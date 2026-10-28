// Hook para pedir mover o cancelar una clase (B08; SOL-02, SOL-03). Guarda el envío en curso y el último resultado.
import { useCallback, useState } from 'react';
import {
  solicitarCancelacion,
  solicitarMovimiento,
  type DependenciasCambios,
  type ResultadoCancelacion,
  type ResultadoMovimiento,
} from './cambios';
import type { Alcance, ClaseMia } from './tipos';

export interface EstadoCambioDeClase {
  enviando: boolean;
  /** Último resultado (éxito o fallo ya traducido); null antes de enviar o tras `limpiar()`. */
  resultado: ResultadoMovimiento | ResultadoCancelacion | null;
}

export interface CambioDeClase extends EstadoCambioDeClase {
  mover: (clase: Pick<ClaseMia, 'id' | 'reserva_tipo'>, destino: string | null, alcance: Alcance) => Promise<ResultadoMovimiento>;
  cancelar: (clase: Pick<ClaseMia, 'id' | 'reserva_tipo'>, alcance: Alcance) => Promise<ResultadoCancelacion>;
  limpiar: () => void;
}

/** Tras un `ok: true`, la vista llama `recargar()` de `useMisClases` para ver la solicitud pendiente. */
export function useCambioDeClase(deps: DependenciasCambios): CambioDeClase {
  const [estado, setEstado] = useState<EstadoCambioDeClase>({ enviando: false, resultado: null });

  const mover = useCallback<CambioDeClase['mover']>(
    async (clase, destino, alcance) => {
      setEstado({ enviando: true, resultado: null });
      const r = await solicitarMovimiento(clase, destino, alcance, deps);
      setEstado({ enviando: false, resultado: r });
      return r;
    },
    [deps],
  );

  const cancelar = useCallback<CambioDeClase['cancelar']>(
    async (clase, alcance) => {
      setEstado({ enviando: true, resultado: null });
      const r = await solicitarCancelacion(clase, alcance, deps);
      setEstado({ enviando: false, resultado: r });
      return r;
    },
    [deps],
  );

  const limpiar = useCallback(() => setEstado({ enviando: false, resultado: null }), []);

  return { ...estado, mover, cancelar, limpiar };
}
