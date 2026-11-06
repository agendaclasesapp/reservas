// Página `#/panel` (WEB-06, PRF-01..05, PRF-08, AVI-01; B10: AGE-05, AGE-06): conecta los hooks y las operaciones de `logica/` con
// `VistaPanel`. El acceso solo del profesor lo decide la guarda de ruta; la base rechaza con 403 a quien no lo es. El
// huso sale del profesor de la sesión, también inactivo (PRF-08).
// B17 (CAL-01, CAL-02, CAL-03, CAL-07, CAL-08, CAL-19; ADR-023, ADR-024): el Panel abre en el calendario del día. La
// vista y el día viven en la dirección (`?v=dia&d=AAAA-MM-DD`; sin `v` abre Día; un valor inválido abre Día de hoy y
// se corrige reemplazando la entrada del historial) y se acotan a hoy ± 366 en el huso del profesor (SEC-09). Una
// sola lectura (`agenda_profesor_dias`) alimenta la grilla y la lista; la grilla y la duración salen de la
// configuración del profesor (ADR-024).
// B20 (CAL-10, CAL-15, CAL-16, CAL-19; ADR-023, ADR-026; H-471): la vista Semana se ofrece. `navegacionCalendario`
// (lógica) da la vista, los días visibles (siete, o la ventana de 3 días bajo 60 rem), el rango y las flechas; una sola
// lectura por semana o ventana alimenta la grilla y la lista agrupada por día. La vista y la navegación llegan a
// `VistaPanel` por props: esta página no calcula nada de la grilla. «Hoy» y la línea de la hora actual siguen al reloj
// (`useAhora`, un minuto) en el huso del profesor. Nada de la agenda se guarda en el navegador (SEC-37).
// B19 (CAL-12, CAL-20; ADR-025): conecta `confirmarSolicitud` / `rechazarSolicitud` (con la relectura del rango y de los
// contadores) y «Copiar enlace de este día» (`useEnlaceDia`, `copiarEnlaceDia`).
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useSesion } from '../../../estado';
import { Cargando, ErrorCarga } from '../../../ui';
import { diaEnLimites } from '../../agenda/logica';
import { useConfiguracionAgenda, useHusoDelProfesor } from '../../configuracion/logica';
import { leerPersonasACargo } from '../../ficha/logica';
import { useAlumnos } from '../../lista/logica';
import {
  bloquear,
  calendarioConElementos,
  cancelarClase,
  crearClase,
  desbloquear,
  DIAS_SEMANA,
  diasCalendario,
  diasSeguidos,
  direccionCalendario,
  configuracionCalendario,
  confirmarSolicitud,
  copiarEnlaceDia,
  leerAgendaProfesor,
  lineaAhora,
  limitesPanel,
  moverClase,
  navegacionCalendario,
  rechazarSolicitud,
  sinClases,
  useAgendaDias,
  useAhora,
  useContadores,
  useEnlaceDia,
  vistaDesdeDireccion,
  type AgendaDiasLeida,
  type EstadoLecturaPanel,
  type EstadoVistaCalendario,
  type FilaAgendaDias,
  type LecturaAgendaDias,
} from '../logica';
import type { EstadoCalendario } from './calendario';
import type { AccionesPanel, ResponderSolicitudAccion } from './contrato';
import { TEXTOS_PANEL } from './formato';
import { useEscritorio } from './useEscritorio';
import { VistaPanel } from './VistaPanel';

const ACCIONES: AccionesPanel = {
  crear: (entrada) => crearClase(entrada),
  mover: (claseId, destino, alcance) => moverClase(claseId, destino, alcance),
  cancelar: (claseId, alcance) => cancelarClase(claseId, alcance),
  bloquear: (entrada, zona) => bloquear(entrada, zona),
  desbloquear: (bloqueoId) => desbloquear(bloqueoId),
  leerDia: (dia) => leerAgendaProfesor(dia),
  leerPersonasACargo: (alumnoId) => leerPersonasACargo(alumnoId),
};

/**
 * Días de un rango leído, de `desde` a `hasta` (los dos incluidos). Un rango leído no pasa de una Semana: se toman los
 * días seguidos de la lógica y se cortan en `hasta` (AAAA-MM-DD ordena como texto), sin aritmética de fechas acá.
 */
function diasDelRango(leida: AgendaDiasLeida): string[] {
  return diasSeguidos(leida.desde, DIAS_SEMANA).filter((d) => d <= leida.hasta);
}

/**
 * La lectura de la agenda como la ve la lista de huecos (`useLecturaPanel`): una sola lectura para grilla y lista. En
 * Día, las filas de ese día; en Semana, todas las del rango (la lista las agrupa por día, CAL-19).
 */
function lecturaDeLista(
  lectura: LecturaAgendaDias,
  vista: EstadoVistaCalendario['vista'],
  dia: string,
): EstadoLecturaPanel<FilaAgendaDias[]> {
  const delDia = (leida: AgendaDiasLeida) => (vista === 'semana' ? leida.filas : leida.filas.filter((f) => f.dia === dia));
  if (lectura.estado === 'error') return { estado: 'error', datos: null, error: lectura.mensaje };
  if (lectura.estado === 'listo') return { estado: 'listo', datos: delDia(lectura.datos), error: null };
  return { estado: 'cargando', datos: lectura.previo ? delDia(lectura.previo) : null, error: null };
}

