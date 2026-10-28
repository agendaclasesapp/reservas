// «Desbloquear» (AGE-06, CA-14, WEB-06, F-09 paso 3): se ofrece en un hueco bloqueado. Quita el bloqueo entero y sus
// huecos vuelven a estar libres; como un bloqueo puede cubrir más que el hueco tocado, se avisa antes. 404: el
// bloqueo ya no existe o no es suyo (CA-52); la agenda se vuelve a leer. El motivo es texto (SEC-16).
import { useState } from 'react';
import { Alerta, Boton } from '../../../ui';
import { MENSAJES_BLOQUEO, type FalloBloqueo, type FilaAgendaProfesor } from '../logica';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { textoRango, TEXTOS_BLOQUEO } from './formato';
import estilos from './Acciones.module.css';

export type DesbloquearFormProps = {
  /** La fila bloqueada tocada (`bloqueo_id` no nulo). */
  fila: Pick<FilaAgendaProfesor, 'inicio' | 'fin' | 'bloqueo_id' | 'bloqueo_motivo'>;
  zona: string;
  acciones: Pick<AccionesPanel, 'desbloquear'>;
  onHecho: (resultado: ResultadoPanel) => void;
  onDesactualizada: () => void;
};

export function DesbloquearForm({ fila, zona, acciones, onHecho, onDesactualizada }: DesbloquearFormProps) {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloBloqueo | null>(null);

  const confirmar = async () => {
    if (fila.bloqueo_id === null) return;
    setFallo(null);
    setEnviando(true);
    const r = await acciones.desbloquear(fila.bloqueo_id);
    setEnviando(false);
    if (!r.ok) {
      setFallo(r);
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onDesactualizada();
      return;
    }
    onHecho({ mensaje: MENSAJES_BLOQUEO.desbloqueado, salteadas: [] });
  };

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!enviando) void confirmar();
      }}
    >
      <dl className={estilos.datos}>
        <div>
          <dt>{TEXTOS_BLOQUEO.horarioDe}</dt>
          <dd>{textoRango(fila, zona)}</dd>
        </div>
        {fila.bloqueo_motivo ? (
          <div>
            <dt>{TEXTOS_BLOQUEO.motivoDe}</dt>
            <dd>{fila.bloqueo_motivo}</dd>
          </div>
        ) : null}
      </dl>
      <p className={estilos.pregunta}>{TEXTOS_BLOQUEO.avisoDesbloquear}</p>

      {fallo ? (
        <Alerta tipo="error" titulo={TEXTOS_BLOQUEO.tituloErrorDesbloquear}>
          {fallo.mensaje}
        </Alerta>
      ) : null}

      <div className={estilos.botones}>
        <Boton type="submit" cargando={enviando} textoCargando={TEXTOS_BLOQUEO.desbloqueando}>
          {TEXTOS_BLOQUEO.desbloquear}
        </Boton>
      </div>
    </form>
  );
}
