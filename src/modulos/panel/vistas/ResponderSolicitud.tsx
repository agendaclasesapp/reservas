// CC-14 · Responder una solicitud pendiente (CAL-12, CA-76; F-CAL-06; DEC-42 A, DEC-43 A; A11Y-47, A11Y-54; SEC-16,
// SEC-35; ADR-025): «Confirmar» y «Rechazar». «Rechazar» abre el diálogo con el motivo opcional. Presentación pura:
// qué botones se ofrecen lo dice quien lo monta con `accionesRespuesta` de la lógica, o sea `accionesSolicitud` de la Lista (`puedeConfirmar`; «Rechazar» sigue
// con la agenda inactiva, PRF-08); el resultado (anuncio, relectura, foco) lo maneja el Panel. Estados: normal,
// enviando (el botón queda `aria-busy`), error (mensaje en `role=alert`) e inactivo («Confirmar» deshabilitado con su
// porqué en el nombre y, en el detalle, en texto). Nombre de quien pide: texto (SEC-16).
import { useState } from 'react';
import { Alerta, Boton } from '../../../ui';
import { MENSAJES_RESPUESTA, type ResultadoRespuestaCalendario } from '../logica';
import { RechazoSolicitud } from './RechazoSolicitud';
import estilos from './ResponderSolicitud.module.css';

export type ResponderSolicitudProps = {
  solicitud: {
    /** Quien pide, como texto. */
    nombre: string;
    /** Fecha y hora de la clase: con `variante="lista"` desambigua el nombre accesible de cada botón. */
    cuando: string;
  };
  /** `puedeConfirmar` de la lógica: false con la agenda inactiva (PRF-08). */
  puedeConfirmar: boolean;
  onConfirmar: () => Promise<ResultadoRespuestaCalendario>;
  /** Motivo recortado o `null` si no lo hay. */
  onRechazar: (motivo: string | null) => Promise<ResultadoRespuestaCalendario>;
  /** `detalle` (por defecto): botones «Confirmar» / «Rechazar»; `lista`: con la solicitud en su nombre accesible. */
  variante?: 'detalle' | 'lista';
};

type Estado = { estado: 'normal' } | { estado: 'enviando' } | { estado: 'error'; mensaje: string };

export function ResponderSolicitud({
  solicitud,
  puedeConfirmar,
  onConfirmar,
  onRechazar,
  variante = 'detalle',
}: ResponderSolicitudProps) {
  const [vista, setVista] = useState<Estado>({ estado: 'normal' });
  const [rechazando, setRechazando] = useState(false);
  const enviando = vista.estado === 'enviando';
  const nombreDe = (verbo: string) =>
    variante === 'lista' ? `${verbo} la solicitud de ${solicitud.nombre} para ${solicitud.cuando}` : verbo;

  const confirmar = async () => {
    if (enviando) return;
    setVista({ estado: 'enviando' });
    const r = await onConfirmar();
    setVista(r.ok ? { estado: 'normal' } : { estado: 'error', mensaje: r.mensaje });
  };

  const rechazar = async (motivo: string | null) => {
    const r = await onRechazar(motivo);
    if (r.ok) setRechazando(false);
    return r;
  };

  return (
    <div className={estilos.responder}>
      {vista.estado === 'error' ? <Alerta tipo="error">{vista.mensaje}</Alerta> : null}
      <div className={estilos.botones}>
        <Boton
          aria-label={`${nombreDe('Confirmar')}${puedeConfirmar ? '' : ', no disponible con la agenda inactiva'}`}
          cargando={enviando}
          textoCargando="Confirmando…"
          deshabilitado={!puedeConfirmar}
          onClick={() => void confirmar()}
        >
          Confirmar
        </Boton>
        <Boton
          variante="peligro"
          aria-label={nombreDe('Rechazar')}
          deshabilitado={enviando}
          onClick={() => {
            setVista({ estado: 'normal' });
            setRechazando(true);
          }}
        >
          Rechazar
        </Boton>
      </div>
      {!puedeConfirmar && variante === 'detalle' ? <p className={estilos.nota}>{MENSAJES_RESPUESTA.profesorInactivo}</p> : null}
      {rechazando ? (
        <RechazoSolicitud nombre={solicitud.nombre} onEnviar={rechazar} onCerrar={() => setRechazando(false)} />
      ) : null}
    </div>
  );
}
