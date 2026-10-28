// «Bloquear» (AGE-05, CA-14, WEB-06, F-09, C-56): un hueco, un rango de horas de un día o días completos, con un
// motivo opcional de hasta 500 caracteres que el calendario público no muestra. Si el período cubre una clase
// confirmada o un pedido sin responder, la base rechaza (409) y el formulario lista cuáles, cada una con su enlace.
// El huso es el del profesor (AGE-08). Presentación: arma el período con las funciones de `panel/logica` y llama a
// `acciones.bloquear`, que devuelve un resultado y no lanza. Los nombres y el motivo son texto (SEC-16).
import { useEffect, useRef, useState } from 'react';
import { Alerta, Boton, Campo, CampoFecha, GrupoOpciones } from '../../../ui';
import { formatearFecha, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import {
  bloqueoDeDias,
  bloqueoDeHoras,
  bloqueoDeHuecos,
  MENSAJES_BLOQUEO,
  type CampoBloqueo,
  type EntradaBloqueo,
  type FalloBloqueo,
  type FilaAgendaProfesor,
} from '../logica';
import { ConflictosBloqueo } from './ConflictosBloqueo';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { textoRango, TEXTOS_BLOQUEO } from './formato';
import estilos from './Acciones.module.css';

/** Qué se bloquea: el horario de un hueco tocado, o un período que elige la persona (rango de horas o días). */
export type OrigenBloqueo =
  | { tipo: 'hueco'; fila: Pick<FilaAgendaProfesor, 'inicio' | 'fin'> }
  | { tipo: 'periodo'; dia: Dia };

export type BloqueoFormProps = {
  origen: OrigenBloqueo;
  zona: string;
  /** Extremos de `agenda_profesor` (SEC-09): los días del selector van entre ellos. */
  limites: LimitesAgenda;
  acciones: Pick<AccionesPanel, 'bloquear'>;
  onHecho: (resultado: ResultadoPanel) => void;
  /** La agenda quedó desactualizada: hay que volver a leerla. */
  onDesactualizada: () => void;
  /** Si está, se ofrece «Volver». */
  onVolver?: () => void;
  /** Se sigue el enlace de una clase en conflicto: quien muestra el formulario lo cierra. */
  onIrAConflicto?: () => void;
};

type Alcance = 'rango' | 'dia';

type CampoForm = 'dia' | 'desde' | 'hasta' | 'ultimoDia' | 'motivo';

const OPCIONES_ALCANCE = [
  { valor: 'rango', etiqueta: TEXTOS_BLOQUEO.alcanceRango },
  { valor: 'dia', etiqueta: TEXTOS_BLOQUEO.alcanceDias },
] as const;

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function esAlcance(valor: string): valor is Alcance {
  return valor === 'rango' || valor === 'dia';
}

/** Campo del formulario que marca un fallo de la base o de la validación previa (`campo` del 422). */
function campoDelFallo(fallo: FalloBloqueo, alcance: Alcance | null): CampoForm | null {
  const campo: CampoBloqueo | null = fallo.campo;
  if (campo === 'p_motivo') return 'motivo';
  if (campo === 'p_desde') return alcance === null ? null : 'dia';
  if (campo === 'p_hasta') return alcance === 'rango' ? 'hasta' : alcance === 'dia' ? 'ultimoDia' : null;
  return null;
}

export function BloqueoForm({
  origen,
  zona,
  limites,
  acciones,
  onHecho,
  onDesactualizada,
  onVolver,
  onIrAConflicto,
}: BloqueoFormProps) {
  const esPeriodo = origen.tipo === 'periodo';
  const diaInicial: Dia = origen.tipo === 'periodo' ? origen.dia : '';
  const [alcance, setAlcance] = useState<Alcance>('rango');
  const [dia, setDia] = useState<Dia>(diaInicial);
  const [ultimoDia, setUltimoDia] = useState<Dia>(diaInicial);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Partial<Record<CampoForm, string>>>({});
  const [fallo, setFallo] = useState<FalloBloqueo | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const formulario = useRef<HTMLFormElement>(null);

  // Al fallar, el foco va al primer campo con error o, si el error es general o de conflictos, al aviso.
  useEffect(() => {
    if (pedidoFoco === 0) return;
    const campo = formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (campo ?? errorRef.current)?.focus();
  }, [pedidoFoco]);

  const fallar = (nuevos: Partial<Record<CampoForm, string>>, general: FalloBloqueo | null) => {
    setErrores(nuevos);
    setFallo(general);
    setPedidoFoco((n) => n + 1);
  };

  /** Valida lo que la persona escribió y arma el período; null si hay errores (ya marcados). */
  const armar = (): EntradaBloqueo | null => {
    if (origen.tipo === 'hueco') return bloqueoDeHuecos(origen.fila, origen.fila, motivo);
    const nuevos: Partial<Record<CampoForm, string>> = {};
    const fuera = (d: Dia) => d === '' || !diaEnLimites(d, limites);
    if (fuera(dia)) nuevos.dia = TEXTOS_BLOQUEO.diaInvalido;
    if (alcance === 'rango') {
      if (!HORA.test(desde.trim())) nuevos.desde = TEXTOS_BLOQUEO.horaInicioInvalida;
      if (!/^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/.test(hasta.trim())) nuevos.hasta = TEXTOS_BLOQUEO.horaFinInvalida;
    } else {
      if (fuera(ultimoDia)) nuevos.ultimoDia = TEXTOS_BLOQUEO.diaInvalido;
      else if (nuevos.dia === undefined && ultimoDia < dia) nuevos.ultimoDia = TEXTOS_BLOQUEO.ultimoAntesDelPrimero;
    }
    if (Object.keys(nuevos).length > 0) {
      fallar(nuevos, null);
      return null;
    }
    return alcance === 'rango'
      ? bloqueoDeHoras(dia, desde.trim(), hasta.trim(), zona, motivo)
      : bloqueoDeDias(dia, ultimoDia, zona, motivo);
  };

  const enviar = async () => {
    setErrores({});
    setFallo(null);
    const entrada = armar();
    if (entrada === null) return;
    setEnviando(true);
    const r = await acciones.bloquear(entrada, zona);
    setEnviando(false);
    if (!r.ok) {
      const campo = campoDelFallo(r, esPeriodo ? alcance : null);
      if (campo !== null) fallar({ [campo]: r.mensaje }, null);
      else fallar({}, r);
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onDesactualizada();
      return;
    }
    onHecho({ mensaje: MENSAJES_BLOQUEO.bloqueado, salteadas: [] });
  };

  return (
    <form
      ref={formulario}
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!enviando) void enviar();
      }}
    >
      {origen.tipo === 'hueco' ? (
        <p className={estilos.pregunta}>
          {`¿Bloqueamos el horario de ${textoRango(origen.fila, zona)} del ${formatearFecha(origen.fila.inicio, zona)}? ${TEXTOS_BLOQUEO.ayudaBloquearHueco}`}
        </p>
      ) : (
        <>
          <GrupoOpciones
            legend={TEXTOS_BLOQUEO.alcance}
            opciones={OPCIONES_ALCANCE}
            valor={alcance}
            onCambio={(v) => {
              if (esAlcance(v)) {
                setAlcance(v);
                setErrores({});
                setFallo(null);
              }
            }}
          />
          {alcance === 'rango' ? (
            <>
              <CampoFecha
                etiqueta={TEXTOS_BLOQUEO.dia}
                valor={dia}
                onCambio={setDia}
                min={limites.min}
                max={limites.max}
                error={errores.dia}
                requerido
              />
              <Campo
                etiqueta={TEXTOS_BLOQUEO.desde}
                ayuda={TEXTOS_BLOQUEO.ayudaHora}
                valor={desde}
                onCambio={setDesde}
                inputMode="numeric"
                autoComplete="off"
                error={errores.desde}
                requerido
              />
              <Campo
                etiqueta={TEXTOS_BLOQUEO.hasta}
                valor={hasta}
                onCambio={setHasta}
                inputMode="numeric"
                autoComplete="off"
                error={errores.hasta}
                requerido
              />
            </>
          ) : (
            <>
              <CampoFecha
                etiqueta={TEXTOS_BLOQUEO.primerDia}
                valor={dia}
                onCambio={(v) => {
                  setDia(v);
                  if (ultimoDia === '' || ultimoDia < v) setUltimoDia(v);
                }}
                min={limites.min}
                max={limites.max}
                error={errores.dia}
                requerido
              />
              <CampoFecha
                etiqueta={TEXTOS_BLOQUEO.ultimoDia}
                valor={ultimoDia}
                onCambio={setUltimoDia}
                min={limites.min}
                max={limites.max}
                error={errores.ultimoDia}
                requerido
              />
            </>
          )}
        </>
      )}

      <Campo
        etiqueta={TEXTOS_BLOQUEO.motivo}
        ayuda={TEXTOS_BLOQUEO.ayudaMotivo}
        valor={motivo}
        onCambio={setMotivo}
        error={errores.motivo}
      />

      {fallo ? (
        <div ref={errorRef} tabIndex={-1} className={estilos.errorEnfocable}>
          <Alerta tipo="error" titulo={TEXTOS_BLOQUEO.tituloErrorBloquear}>
            <p className={estilos.pregunta}>{fallo.mensaje}</p>
            <ConflictosBloqueo conflictos={fallo.conflictos} zona={zona} onIr={onIrAConflicto} />
          </Alerta>
        </div>
      ) : null}

      <div className={estilos.botones}>
        <Boton type="submit" cargando={enviando} textoCargando={TEXTOS_BLOQUEO.bloqueando}>
          {TEXTOS_BLOQUEO.bloquear}
        </Boton>
        {onVolver ? (
          <Boton variante="secundario" onClick={onVolver}>
            {TEXTOS_BLOQUEO.volver}
          </Boton>
        ) : null}
      </div>
    </form>
  );
}
