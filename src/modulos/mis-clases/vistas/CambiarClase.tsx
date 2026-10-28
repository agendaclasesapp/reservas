// Mover una clase o avisar que no voy (SOL-02, SOL-03, SOL-10, AGE-11, RES-07, CA-13, CA-22, CA-23, CA-24, SEC-17;
// flujos.md F-06 pasos 2 y 3): un diálogo por acción sobre una clase confirmada futura. En una serie pide el alcance
// («Solo esta clase» por defecto). Mover elige un hueco libre en la agenda del profesor DE ESA CLASE, por día, en su
// huso. Los errores de la base (límite de 10, profesor inactivo, anticipación, fuera de grilla, hueco ocupado) se
// muestran ya traducidos, enfocados y anunciados (role=alert), y el diálogo sigue abierto para corregir.
// No lee ni escribe datos: recibe `cambio` (useCambioDeClase) y `onHecho`; el éxito lo comunica la tarjeta.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alerta, Boton, Cargando, Dialogo, ErrorCarga, GrupoOpciones, Vacio } from '../../../ui';
import { diaDeInstante, formatearFecha, formatearHora, type Dia } from '../../../lib/fechas';
import {
  diaEnLimites,
  limitesAgenda,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublicaActiva,
  type Hueco,
  type ObtenerAgenda,
  type ObtenerConfig,
} from '../../agenda/logica';
import { ListaHuecos, resumenHuecos } from '../../agenda/vistas/ListaHuecos';
import { SelectorDia } from '../../agenda/vistas/SelectorDia';
import {
  agendaDelProfesorDeClase,
  alcancesDeClase,
  horarioDeClase,
  MENSAJES_CAMBIOS,
  type Alcance,
  type CambioDeClase,
  type ClaseMia,
  type FalloCambio,
} from '../logica';
import estilos from './CambiarClase.module.css';

export type ModoCambio = 'mover' | 'avisar';

/** Lo que la tarjeta cuenta tras enviar: qué se pidió y qué fechas se saltearon (RES-05). */
export type CambioHecho = { claseId: string; modo: ModoCambio; salteadas: readonly string[]; zona: string };

export const MENSAJES_CAMBIAR = {
  tituloMover: 'Mover la clase',
  tituloAvisar: 'Avisar que no voy',
  pedirCambio: 'Pedir el cambio',
  enviarAviso: 'Enviar aviso',
  volver: 'Volver',
  enviando: 'Enviando…',
  tituloError: 'No se pudo enviar el pedido',
  alcance: '¿A qué clases se aplica?',
  sinAgenda: 'No se puede mostrar la agenda de este profesor.',
  sinElegir: 'Todavía no elegiste el horario nuevo. Tocá un horario libre de la agenda.',
  sinHuecos: 'No hay huecos este día',
  sinHuecosTexto: 'Elegí otro día para ver sus horarios.',
} as const;

