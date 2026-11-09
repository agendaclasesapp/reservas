// «Mover» (PRF-02, PRF-04, PRF-08, WEB-06, F-08): día y horario libre de destino y, si la clase es de una serie,
// «solo esta clase» o «de acá en adelante». El cambio queda confirmado al instante. Un error no cambia nada
// (NFR-03): el aviso lo dice con su motivo. 409 SOLICITUD_EN_CURSO manda a responder primero en la lista.
// Con el profesor inactivo el botón queda deshabilitado con su explicación (PRF-08).
import { useEffect, useState } from 'react';
import { Alerta, Boton, CampoFecha, Cargando, ErrorCarga, GrupoOpciones } from '../../../ui';
import { formatearDia, type Dia } from '../../../lib/fechas';
import { mensajeDeError } from '../../../lib/errores';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import { destinosLibres, type Alcance, type FalloPanel, type FilaAgendaProfesor } from '../logica';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { resultadoDeMovimiento, textoRango, TEXTOS_PANEL } from './formato';
import { AlcanceMover, AlertaMover } from './PiezasMover';
import estilos from './Acciones.module.css';

export type MoverClaseFormProps = {
  /** La clase confirmada que se mueve. */
  fila: FilaAgendaProfesor;
  zona: string;
  /** Día que mira el panel: es el destino que se propone primero. */
  dia: Dia;
  limites: LimitesAgenda;
  /** `permisosPanel(activo).mover`: con la agenda inactiva el botón queda deshabilitado (PRF-08). */
  habilitado: boolean;
  /** `accionesFila(...).elegirAlcance`: la clase es de una serie. */
  elegirAlcance: boolean;
  acciones: Pick<AccionesPanel, 'mover' | 'leerDia'>;
  onHecho: (resultado: ResultadoPanel) => void;
  onVolver: () => void;
  onDesactualizada: () => void;
};

type Lectura = { dia: Dia; intento: number; estado: 'listo' | 'error'; filas: readonly FilaAgendaProfesor[]; error: string };

export function MoverClaseForm({
  fila,
  zona,
  dia,
  limites,
  habilitado,
  elegirAlcance,
  acciones,
  onHecho,
  onVolver,
  onDesactualizada,
}: MoverClaseFormProps) {
  const [campo, setCampo] = useState<string>(dia);
  const [diaDestino, setDiaDestino] = useState<Dia>(dia);
  const [errorDia, setErrorDia] = useState('');
  const [intento, setIntento] = useState(0);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [destino, setDestino] = useState('');
  const [alcance, setAlcance] = useState<Alcance>('solo_esta');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloPanel | null>(null);
  const leerDia = acciones.leerDia;

  useEffect(() => {
    if (!habilitado) return;
    let vigente = true;
    leerDia(diaDestino).then(
      (filas) => {
        if (vigente) setLectura({ dia: diaDestino, intento, estado: 'listo', filas, error: '' });
      },
      (e: unknown) => {
        if (vigente) setLectura({ dia: diaDestino, intento, estado: 'error', filas: [], error: mensajeDeError(e) });
      },
    );
    return () => {
      vigente = false;
    };
  }, [leerDia, diaDestino, intento, habilitado]);

  if (!habilitado) {
    return (
      <div className={estilos.formulario}>
        <Alerta tipo="aviso">{TEXTOS_PANEL.inactivoNoMueve}</Alerta>
        <div className={estilos.botones}>
          <Boton deshabilitado>Mover clase</Boton>
          <Boton variante="secundario" onClick={onVolver}>
            Volver
          </Boton>
        </div>
      </div>
    );
  }

  const vigente = lectura !== null && lectura.dia === diaDestino && lectura.intento === intento ? lectura : null;
  const libres = vigente?.estado === 'listo' ? destinosLibres(vigente.filas) : [];

  const cambiarCampo = (valor: string) => {
    setCampo(valor);
    if (valor === '') {
      setErrorDia('');
      return;
    }
    if (!diaEnLimites(valor, limites)) {
      setErrorDia(`${TEXTOS_PANEL.diaFueraDeLimites} (${formatearDia(limites.min)} a ${formatearDia(limites.max)})`);
      return;
    }
    setErrorDia('');
    if (valor !== diaDestino) {
      setDiaDestino(valor);
      setDestino('');
    }
  };

  const enviar = async () => {
    if (fila.clase_id === null) return;
    setFallo(null);
    setEnviando(true);
    const alcanceEfectivo: Alcance = elegirAlcance ? alcance : 'solo_esta';
    const r = await acciones.mover(fila.clase_id, destino, alcanceEfectivo);
    setEnviando(false);
    if (!r.ok) {
      setFallo(r);
      if (r.codigo === 'HUECO_NO_LIBRE') {
        // El destino lo tomaron mientras tanto: se vuelve a leer su día y se elige de nuevo.
        setDestino('');
        setIntento((n) => n + 1);
      }
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onDesactualizada();
      return;
    }
    onHecho(resultadoDeMovimiento(alcanceEfectivo, destino, zona, r.salteadas));
  };

  // El error de un campo va en el campo; si el campo no se muestra (no hay horarios) o el fallo es general, va en el aviso.
  const hayHorarios = vigente?.estado === 'listo' && libres.length > 0;
  const enDestino = fallo?.campo === 'p_destino' && hayHorarios;
  const enAlcance = fallo?.campo === 'p_alcance' && elegirAlcance;
  const errorDestino = enDestino ? fallo.mensaje : undefined;
  const errorAlcance = enAlcance ? fallo.mensaje : undefined;
  const errorGeneral = fallo && !enDestino && !enAlcance ? fallo : null;

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!enviando) void enviar();
      }}
    >
      <CampoFecha
        etiqueta="Día de destino"
        valor={campo}
        onCambio={cambiarCampo}
        min={limites.min}
        max={limites.max}
        error={errorDia}
      />

      {vigente === null ? (
        <Cargando etiqueta={TEXTOS_PANEL.cargandoDestinos} renglones={3} />
      ) : vigente.estado === 'error' ? (
        <ErrorCarga
          mensaje={`${TEXTOS_PANEL.errorDestinos} ${vigente.error}`.trim()}
          onReintentar={() => setIntento((n) => n + 1)}
        />
      ) : libres.length === 0 ? (
        <p role="status" className={estilos.nota}>
          {TEXTOS_PANEL.sinDestinos}
        </p>
      ) : (
        <GrupoOpciones
          legend="Horario de destino"
          requerido
          opciones={libres.map((f) => ({ valor: f.inicio, etiqueta: textoRango(f, zona) }))}
          valor={destino}
          onCambio={(v) => {
            setDestino(v);
            setFallo(null);
          }}
          error={errorDestino}
        />
      )}

      {elegirAlcance ? (
        <AlcanceMover valor={alcance} onCambio={setAlcance} error={errorAlcance} />
      ) : null}

      {errorGeneral ? <AlertaMover fallo={errorGeneral} /> : null}

      <div className={estilos.botones}>
        <Boton type="submit" cargando={enviando} textoCargando="Moviendo…">
          Mover clase
        </Boton>
        <Boton variante="secundario" onClick={onVolver}>
          Volver
        </Boton>
      </div>
    </form>
  );
}
