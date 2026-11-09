// CC-01 · Barra del calendario (CAL-01, CAL-03; WEB-14, F-CAL-02, F-CAL-03): reemplaza al selector de día. Día/Semana
// (`aria-pressed`) cuando la vista se puede cambiar, anterior, «Hoy», siguiente y el título en un `h2` con
// `aria-live="polite"`: el cambio de día se anuncia sin mover el foco (A11Y-47). Una flecha que saldría del rango de
// la agenda queda deshabilitada y lo dice en su nombre accesible (A11Y-49).
// B18 (H-B17-03, CAL-03): «Elegir día» repone el campo de fecha que tenía el selector de día de B09: salta a una fecha
// de hoy ± 366 y navega como las flechas (cambia `d` en la dirección); fuera de ese rango muestra el error y no navega.
import { useState, type Ref } from 'react';
import { Boton, CampoFecha, Icono } from '../../../ui';
import { formatearDia, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import type { VistaCalendario } from '../logica';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './BarraCalendario.module.css';

/** Campo «Elegir día» (H-B17-03): el día mostrado, los extremos de la agenda y el aviso de la elección. */
export type ElegirDiaCalendario = {
  dia: Dia;
  limites: LimitesAgenda;
  onElegir: (dia: Dia) => void;
};

/** Lo que la persona escribió en el campo y no es un día válido; solo vale mientras `dia` no cambie. */
type EntradaFecha = { paraDia: Dia; valor: string; error: string };

export type BarraCalendarioProps = {
  vista: VistaCalendario;
  /** «30/10/2026» o «26/10/2026 - 01/11/2026». */
  titulo: string;
  puedeAnterior: boolean;
  puedeSiguiente: boolean;
  /** Si no se da, no hay botones Día/Semana (la vista Semana todavía no se ofrece). */
  onVista?: (vista: VistaCalendario) => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  onHoy: () => void;
  /** Si se da, la barra suma el campo de fecha «Elegir día» (H-B17-03). */
  elegirDia?: ElegirDiaCalendario;
  /** B20 (CAL-16): la Semana se ve como ventana de 3 días; las flechas corren de a 3. */
  ventana?: boolean;
  /** B20 (F-CAL-03): el título, para moverle el foco al abrir la vista Día desde un encabezado. */
  tituloRef?: Ref<HTMLHeadingElement>;
};

const NOMBRES_FLECHAS: Record<VistaCalendario | 'ventana', { anterior: string; siguiente: string }> = {
  dia: { anterior: TEXTOS_CALENDARIO.diaAnterior, siguiente: TEXTOS_CALENDARIO.diaSiguiente },
  semana: { anterior: TEXTOS_CALENDARIO.semanaAnterior, siguiente: TEXTOS_CALENDARIO.semanaSiguiente },
  ventana: { anterior: TEXTOS_CALENDARIO.tresDiasAnteriores, siguiente: TEXTOS_CALENDARIO.tresDiasSiguientes },
};

function Flecha({
  texto,
  habilitada,
  icono,
  onClick,
}: {
  texto: string;
  habilitada: boolean;
  icono: 'flechaIzquierda' | 'flechaDerecha';
  onClick: () => void;
}) {
  return (
    <Boton
      variante="secundario"
      deshabilitado={!habilitada}
      aria-label={habilitada ? undefined : `${texto}${TEXTOS_CALENDARIO.noDisponible}`}
      onClick={onClick}
    >
      {icono === 'flechaIzquierda' ? <Icono nombre={icono} /> : null}
      {texto}
      {icono === 'flechaDerecha' ? <Icono nombre={icono} /> : null}
    </Boton>
  );
}

function CampoElegirDia({ dia, limites, onElegir }: ElegirDiaCalendario) {
  const [entrada, setEntrada] = useState<EntradaFecha | null>(null);
  const vigente = entrada !== null && entrada.paraDia === dia ? entrada : null;
  const cambiar = (valor: string) => {
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
    if (valor !== dia) onElegir(valor);
  };
  return (
    <div className={estilos.fecha}>
      <CampoFecha
        etiqueta={TEXTOS_CALENDARIO.elegirDia}
        valor={vigente ? vigente.valor : dia}
        onCambio={cambiar}
        min={limites.min}
        max={limites.max}
        error={vigente?.error}
      />
    </div>
  );
}

export function BarraCalendario({
  vista,
  titulo,
  puedeAnterior,
  puedeSiguiente,
  onVista,
  onAnterior,
  onSiguiente,
  onHoy,
  elegirDia,
  ventana = false,
  tituloRef,
}: BarraCalendarioProps) {
  const nombres = NOMBRES_FLECHAS[vista === 'semana' && ventana ? 'ventana' : vista];
  return (
    <div className={estilos.barra}>
      <nav aria-label={TEXTOS_CALENDARIO.navegacion} className={estilos.navegacion}>
        {onVista ? (
          <div role="group" aria-label="Vista del calendario" className={estilos.vistas}>
            {(['dia', 'semana'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vista === v}
                className={estilos.vista}
                onClick={() => onVista(v)}
              >
                {v === 'dia' ? TEXTOS_CALENDARIO.dia : TEXTOS_CALENDARIO.semana}
              </button>
            ))}
          </div>
        ) : null}
        <div className={estilos.flechas}>
          <Flecha texto={nombres.anterior} habilitada={puedeAnterior} icono="flechaIzquierda" onClick={onAnterior} />
          <Boton variante="secundario" onClick={onHoy}>
            {TEXTOS_CALENDARIO.hoy}
          </Boton>
          <Flecha texto={nombres.siguiente} habilitada={puedeSiguiente} icono="flechaDerecha" onClick={onSiguiente} />
        </div>
        {elegirDia ? <CampoElegirDia {...elegirDia} /> : null}
      </nav>
      <h2 ref={tituloRef} tabIndex={-1} className={estilos.titulo} aria-live="polite" aria-atomic="true">
        {titulo}
      </h2>
    </div>
  );
}
