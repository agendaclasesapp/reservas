// CC-14 · Diálogo del rechazo con motivo opcional (CAL-12, CA-76; A11Y-54; SEC-16, SEC-35; ADR-025): propio del Panel,
// con `Dialogo`, `Campo` y `Boton` de `src/ui` y los textos y la validación de la Lista (`MENSAJES_RESPUESTA`, `validarMotivo`). Avisa
// que la persona va a ver el motivo; el error de largo y el que devuelve la respuesta quedan asociados al campo
// (`aria-describedby`, `aria-invalid` los pone `Campo`) y el foco vuelve a él. El texto se envía tal cual y se muestra
// siempre como texto.
import { useId, useState, type FormEvent } from 'react';
import { Boton, Campo, Dialogo } from '../../../ui';
import { LARGO_MAX_MOTIVO, MENSAJES_RESPUESTA, validarMotivo, type ResultadoRespuestaCalendario } from '../logica';
import estilos from './ResponderSolicitud.module.css';

export type RechazoSolicitudProps = {
  /** Nombre de quien pide (texto). */
  nombre: string;
  /** `ok` → el padre cierra el diálogo; con error el diálogo lo muestra en el campo. */
  onEnviar: (motivo: string | null) => Promise<ResultadoRespuestaCalendario>;
  onCerrar: () => void;
};

export function RechazoSolicitud({ nombre, onEnviar, onCerrar }: RechazoSolicitudProps) {
  const idMotivo = useId();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (enviando) return;
    const limpio = motivo.trim();
    const errorMotivo = validarMotivo(limpio);
    if (errorMotivo !== null) {
      setError(errorMotivo);
      document.getElementById(idMotivo)?.focus();
      return;
    }
    setError('');
    setEnviando(true);
    const resultado = await onEnviar(limpio === '' ? null : limpio);
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
      document.getElementById(idMotivo)?.focus();
    }
  };

  const alEnviar = (evento: FormEvent) => {
    evento.preventDefault();
    void enviar();
  };

  return (
    <Dialogo
      abierto
      titulo={`Rechazar la solicitud de ${nombre}`}
      onCerrar={onCerrar}
      textoCerrar="Cancelar"
      acciones={
        <Boton variante="peligro" cargando={enviando} textoCargando="Rechazando…" onClick={() => void enviar()}>
          Rechazar solicitud
        </Boton>
      }
    >
      <form onSubmit={alEnviar} noValidate className={estilos.formulario}>
        <Campo
          id={idMotivo}
          name="motivo"
          etiqueta="Motivo (opcional)"
          valor={motivo}
          onCambio={setMotivo}
          error={error}
          ayuda={`${MENSAJES_RESPUESTA.avisoMotivo} Hasta ${LARGO_MAX_MOTIVO} caracteres.`}
        />
      </form>
    </Dialogo>
  );
}
