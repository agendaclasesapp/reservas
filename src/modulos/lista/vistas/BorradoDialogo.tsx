// Borrar un alumno de la lista (B11, ALU-12, CA-10, DEC-05 A, DEC-26 A; flujos-profesor.md F-13 punto 3).
// Diálogo destructivo: enumera el efecto (clases futuras canceladas y horarios libres, qué pasa con la persona
// según tenga cuenta o no, sin mail) y exige confirmar con el botón «Borrar alumno» (no «Aceptar»). El nombre se
// muestra siempre como texto (SEC-16).
import { useState } from 'react';
import { Alerta, Boton, Dialogo } from '../../../ui';
import { textoConfirmacionBorrado, type AlumnoLista } from '../logica';
import estilos from './BorradoDialogo.module.css';

export type ResultadoBorradoDialogo = { ok: true } | { ok: false; mensaje: string };

export type BorradoDialogoProps = {
  /** Nombre visible del alumno (texto). */
  nombre: string;
  /** Define qué pasa con la persona: con cuenta, sin cuenta solo tuyo o sin cuenta compartido. */
  alumno: Pick<AlumnoLista, 'con_usuario' | 'editable'>;
  /** `borrar_alumno`: con `ok` el padre cierra el diálogo y anuncia el resumen; con error el diálogo lo muestra. */
  onConfirmar: () => Promise<ResultadoBorradoDialogo>;
  onCerrar: () => void;
};

export function BorradoDialogo({ nombre, alumno, onConfirmar, onCerrar }: BorradoDialogoProps) {
  const [error, setError] = useState('');
  const [borrando, setBorrando] = useState(false);

  const confirmar = async () => {
    if (borrando) return;
    setError('');
    setBorrando(true);
    const resultado = await onConfirmar();
    setBorrando(false);
    if (!resultado.ok) setError(resultado.mensaje);
  };

  return (
    <Dialogo
      abierto
      titulo={`Borrar a ${nombre}`}
      onCerrar={onCerrar}
      textoCerrar="Cancelar"
      acciones={
        <Boton variante="peligro" cargando={borrando} textoCargando="Borrando…" onClick={() => void confirmar()}>
          Borrar alumno
        </Boton>
      }
    >
      <p className={estilos.intro}>Esto no se puede deshacer. Qué pasa si lo borrás:</p>
      <ul className={estilos.efectos}>
        {textoConfirmacionBorrado(alumno).map((texto) => (
          <li key={texto}>{texto}</li>
        ))}
      </ul>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
    </Dialogo>
  );
}
