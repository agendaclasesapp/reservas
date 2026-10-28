// Rechazo con motivo opcional (WEB-07, ALU-03, AVI-03, SOL-04, SEC-09; componentes-profesor.md C-62): de una
// cuenta (por defecto) o de una solicitud de reserva (`titulo`, `textoAccion` y `aviso`). Avisa que la persona va
// a ver el motivo. El texto se envía tal cual: se muestra siempre como texto (SEC-16).
import { useId, useState, type FormEvent } from 'react';
import { Boton, Campo, Dialogo } from '../../../ui';
import { esquemaMotivo, LARGO_MAX_MOTIVO, MENSAJES_LISTA } from '../logica';
import type { ResultadoGuardado } from './formato';

export type RechazoDialogoProps = {
  /** Nombre de la cuenta que se rechaza (texto). */
  nombre: string;
  /** Título del diálogo; por defecto «Rechazar la cuenta de <nombre>». */
  titulo?: string;
  /** Texto del botón que rechaza; por defecto «Rechazar cuenta». */
  textoAccion?: string;
  /** Aviso bajo la etiqueta; por defecto el de la cuenta («... en su ficha y en Mis clases ...»). */
  aviso?: string;
  /** `rechazar_cuenta`: con `ok` el padre cierra el diálogo; con error el diálogo lo muestra. */
  onEnviar: (motivo: string) => Promise<ResultadoGuardado>;
  onCerrar: () => void;
};

export function RechazoDialogo({ nombre, titulo, textoAccion = 'Rechazar cuenta', aviso, onEnviar, onCerrar }: RechazoDialogoProps) {
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
      titulo={titulo ?? `Rechazar la cuenta de ${nombre}`}
      onCerrar={onCerrar}
      textoCerrar="Cancelar"
      acciones={
        <Boton variante="peligro" cargando={enviando} textoCargando="Rechazando…" onClick={() => void enviar()}>
          {textoAccion}
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
          ayuda={`${aviso ?? MENSAJES_LISTA.avisoMotivoVisible} Hasta ${LARGO_MAX_MOTIVO} caracteres.`}
        />
      </form>
    </Dialogo>
  );
}
