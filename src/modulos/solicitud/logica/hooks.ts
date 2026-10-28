// Hooks de la solicitud de reserva para las vistas (B06, T06.1; las vistas son de T06.2).
// RES-05 (vista previa de la serie), SOL-01 (envío), SOL-09 (solo las propias), SOL-10 (mensaje con el límite).
import { useCallback, useEffect, useRef, useState } from 'react';
import { traducirError } from '../../../lib/errores';
import { leerMisSolicitudes, previsualizarSerie, solicitarReserva, type DependenciasSolicitud } from './solicitud';
import type { FalloSolicitud, FechaSerie, Frecuencia, MiSolicitud, ResultadoSolicitud, SolicitudEntrada } from './tipos';

export type EstadoPrevisualizacion =
  | { tipo: 'inactiva' }
  | { tipo: 'cargando' }
  | { tipo: 'ok'; fechas: FechaSerie[] }
  | { tipo: 'error'; fallo: FalloSolicitud };

/**
 * Vista previa de una serie (RES-05, CA-19). Sin profesor, inicio o frecuencia (p. ej. con «suelta»
 * elegido) queda `inactiva` y no llama. Una respuesta que llega tarde de una consulta anterior se descarta.
 */
export function usePrevisualizacionSerie(
  profesorId: string | null,
  inicio: string | null,
  frecuencia: Frecuencia | null,
  deps: DependenciasSolicitud,
): EstadoPrevisualizacion {
  const [resultado, setResultado] = useState<{ clave: string; estado: EstadoPrevisualizacion } | null>(null);
  const { obtenerCliente } = deps;
  const clave = profesorId === null || inicio === null || frecuencia === null ? null : `${profesorId}|${inicio}|${frecuencia}`;

  useEffect(() => {
    if (clave === null || profesorId === null || inicio === null || frecuencia === null) return;
    let vigente = true;
    void previsualizarSerie(profesorId, inicio, frecuencia, { obtenerCliente }).then((r) => {
      if (!vigente) return;
      setResultado({ clave, estado: r.ok ? { tipo: 'ok', fechas: r.fechas } : { tipo: 'error', fallo: r } });
    });
    return () => {
      vigente = false;
    };
  }, [clave, profesorId, inicio, frecuencia, obtenerCliente]);

  if (clave === null) return INACTIVA;
  return resultado !== null && resultado.clave === clave ? resultado.estado : CARGANDO;
}

const INACTIVA: EstadoPrevisualizacion = { tipo: 'inactiva' };
const CARGANDO: EstadoPrevisualizacion = { tipo: 'cargando' };

export type EstadoEnvio =
  | { tipo: 'listo' }
  | { tipo: 'enviando' }
  | { tipo: 'hecho'; resultado: ResultadoSolicitud };

/**
 * Envío de la solicitud (SOL-01). Mientras hay un envío en curso, otro `enviar` no llama a la base
 * (doble toque); nunca reintenta solo. `reiniciar()` vuelve a `listo` para otro pedido.
 */
export function useSolicitarReserva(deps: DependenciasSolicitud): {
  estado: EstadoEnvio;
  enviar: (entrada: SolicitudEntrada) => Promise<ResultadoSolicitud | null>;
  reiniciar: () => void;
} {
  const [estado, setEstado] = useState<EstadoEnvio>({ tipo: 'listo' });
  const enCurso = useRef(false);
  const montado = useRef(true);
  const { obtenerCliente } = deps;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const enviar = useCallback(
    async (entrada: SolicitudEntrada) => {
      if (enCurso.current) return null;
      enCurso.current = true;
      setEstado({ tipo: 'enviando' });
      const resultado = await solicitarReserva(entrada, { obtenerCliente });
      enCurso.current = false;
      if (montado.current) setEstado({ tipo: 'hecho', resultado });
      return resultado;
    },
    [obtenerCliente],
  );

  const reiniciar = useCallback(() => setEstado({ tipo: 'listo' }), []);

  return { estado, enviar, reiniciar };
}

export type EstadoMisSolicitudes =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; solicitudes: MiSolicitud[] }
  | { tipo: 'error'; mensaje: string };

/** Solicitudes de la persona de la sesión (SOL-09), opcionalmente de un profesor; `recargar()` tras pedir. */
export function useMisSolicitudes(
  profesorId: string | null,
  deps: DependenciasSolicitud,
): { estado: EstadoMisSolicitudes; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoMisSolicitudes>({ tipo: 'cargando' });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const { obtenerCliente } = deps;

  useEffect(() => {
    let vigente = true;
    leerMisSolicitudes({ obtenerCliente }, profesorId).then(
      (solicitudes) => {
        if (vigente) setEstado({ tipo: 'ok', solicitudes });
      },
      (e: unknown) => {
        if (vigente) setEstado({ tipo: 'error', mensaje: traducirError(e).mensaje });
      },
    );
    return () => {
      vigente = false;
    };
  }, [profesorId, obtenerCliente, vuelta]);

  return { estado, recargar };
}
