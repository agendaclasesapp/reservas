// Lectura de la ficha propia para mostrarla (WEB-03). Envuelve `leerMiFicha` de `logica/` con los estados de la
// vista como unión discriminada. Pendiente para el Developer: moverlo a `logica/` junto a `usePersonasACargo`.
import { useCallback, useEffect, useState } from 'react';
import { traducirError } from '../../../lib/errores';
import { leerMiFicha, type MiFicha } from '../logica';

export type EstadoMiFicha =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; ficha: MiFicha }
  | { tipo: 'error'; mensaje: string };

export function useMiFicha(alumnoId: string | null): { estado: EstadoMiFicha; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoMiFicha>({ tipo: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => {
    setEstado({ tipo: 'cargando' });
    setVuelta((v) => v + 1);
  }, []);

  useEffect(() => {
    if (alumnoId === null) return;
    let vigente = true;
    leerMiFicha(alumnoId).then(
      (ficha) => {
        if (!vigente) return;
        setEstado(
          ficha === null
            ? { tipo: 'error', mensaje: 'No encontramos tu ficha. Probá de nuevo en unos minutos.' }
            : { tipo: 'ok', ficha },
        );
      },
      (e: unknown) => {
        if (vigente) setEstado({ tipo: 'error', mensaje: traducirError(e).mensaje });
      },
    );
    return () => {
      vigente = false;
    };
  }, [alumnoId, vuelta]);

  return { estado, recargar };
}
