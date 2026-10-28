// Página `#/panel` (WEB-06, PRF-01..05, PRF-08, AVI-01; B10: AGE-05, AGE-06): conecta los hooks y las operaciones de `logica/` con
// `VistaPanel`. El día vive en la dirección (`?d=AAAA-MM-DD`) y se acota a lo que acepta `agenda_profesor`: desde
// un año atrás hasta un año adelante (SEC-09). El acceso solo del profesor lo decide la guarda de ruta; la base
// rechaza con 403 a quien no lo es. El huso sale del profesor de la sesión, también inactivo (PRF-08).
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useSesion } from '../../../estado';
import { Cargando, ErrorCarga } from '../../../ui';
import { esDia, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import { useHusoDelProfesor } from '../../configuracion/logica';
import { leerPersonasACargo } from '../../ficha/logica';
import { useAlumnos } from '../../lista/logica';
import {
  bloquear,
  cancelarClase,
  crearClase,
  desbloquear,
  leerAgendaProfesor,
  moverClase,
  useAgendaProfesor,
  useContadores,
} from '../logica';
import type { AccionesPanel } from './contrato';
import { TEXTOS_PANEL } from './formato';
import { VistaPanel } from './VistaPanel';

const PARAMETRO_DIA = 'd';
/** Alcance de `agenda_profesor(p_dia)`: hoy ± 366 días en el huso del profesor. */
const DIAS_DE_ALCANCE = 366;

const ACCIONES: AccionesPanel = {
  crear: (entrada) => crearClase(entrada),
  mover: (claseId, destino, alcance) => moverClase(claseId, destino, alcance),
  cancelar: (claseId, alcance) => cancelarClase(claseId, alcance),
  bloquear: (entrada, zona) => bloquear(entrada, zona),
  desbloquear: (bloqueoId) => desbloquear(bloqueoId),
  leerDia: (dia) => leerAgendaProfesor(dia),
  leerPersonasACargo: (alumnoId) => leerPersonasACargo(alumnoId),
};

function PanelConHuso({ zona, profesorActivo }: { zona: string; profesorActivo: boolean }) {
  const [parametros, setParametros] = useSearchParams();
  const limites = useMemo<LimitesAgenda>(() => {
    const hoy = hoyEn(zona);
    return { hoy, min: sumarDias(hoy, -DIAS_DE_ALCANCE, zona), max: sumarDias(hoy, DIAS_DE_ALCANCE, zona) };
  }, [zona]);

  const pedido = parametros.get(PARAMETRO_DIA);
  const dia: Dia = pedido !== null && esDia(pedido) && diaEnLimites(pedido, limites) ? pedido : limites.hoy;

  const agenda = useAgendaProfesor(dia);
  const contadores = useContadores();
  const alumnos = useAlumnos();

  return (
    <VistaPanel
      dia={dia}
      zona={zona}
      limites={limites}
      agenda={agenda.lectura}
      contadores={contadores.lectura}
      alumnos={alumnos.datos}
      profesorActivo={profesorActivo}
      acciones={ACCIONES}
      onCambiarDia={(nuevo) => {
        if (diaEnLimites(nuevo, limites)) setParametros({ [PARAMETRO_DIA]: nuevo });
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
