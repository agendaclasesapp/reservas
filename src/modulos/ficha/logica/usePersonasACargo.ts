// Hook de personas a cargo (ALU-06) para la vista de la ficha.
import { useCallback, useEffect, useState } from 'react';
import { traducirError } from '../../../lib/errores';
import type { DependenciasFicha } from './ficha';
import { leerPersonasACargo } from './ficha';
import type { PersonaACargo } from './tipos';

export type EstadoPersonas =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; personas: PersonaACargo[] }
  | { tipo: 'error'; mensaje: string };

/** Lee las personas a cargo de `alumnoId` (null = todavía sin alumno: queda `cargando`). */
export function usePersonasACargo(
  alumnoId: string | null,
  deps: Pick<DependenciasFicha, 'obtenerCliente'>,
): { estado: EstadoPersonas; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoPersonas>({ tipo: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const { obtenerCliente } = deps;

  useEffect(() => {
    if (alumnoId === null) return;
    let vigente = true;
    leerPersonasACargo(alumnoId, { obtenerCliente }).then(
      (personas) => {
        if (vigente) setEstado({ tipo: 'ok', personas });
      },
      (e: unknown) => {
        if (vigente) setEstado({ tipo: 'error', mensaje: traducirError(e).mensaje });
      },
    );
    return () => {
      vigente = false;
    };
  }, [alumnoId, obtenerCliente, vuelta]);

  return { estado, recargar };
}