function PanelConHuso({ zona, profesorActivo }: { zona: string; profesorActivo: boolean }) {
  const [parametros, setParametros] = useSearchParams();
  // CAL-10: «hoy» y la línea de la hora actual siguen al reloj en el huso del profesor, sin recargar (`useAhora`).
  const ahora = useAhora();
  const limites = useMemo(() => limitesPanel(zona, ahora), [zona, ahora]);
  const direccion = vistaDesdeDireccion(parametros, limites);
  const { vista, dia, corregida } = direccion;
  // CAL-16: bajo 60 rem la Semana es una ventana de 3 días que empieza en `d`; desde 60 rem, de lunes a domingo.
  const escritorio = useEscritorio();
  const navegacion = navegacionCalendario({ vista, dia }, limites, { ventana: !escritorio });

  // CA-67: un valor inválido abre Día de hoy y se corrige en la dirección sin sumar una entrada al historial.
  useEffect(() => {
    if (corregida) setParametros(direccionCalendario({ vista: 'dia', dia }), { replace: true });
  }, [corregida, dia, setParametros]);

  const agenda = useAgendaDias(navegacion.desde, navegacion.hasta);
  const configuracion = useConfiguracionAgenda();
  const contadores = useContadores();
  const alumnos = useAlumnos();
  const enlace = useEnlaceDia(dia);
  const copiarEnlace = useMemo(
    () => ({ enlace, copiar: async (texto: string) => (await copiarEnlaceDia(texto)) === 'ok' }),
    [enlace],
  );
  const recargarAgenda = agenda.recargar;
  const recargarContadores = contadores.recargar;
  // CAL-12: la lógica relee el rango visible y los contadores tras responder (o si la solicitud quedó desactualizada).
  const responder = useMemo<ResponderSolicitudAccion>(() => {
    const opciones = {
      releer: () => {
        recargarAgenda();
        recargarContadores();
      },
    };
    return (solicitud, decision, motivo) =>
      decision === 'confirmar' ? confirmarSolicitud(solicitud, opciones) : rechazarSolicitud(solicitud, motivo, opciones);
  }, [recargarAgenda, recargarContadores]);
  const accionesConRespuesta = useMemo<AccionesPanel>(() => ({ ...ACCIONES, responder }), [responder]);

  // Se calcula en cada render: `navegacion` es nueva cada vez y el compilador de React memoiza lo que corresponde.
  const calendario = (() => {
    const lectura = agenda.lectura;
    const leida = lectura.estado === 'listo' ? lectura.datos : lectura.estado === 'cargando' ? lectura.previo : null;
    // Lo leído es de lo que se ve: una columna por día visible, también los de fuera de hoy ± 366 (vacíos, DEC-45 A).
    // Si es de otro rango (cambió la vista o el día), queda la grilla anterior con `aria-busy` hasta que llega la nueva.
    const actual = leida !== null && leida.desde === navegacion.desde && leida.hasta === navegacion.hasta;
    const dias = leida
      ? diasCalendario(actual ? navegacion.dias.map((d) => d.dia) : diasDelRango(leida), leida.filas, zona)
      : [];
    const releyendo = lectura.estado === 'cargando' ? leida !== null : leida !== null && !actual;
    // Sin la grilla no se sabe el eje: cargando. Con la configuración en error la grilla es desconocida y se dibuja
    // sin zonas (ADR-024 A-3): `configuracionCalendario` da null y `calendarioConElementos` lo resuelve.
    const sinConfig = configuracion.lectura.estado === 'cargando' && configuracion.lectura.datos === null;
    const { eje, columnas } = calendarioConElementos(
      dias,
      configuracionCalendario(configuracion.lectura),
      zona,
      profesorActivo,
    );
    let estado: EstadoCalendario;
    if (lectura.estado === 'error') estado = { estado: 'error', mensaje: lectura.mensaje };
    else if (leida === null || sinConfig) estado = { estado: 'cargando' };
    else estado = { estado: 'listo', columnas, sinClases: sinClases(dias) };
    return { estado, releyendo, eje };
  })();

  const eje = calendario.eje;
  // CAL-10: la línea de la hora actual de un día (solo hoy y dentro del eje), calculada por la lógica.
  const lineaDeAhora = (d: string) => lineaAhora(d, eje, zona, ahora);
  const navegar = (destino: EstadoVistaCalendario) => {
    if (diaEnLimites(destino.dia, limites)) setParametros(direccionCalendario(destino));
  };

  return (
    <VistaPanel
      dia={dia}
      zona={zona}
      limites={limites}
      agenda={lecturaDeLista(agenda.lectura, vista, dia)}
      calendario={calendario.estado}
      calendarioReleyendo={calendario.releyendo}
      eje={calendario.eje}
      navegacion={navegacion}
      ventana={!escritorio}
      contadores={contadores.lectura}
      alumnos={alumnos.datos}
      profesorActivo={profesorActivo}
      acciones={accionesConRespuesta}
      copiarEnlace={copiarEnlace}
      onCambiarDia={(nuevo) => navegar({ vista: 'dia', dia: nuevo })}
      onNavegar={navegar}
      lineaAhora={lineaDeAhora}
      onRecargarAgenda={agenda.recargar}
      onRecargarContadores={contadores.recargar}
      onRecargarAlumnos={alumnos.recargar}
    />
  );
}

export function PaginaPanel() {
  const sesion = useSesion();
  const profesorActivo = sesion.tipo === 'sesion' ? (sesion.sesion.profesor?.activo ?? true) : true;
  const huso = useHusoDelProfesor();
  return (
    <>
      <h1>{TEXTOS_PANEL.titulo}</h1>
      {huso.estado === 'listo' ? (
        <PanelConHuso zona={huso.zona} profesorActivo={profesorActivo} />
      ) : huso.estado === 'error' ? (
        <ErrorCarga mensaje={`${TEXTOS_PANEL.errorAgenda} ${huso.mensaje}`.trim()} onReintentar={huso.recargar} />
      ) : (
        <Cargando etiqueta="Cargando tu agenda…" renglones={6} />
      )}
    </>
  );
}
