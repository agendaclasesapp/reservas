// Página `#/panel` (WEB-06, PRF-01..05, PRF-08, AVI-01; B10: AGE-05, AGE-06): conecta los hooks y las operaciones de `logica/` con
// `VistaPanel`. El acceso solo del profesor lo decide la guarda de ruta; la base rechaza con 403 a quien no lo es. El
// huso sale del profesor de la sesión, también inactivo (PRF-08).
// B17 (CAL-01, CAL-02, CAL-03, CAL-07, CAL-08, CAL-19; ADR-023, ADR-024): el Panel abre en el calendario del día. La
// vista y el día viven en la dirección (`?v=dia&d=AAAA-MM-DD`; sin `v` abre Día; un valor inválido abre Día de hoy y
// se corrige reemplazando la entrada del historial) y se acotan a hoy ± 366 en el huso del profesor (SEC-09). Una
// sola lectura (`agenda_profesor_dias`) alimenta la grilla y la lista; la grilla y la duración salen de la
// configuración del profesor (ADR-024). La vista Semana todavía no se ofrece: `v=semana` abre Día de ese día.
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
  diasCalendario,
  direccionCalendario,
  configuracionCalendario,
  confirmarSolicitud,
  copiarEnlaceDia,
  leerAgendaProfesor,
  limitesPanel,
  moverClase,
  navegacionCalendario,
  rechazarSolicitud,
  sinClases,
  useAgendaDias,
  useContadores,
  useEnlaceDia,
  vistaDesdeDireccion,
  type AgendaDiasLeida,
  type EstadoLecturaPanel,
  type FilaAgendaDias,
  type LecturaAgendaDias,
} from '../logica';
import type { EstadoCalendario } from './calendario';
import type { AccionesPanel, ResponderSolicitudAccion } from './contrato';
import { TEXTOS_PANEL } from './formato';
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

/** La lectura de la agenda como la ve la lista de huecos (`useLecturaPanel`): una sola lectura para grilla y lista. */
function lecturaDeLista(lectura: LecturaAgendaDias, dia: string): EstadoLecturaPanel<FilaAgendaDias[]> {
  const delDia = (leida: AgendaDiasLeida) => leida.filas.filter((f) => f.dia === dia);
  if (lectura.estado === 'error') return { estado: 'error', datos: null, error: lectura.mensaje };
  if (lectura.estado === 'listo') return { estado: 'listo', datos: delDia(lectura.datos), error: null };
  return { estado: 'cargando', datos: lectura.previo ? delDia(lectura.previo) : null, error: null };
}

function PanelConHuso({ zona, profesorActivo }: { zona: string; profesorActivo: boolean }) {
  const [parametros, setParametros] = useSearchParams();
  const limites = useMemo(() => limitesPanel(zona), [zona]);
  const direccion = vistaDesdeDireccion(parametros, limites);
  const { dia, corregida } = direccion;
  const navegacion = navegacionCalendario({ vista: 'dia', dia }, limites);

  // CA-67: un valor inválido abre Día de hoy y se corrige en la dirección sin sumar una entrada al historial.
  useEffect(() => {
    if (corregida) setParametros(direccionCalendario({ vista: 'dia', dia }), { replace: true });
  }, [corregida, dia, setParametros]);

  const agenda = useAgendaDias(dia, dia);
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

  const calendario = useMemo(() => {
    const lectura = agenda.lectura;
    const aDias = (leida: AgendaDiasLeida) => diasCalendario([leida.desde], leida.filas, zona);
    const leida = lectura.estado === 'listo' ? lectura.datos : lectura.estado === 'cargando' ? lectura.previo : null;
    const dias = leida ? aDias(leida) : [];
    const releyendo = lectura.estado === 'cargando' ? leida !== null : leida !== null && leida.desde !== dia;
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
  }, [agenda.lectura, configuracion.lectura, dia, profesorActivo, zona]);

  return (
    <VistaPanel
      dia={dia}
      zona={zona}
      limites={limites}
      agenda={lecturaDeLista(agenda.lectura, dia)}
      calendario={calendario.estado}
      calendarioReleyendo={calendario.releyendo}
      eje={calendario.eje}
      navegacion={navegacion}
      contadores={contadores.lectura}
      alumnos={alumnos.datos}
      profesorActivo={profesorActivo}
      acciones={accionesConRespuesta}
      copiarEnlace={copiarEnlace}
      onCambiarDia={(nuevo) => {
        if (diaEnLimites(nuevo, limites)) setParametros(direccionCalendario({ vista: 'dia', dia: nuevo }));
      }}
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
