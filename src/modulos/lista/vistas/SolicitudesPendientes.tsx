// Sección «Solicitudes pendientes» de `#/lista` (WEB-07, PRF-06, SOL-04..08, PRF-08, AVI-03, SEC-09, SEC-16;
// flujos-profesor.md F-10). Ordenadas por fecha de clase (como las entrega la base). «Confirmar» responde de
// una; «Rechazar» abre el motivo opcional (hasta 500 caracteres) que la persona recibe por mail. Tras responder,
// la tarjeta sale de la lista, se anuncia el resultado y el foco pasa a ese aviso. Las vencidas («pendiente sin
// respuesta») quedan aparte y sin acciones. Estados: cargando, error con reintentar y vacío; el acceso solo del
// profesor lo decide la guarda de ruta.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alerta, Cargando, ErrorCarga, Icono, Vacio } from '../../../ui';
import {
  MENSAJES_RESPUESTA,
  nombreVisible,
  separarVencidas,
  type Decision,
  type EstadoLectura,
  type ResultadoRespuesta,
  type SolicitudPendiente,
} from '../logica';
import { RechazoDialogo } from './RechazoDialogo';
import estilos from './SolicitudesPendientes.module.css';
import { TarjetaSolicitud } from './TarjetaSolicitud';

export type SolicitudesPendientesProps = {
  datos: EstadoLectura<SolicitudPendiente>;
  /** Huso del profesor, para la fecha y la hora de cada solicitud. */
  zona: string;
  /** `sesion.profesor.activo`: inactivo, no confirma pero sí rechaza (PRF-08). Por defecto, activo. */
  profesorActivo?: boolean;
  /** `responderSolicitud` de `logica/`: devuelve un resultado, no lanza. */
  onResponder: (solicitudId: string, decision: Decision, motivo: string | null) => Promise<ResultadoRespuesta>;
  /** Vuelve a leer `v_solicitudes_pendientes`; se llama después de cada respuesta y en «Reintentar». */
  onRecargar: () => void;
};

/** Códigos tras los cuales la lista que ve el profesor quedó desactualizada: se vuelve a leer. */
const CODIGOS_DESACTUALIZADA = new Set(['SOLICITUD_YA_RESPONDIDA', 'SOLICITUD_VENCIDA', 'NO_ENCONTRADO']);

const ID_TITULO = 'solicitudes-pendientes-titulo';

function textoCuenta(n: number): string {
  return n === 1 ? '1 solicitud pendiente de respuesta' : `${n} solicitudes pendientes de respuesta`;
}

