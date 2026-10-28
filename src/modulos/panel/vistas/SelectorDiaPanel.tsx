// Selector de día del panel (WEB-06, F-07): el mismo que el de la agenda pública (día anterior, día siguiente y
// calendario), con los extremos de `agenda_profesor` (SEC-09). `panel` no importa las vistas de `agenda`
// (componentes.md §5), así que repite la presentación; la lógica de límites sale de `agenda/logica`.
import { useId, useState } from 'react';
import { Boton, CampoFecha } from '../../../ui';
import { formatearDia, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import estilos from './SelectorDiaPanel.module.css';

export type SelectorDiaPanelProps = {
  /** Día mostrado, AAAA-MM-DD en el huso del profesor. */
  dia: Dia;
  /** Huso IANA del profesor, para sumar días de calendario. */
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

export function SelectorDiaPanel({ dia, zona, limites, onCambio }: SelectorDiaPanelProps) {
  const idTitulo = useId();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const vigente = entrada !== null && entrada.paraDia === dia ? entrada : null;

  const anterior = sumarDias(dia, -1, zona);
  const siguiente = sumarDias(dia, 1, zona);

  const cambiarCampo = (valor: string) => {
    if (valor === '') {
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
