// Hooks de la pantalla del Administrador (WEB-10): la lista de profesores (ADM-03), el alta (ADM-02) y el
// cambio de estado (ADM-05). Reciben la operación para poder probarlos sin red; index.ts los conecta.
import { useCallback, useEffect, useRef, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import { falloAdmin, type ResultadoAltaProfesor, type ResultadoEstadoProfesor } from './admin';
import type { ProfesorEntrada, ProfesorLista } from './tipos';

export type LectorProfesores = () => Promise<ProfesorLista[]>;
export type AccionAlta = (datos: ProfesorEntrada) => Promise<ResultadoAltaProfesor>;
export type AccionEstado = (profesorId: string, activo: boolean) => Promise<ResultadoEstadoProfesor>;

export interface EstadoProfesores {
  estado: 'cargando' | 'listo' | 'error';
  profesores: ProfesorLista[];
  error: string | null;
}

const INICIAL: EstadoProfesores = { estado: 'cargando', profesores: [], error: null };

/**
 * Lee la lista al montar y en cada `recargar()` (después de un alta o de un cambio de estado). Mientras recarga
 * conserva la lista anterior; un error deja el texto traducido, nunca `details` (SEC-17).
 */
export function useProfesores(lector: LectorProfesores): { datos: EstadoProfesores; recargar: () => void } {
  const [datos, setDatos] = useState<EstadoProfesores>(INICIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (profesores) => {
        if (vigente) setDatos({ estado: 'listo', profesores, error: null });
      },
      (e: unknown) => {
        if (vigente) {
          setDatos((previo) => ({ estado: 'error', profesores: previo.profesores, error: mensajeDeError(e) }));
        }
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => {
    setDatos((previo) => ({ estado: 'cargando', profesores: previo.profesores, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { datos, recargar };
}

/**
 * Alta de un profesor. `enviando` mientras espera la respuesta; un segundo envío mientras tanto devuelve la
 * misma promesa (no repite la escritura). `resultado` queda hasta `limpiar()` o el envío siguiente.
 */
export function useAltaProfesor(accion: AccionAlta): {
  enviando: boolean;
  resultado: ResultadoAltaProfesor | null;
  enviar: (datos: ProfesorEntrada) => Promise<ResultadoAltaProfesor>;
  limpiar: () => void;
} {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAltaProfesor | null>(null);
  const enCurso = useRef<Promise<ResultadoAltaProfesor> | null>(null);

  const enviar = useCallback(
    (datos: ProfesorEntrada) => {
      if (enCurso.current) return enCurso.current;
      setEnviando(true);
      setResultado(null);
      const promesa = accion(datos)
        .catch((e: unknown): ResultadoAltaProfesor => falloAdmin(e))
        .then((r) => {
          enCurso.current = null;
          setEnviando(false);
          setResultado(r);
          return r;
        });
      enCurso.current = promesa;
      return promesa;
    },
    [accion],
  );

  const limpiar = useCallback(() => setResultado(null), []);

  return { enviando, resultado, enviar, limpiar };
}

/**
 * Inactivar o reactivar (ADM-05). `cambiando` es el id del profesor en curso (la vista deshabilita su botón);
 * mientras hay uno en curso, otro pedido devuelve la misma promesa. `resultado` es el del último cambio.
 */
export function useCambiarEstadoProfesor(accion: AccionEstado): {
  cambiando: string | null;
  resultado: ResultadoEstadoProfesor | null;
  cambiar: (profesorId: string, activo: boolean) => Promise<ResultadoEstadoProfesor>;
} {
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEstadoProfesor | null>(null);
  const enCurso = useRef<Promise<ResultadoEstadoProfesor> | null>(null);

  const cambiar = useCallback(
    (profesorId: string, activo: boolean) => {
      if (enCurso.current) return enCurso.current;
      setCambiando(profesorId);
      setResultado(null);
      const promesa = accion(profesorId, activo)
        .catch((e: unknown): ResultadoEstadoProfesor => falloAdmin(e))
        .then((r) => {
          enCurso.current = null;
          setCambiando(null);
          setResultado(r);
          return r;
        });
      enCurso.current = promesa;
      return promesa;
    },
    [accion],
  );

  return { cambiando, resultado, cambiar };
}
