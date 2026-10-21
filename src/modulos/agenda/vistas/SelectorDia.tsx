// C-20 SelectorDia (WEB-01): día anterior, día siguiente y calendario (campo fecha nativo).
// Los extremos salen de `limitesAgenda` (SEC-09): fuera de ellos la base respondería 422.
import { useId, useState } from 'react';
import { Boton, CampoFecha } from '../../../ui';
import { formatearDia, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../logica';
import estilos from './SelectorDia.module.css';

export type SelectorDiaProps = {
  /** Día mostrado, AAAA-MM-DD en el huso del profesor. */
  dia: Dia;
  /** Huso IANA del profesor (AGE-08); se usa para sumar días de calendario. */
  zona: string;
  limites: LimitesAgenda;
  onCambio: (dia: Dia) => void;
};

/** Lo que la persona escribió en el campo y no es un día válido; solo vale mientras `dia` no cambie. */
interface Entrada {
  paraDia: Dia;
  valor: string;
  error: string;
}

export function SelectorDia({ dia, zona, limites, onCambio }: SelectorDiaProps) {
  const idTitulo = useId();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const vigente = entrada !== null && entrada.paraDia === dia ? entrada : null;

  const anterior = sumarDias(dia, -1, zona);
  const siguiente = sumarDias(dia, 1, zona);

  const cambiarCampo = (valor: string) => {
    if (valor === '') {
      // Edición a medias o campo vaciado: no se pide ningún día todavía.
      setEntrada({ paraDia: dia, valor, error: '' });
      return;
    }
    if (!diaEnLimites(valor, limites)) {
      setEntrada({
        paraDia: dia,
        valor,
        error: `Ese día no está disponible. Elegí uno entre el ${formatearDia(limites.min)} y el ${formatearDia(limites.max)}.`,
      });
      return;
    }
    setEntrada(null);
    if (valor !== dia) onCambio(valor);
  };

  return (
    <section aria-labelledby={idTitulo} className={estilos.selector}>
      <h2 id={idTitulo} className={estilos.dia} aria-live="polite" aria-atomic="true">
        {formatearDia(dia)}
      </h2>
      <div className={estilos.controles}>
        <div className={estilos.botones}>
          <Boton variante="secundario" deshabilitado={!diaEnLimites(anterior, limites)} onClick={() => onCambio(anterior)}>
            Día anterior
          </Boton>
          <Boton variante="secundario" deshabilitado={!diaEnLimites(siguiente, limites)} onClick={() => onCambio(siguiente)}>
            Día siguiente
          </Boton>
        </div>
        <div className={estilos.calendario}>
          <CampoFecha
            etiqueta="Elegir día"
            valor={vigente ? vigente.valor : dia}
            onCambio={cambiarCampo}
            min={limites.min}
            max={limites.max}
            error={vigente?.error}
          />
        </div>
      </div>
    </section>
  );
}