export type CambiarClaseProps = {
  clase: ClaseMia;
  modo: ModoCambio;
  cambio: CambioDeClase;
  /** «Volver» o Esc: el foco regresa al botón que abrió el diálogo. */
  onCerrar: () => void;
  /** El pedido se envió: quien monta cierra el diálogo y recarga las clases. */
  onHecho: (hecho: CambioHecho) => void;
  /** Solo para pruebas. */
  obtenerConfig?: ObtenerConfig;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

/** «martes, 3 de noviembre, 10:00 a 11:00», en el huso del profesor de la clase (ADR-004). */
function textoHorario(inicio: string, fin: string, zona: string): string {
  return `${formatearFecha(inicio, zona)}, ${formatearHora(inicio, zona)} a ${formatearHora(fin, zona)}`;
}

type ElegirHuecoProps = {
  slug: string;
  config: ConfigPublicaActiva;
  clase: ClaseMia;
  dia: Dia | null;
  onCambiarDia: (dia: Dia) => void;
  destino: Hueco | null;
  onElegir: (hueco: Hueco) => void;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

/** Agenda reducida por día del profesor de la clase: solo los huecos libres se pueden elegir (RES-07, CA-22). */
function ElegirHueco({ slug, config, clase, dia, onCambiarDia, destino, onElegir, obtenerAgenda, ahora }: ElegirHuecoProps) {
  const zona = config.zona_horaria;
  const limites = useMemo(() => limitesAgenda(config, ahora), [config, ahora]);
  const delaClase = diaDeInstante(clase.inicio, zona);
  const diaActual: Dia = dia ?? (diaEnLimites(delaClase, limites) ? delaClase : limites.hoy);
  const agenda = useAgendaDia(slug, diaActual, obtenerAgenda);
  const resumen = agenda.estado === 'listo' && agenda.huecos.length > 0 ? resumenHuecos(agenda.huecos) : '';

  return (
    <div className={estilos.agenda}>
      <SelectorDia dia={diaActual} zona={zona} limites={limites} onCambio={onCambiarDia} />
      <p className={estilos.nota}>Horarios en el huso {zona}.</p>
      <p role="status" className={estilos.soloLectores}>
        {resumen}
      </p>
      {agenda.estado === 'cargando' ? <Cargando etiqueta="Cargando los huecos del día…" renglones={4} /> : null}
      {agenda.estado === 'error' ? (
        <ErrorCarga mensaje={`No se pudo cargar la agenda. ${agenda.error?.mensaje ?? ''}`.trim()} onReintentar={agenda.recargar} />
      ) : null}
      {agenda.estado === 'listo' && agenda.huecos.length === 0 ? (
        <Vacio nivel={3} titulo={MENSAJES_CAMBIAR.sinHuecos} texto={MENSAJES_CAMBIAR.sinHuecosTexto} />
      ) : null}
      {agenda.estado === 'listo' && agenda.huecos.length > 0 ? (
        <ListaHuecos huecos={agenda.huecos} dia={diaActual} zona={zona} onElegir={onElegir} />
      ) : null}
      <p role="status" className={estilos.elegido}>
        {destino ? `Horario elegido: ${textoHorario(destino.inicio, destino.fin, zona)}.` : ''}
      </p>
      {destino === null ? <p className={estilos.nota}>{MENSAJES_CAMBIAR.sinElegir}</p> : null}
    </div>
  );
}

export function CambiarClase({ clase, modo, cambio, onCerrar, onHecho, obtenerConfig, obtenerAgenda, ahora }: CambiarClaseProps) {
  const alcances = alcancesDeClase(clase);
  const horario = horarioDeClase(clase);
  const agendaProfesor = modo === 'mover' ? agendaDelProfesorDeClase(clase) : null;
  const configuracion = useConfigPublica(agendaProfesor?.slug ?? null, obtenerConfig);
  const config = configuracion.estado === 'listo' ? configuracion.config : null;

  const [alcance, setAlcance] = useState<Alcance>('solo_esta');
  const [destino, setDestino] = useState<Hueco | null>(null);
  const [dia, setDia] = useState<Dia | null>(null);
  const [fallo, setFallo] = useState<FalloCambio | null>(null);
  const [versionAgenda, setVersionAgenda] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  // El error se enfoca (y su role=alert lo anuncia) para quien usa teclado o lector de pantalla.
  useEffect(() => {
    if (fallo) errorRef.current?.focus();
  }, [fallo]);

  const profesorInactivo = config !== null && !config.activo;
  const horaActual = textoHorario(clase.inicio, clase.fin, horario.zona);

  const enviar = async () => {
    setFallo(null);
    const r =
      modo === 'mover'
        ? await cambio.mover(clase, destino?.inicio ?? null, alcance)
        : await cambio.cancelar(clase, alcance).then((c) => (c.ok ? { ...c, salteadas: [] as string[] } : c));
    if (r.ok) {
      onHecho({ claseId: clase.id, modo, salteadas: r.salteadas, zona: horario.zona });
      return;
    }
    setFallo(r);
    if (r.campo === 'destino') {
      // El hueco ya no sirve (ocupado u fuera de la grilla): se elige otro, con el día vuelto a leer.
      setDestino(null);
      setVersionAgenda((v) => v + 1);
    }
  };

  const opcionesAlcance = alcances.map((a) => ({ valor: a, etiqueta: MENSAJES_CAMBIOS.alcance[a] }));
  const elegirAlcance = (valor: string) => {
    const elegido = alcances.find((a) => a === valor);
    if (elegido) setAlcance(elegido);
  };

  const cuerpoMover =
    agendaProfesor === null ? (
      <Alerta tipo="aviso">{MENSAJES_CAMBIAR.sinAgenda}</Alerta>
    ) : profesorInactivo ? (
      <Alerta tipo="aviso" titulo="No toma reservas por ahora">
        {MENSAJES_CAMBIOS.profesorInactivo}
      </Alerta>
    ) : config !== null && config.activo ? (
      <ElegirHueco
        key={versionAgenda}
        slug={agendaProfesor.slug}
        config={config}
        clase={clase}
        dia={dia}
        onCambiarDia={setDia}
        destino={destino}
        onElegir={setDestino}
        obtenerAgenda={obtenerAgenda}
        ahora={ahora}
      />
    ) : configuracion.estado === 'error' ? (
      <ErrorCarga
        mensaje={`No se pudo cargar la agenda. ${configuracion.error?.mensaje ?? ''}`.trim()}
        onReintentar={configuracion.recargar}
      />
    ) : (
      <Cargando etiqueta="Cargando la agenda…" renglones={4} />
    );

  const deshabilitado = modo === 'mover' && (agendaProfesor === null || profesorInactivo);

  return (
    <Dialogo
      abierto
      titulo={modo === 'mover' ? MENSAJES_CAMBIAR.tituloMover : MENSAJES_CAMBIAR.tituloAvisar}
      onCerrar={onCerrar}
      textoCerrar={MENSAJES_CAMBIAR.volver}
      acciones={
        <Boton
          variante={modo === 'mover' ? 'primario' : 'peligro'}
          cargando={cambio.enviando}
          textoCargando={MENSAJES_CAMBIAR.enviando}
          deshabilitado={deshabilitado}
          onClick={() => void enviar()}
        >
          {modo === 'mover' ? MENSAJES_CAMBIAR.pedirCambio : MENSAJES_CAMBIAR.enviarAviso}
        </Boton>
      }
    >
      <div className={estilos.cuerpo}>
        {fallo ? (
          <div ref={errorRef} tabIndex={-1} className={estilos.error}>
            <Alerta tipo="error" titulo={MENSAJES_CAMBIAR.tituloError}>
              {fallo.mensaje}
            </Alerta>
          </div>
        ) : null}
        <p className={estilos.clase}>
          {modo === 'mover' ? 'Clase actual' : 'Clase'}: {horaActual}, con {clase.profesor_nombre ?? 'tu profesor'}.
        </p>
        {modo === 'avisar' ? (
          <p>Vas a avisar que no podés ir. La clase sigue confirmada hasta que el profesor responda.</p>
        ) : (
          <p>La clase sigue en su horario actual hasta que el profesor responda.</p>
        )}
        {alcances.length > 1 ? (
          <GrupoOpciones legend={MENSAJES_CAMBIAR.alcance} opciones={opcionesAlcance} valor={alcance} onCambio={elegirAlcance} />
        ) : null}
        {modo === 'mover' ? cuerpoMover : null}
      </div>
    </Dialogo>
  );
}
