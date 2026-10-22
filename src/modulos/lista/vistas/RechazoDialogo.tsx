// Rechazo de una cuenta con motivo opcional (WEB-07, ALU-03, AVI-03; componentes-profesor.md C-62).
// Avisa que la persona va a ver el motivo. El texto se envía tal cual: se muestra siempre como texto (SEC-16).
import { useId, useState, type FormEvent } from 'react';
import { Boton, Campo, Dialogo } from '../../../ui';
import { esquemaMotivo, LARGO_MAX_MOTIVO, MENSAJES_LISTA } from '../logica';
import type { ResultadoGuardado } from './formato';

export type RechazoDialogoProps = {
  /** Nombre de la cuenta que se rechaza (texto). */
  nombre: string;
  /** `rechazar_cuenta`: con `ok` el padre cierra el diálogo; con error el diálogo lo muestra. */
  onEnviar: (motivo: string) => Promise<ResultadoGuardado>;
  onCerrar: () => void;
};

export function RechazoDialogo({ nombre, onEnviar, onCerrar }: RechazoDialogoProps) {
  const idMotivo = useId();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (enviando) return;
    const limpio = motivo.trim();
    if (!esquemaMotivo.safeParse(limpio).success) {
      setError(MENSAJES_LISTA.motivoLargo);
      document.getElementById(idMotivo)?.focus();
      return;
    }
    setError('');
    setEnviando(true);
    const resultado = await onEnviar(limpio);
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
      titulo={`Rechazar la cuenta de ${nombre}`}
      onCerrar={onCerrar}
      textoCerrar="Cancelar"
      acciones={
        <Boton variante="peligro" cargando={enviando} textoCargando="Rechazando…" onClick={() => void enviar()}>
          Rechazar cuenta
        </Boton>
      }
    >
      <form onSubmit={alEnviar} noValidate>
        <Campo
          id={idMotivo}
          name="motivo"
          etiqueta="Motivo (opcional)"
          valor={motivo}
          onCambio={setMotivo}
          error={error}
          ayuda={`${MENSAJES_LISTA.avisoMotivoVisible} Hasta ${LARGO_MAX_MOTIVO} caracteres.`}
        />
      </form>
    </Dialogo>
  );
}