export function SolicitudesPendientes({
  datos,
  zona,
  profesorActivo = true,
  onResponder,
  onRecargar,
}: SolicitudesPendientesProps) {
  const [ocupada, setOcupada] = useState<{ id: string; decision: Decision } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [respondidas, setRespondidas] = useState<ReadonlySet<string>>(new Set());
  const [rechazo, setRechazo] = useState<SolicitudPendiente | null>(null);
  const [resultado, setResultado] = useState('');
  const resultadoRef = useRef<HTMLDivElement>(null);

  // La tarjeta que respondió ya no está: el foco pasa al aviso del resultado, que además se anuncia.
  useEffect(() => {
    if (resultado !== '') resultadoRef.current?.focus();
  }, [resultado]);

  const { vigentes, vencidas } = useMemo(
    () => separarVencidas(datos.filas.filter((s) => !respondidas.has(s.id))),
    [datos.filas, respondidas],
  );

  const sinErrorDe = (id: string) => setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([k]) => k !== id)));

  const alResponder = (s: SolicitudPendiente, r: ResultadoRespuesta) => {
    if (!r.ok) {
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onRecargar();
      return;
    }
    setRespondidas((previas) => new Set(previas).add(s.id));
    setResultado(r.estado === 'confirmada' ? MENSAJES_RESPUESTA.confirmada : MENSAJES_RESPUESTA.rechazada);
    onRecargar();
  };

  const confirmar = async (s: SolicitudPendiente) => {
    setResultado('');
    sinErrorDe(s.id);
    setOcupada({ id: s.id, decision: 'confirmar' });
    const r = await onResponder(s.id, 'confirmar', null);
    setOcupada(null);
    if (!r.ok) setErrores((previos) => ({ ...previos, [s.id]: r.mensaje }));
    alResponder(s, r);
  };

  const rechazar = async (motivo: string) => {
    if (rechazo === null) return { ok: false as const, mensaje: '', campo: null, codigo: 'DESCONOCIDO' };
    const r = await onResponder(rechazo.id, 'rechazar', motivo === '' ? null : motivo);
    if (!r.ok) {
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) {
        // Ya no se puede responder: se cierra el diálogo y el motivo del fallo queda en la tarjeta.
        setErrores((previos) => ({ ...previos, [rechazo.id]: r.mensaje }));
        setRechazo(null);
        onRecargar();
      }
      return r;
    }
    setRechazo(null);
    alResponder(rechazo, r);
    return { ok: true as const };
  };

  const primeraCarga = datos.estado === 'cargando' && datos.filas.length === 0;
  const hayError = datos.estado === 'error';
  const sinNada = datos.estado === 'listo' && vigentes.length === 0 && vencidas.length === 0;

  return (
    <section aria-labelledby={ID_TITULO} className={estilos.seccion}>
      <h2 id={ID_TITULO} className={estilos.titulo}>
        Solicitudes pendientes
      </h2>
      <div ref={resultadoRef} tabIndex={-1} role="status" aria-live="polite" className={estilos.resultado}>
        {resultado !== '' ? (
          <p className={estilos.exito}>
            <Icono nombre="tilde" etiqueta="Éxito" />
            <span>{resultado}</span>
          </p>
        ) : null}
      </div>
      {primeraCarga ? <Cargando etiqueta="Cargando las solicitudes pendientes…" renglones={2} /> : null}
      {hayError ? (
        <ErrorCarga
          mensaje={`No se pudieron cargar las solicitudes pendientes. ${datos.error ?? ''}`.trim()}
          onReintentar={onRecargar}
        />
      ) : null}
      {sinNada ? <Vacio nivel={3} titulo="No hay solicitudes pendientes" /> : null}
      {vigentes.length > 0 ? (
        <div className={estilos.grupo}>
          <p className={estilos.cuenta}>{textoCuenta(vigentes.length)}</p>
          {profesorActivo ? null : <Alerta tipo="aviso">{MENSAJES_RESPUESTA.profesorInactivo}</Alerta>}
          <ul className={estilos.lista}>
            {vigentes.map((s) => (
              <li key={s.id}>
                <TarjetaSolicitud
                  solicitud={s}
                  zona={zona}
                  ocupada={ocupada !== null && ocupada.id === s.id ? ocupada.decision : null}
                  error={errores[s.id]}
                  profesorActivo={profesorActivo}
                  onConfirmar={(sol) => void confirmar(sol)}
                  onRechazar={(sol) => {
                    sinErrorDe(sol.id);
                    setResultado('');
                    setRechazo(sol);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {vencidas.length > 0 ? (
        <div className={estilos.grupo}>
          <h3 className={estilos.subtitulo}>Pendientes sin respuesta</h3>
          <ul className={estilos.lista}>
            {vencidas.map((s) => (
              <li key={s.id}>
                <TarjetaSolicitud
                  solicitud={s}
                  zona={zona}
                  profesorActivo={profesorActivo}
                  onConfirmar={() => undefined}
                  onRechazar={() => undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rechazo ? (
        <RechazoDialogo
          nombre={nombreVisible(rechazo.titular)}
          titulo={`Rechazar la solicitud de ${nombreVisible(rechazo.titular)}`}
          textoAccion="Rechazar solicitud"
          aviso={MENSAJES_RESPUESTA.avisoMotivo}
          onEnviar={rechazar}
          onCerrar={() => setRechazo(null)}
        />
      ) : null}
    </section>
  );
}
