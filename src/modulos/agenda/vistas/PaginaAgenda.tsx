// Página `#/p/<slug>` (WEB-01, AGE-07, AGE-09, AGE-11, ALU-14): agenda pública por día de un profesor, para
// todos, con su nombre. Compone los hooks de logica/ con la presentación de AgendaDia, el estado del vínculo
// de quien mira con ESE profesor y «Pedir acceso», que la ruta compone (agenda no importa de ficha). El día
// vive en la dirección (`?d=AAAA-MM-DD`) y se acota con `diaEnLimites` (SEC-09).
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { puedePedirAcceso, relacionConProfesor, useSesion } from '../../../estado';
import { useSearchParams } from 'react-router';
import { Alerta, Cargando, ErrorCarga, Vacio } from '../../../ui';
import { esDia, type Dia } from '../../../lib/fechas';
import {
  diaEnLimites,
  limitesAgenda,
  MENSAJE_ENLACE_NO_VALIDO,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublicaActiva,
  type ObtenerAgenda,
  type ObtenerConfig,
} from '../logica';
import { AgendaDia } from './AgendaDia';
import { AvisoRelacion } from './AvisoRelacion';
import estilos from './PaginaAgenda.module.css';

const PARAMETRO_DIA = 'd';

type AgendaConConfigProps = {
  slug: string;
  config: ConfigPublicaActiva;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

function AgendaConConfig({ slug, config, obtenerAgenda, ahora }: AgendaConConfigProps) {
  const [parametros, setParametros] = useSearchParams();
  const limites = useMemo(() => limitesAgenda(config, ahora), [config, ahora]);

  const pedido = parametros.get(PARAMETRO_DIA);
  const dia: Dia = pedido !== null && esDia(pedido) && diaEnLimites(pedido, limites) ? pedido : limites.hoy;

  const agenda = useAgendaDia(slug, dia, obtenerAgenda);

  const cambiarDia = (nuevo: Dia) => {
    if (!diaEnLimites(nuevo, limites)) return;
    setParametros({ [PARAMETRO_DIA]: nuevo });
  };

  return (
    <AgendaDia
      dia={dia}
      zona={config.zona_horaria}
      limites={limites}
      onCambiarDia={cambiarDia}
      vista={
        agenda.estado === 'listo'
          ? { estado: 'listo', huecos: agenda.huecos }
          : agenda.estado === 'error'
            ? {
                estado: 'error',
                mensaje: `No se pudo cargar la agenda. ${agenda.error?.mensaje ?? ''}`.trim(),
                onReintentar: agenda.recargar,
              }
            : { estado: 'cargando' }
      }
    />
  );
}

export type PaginaAgendaProps = {
  slug: string;
  /** «Pedir acceso» (ALU-14) que la ruta compone: `agenda` no importa de `ficha` (componentes.md §5). */
  pedirAcceso?: (slug: string) => ReactNode;
  /** Solo para pruebas. */
  obtenerConfig?: ObtenerConfig;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

type InactivoProps = { nombre: string; conClasesConfirmadas: boolean };

/** AGE-11: el enlace de un profesor inactivo dice que no toma reservas y no muestra su agenda. */
function ProfesorInactivo({ nombre, conClasesConfirmadas }: InactivoProps) {
  return (
    <Alerta
      tipo="aviso"
      titulo={`${nombre} no toma reservas por ahora`}
      accion={
        conClasesConfirmadas ? (
          <a href="#/mis-clases" className={estilos.enlace}>
            Ir a Mis clases
          </a>
        ) : undefined
      }
    >
      {conClasesConfirmadas
        ? 'Su agenda no está disponible. Tus clases ya confirmadas siguen en Mis clases.'
        : 'Su agenda no está disponible. Cuando vuelva a tomar reservas, este mismo enlace va a mostrarla.'}
    </Alerta>
  );
}

export function PaginaAgenda({ slug, pedirAcceso, obtenerConfig, obtenerAgenda, ahora }: PaginaAgendaProps) {
  const configuracion = useConfigPublica(slug, obtenerConfig);
  const relacion = relacionConProfesor(useSesion(), slug);
  const config = configuracion.estado === 'listo' ? configuracion.config : null;

  // Tras «Pedir acceso» el formulario desaparece y aparece el estado pendiente: el foco pasa a ese aviso.
  const avisoRef = useRef<HTMLDivElement>(null);
  const tipoPrevio = useRef(relacion.tipo);
  useEffect(() => {
    if (tipoPrevio.current === 'sin_vinculo' && relacion.tipo === 'vinculo') avisoRef.current?.focus();
    tipoPrevio.current = relacion.tipo;
  }, [relacion.tipo]);

  return (
    <>
      <h1>{config ? `Agenda de ${config.nombre}` : 'Agenda'}</h1>
      {config && !config.activo ? (
        <ProfesorInactivo
          nombre={config.nombre}
          conClasesConfirmadas={relacion.tipo === 'vinculo' && relacion.inscripcion.estado === 'aprobado'}
        />
      ) : config ? (
        <>
          <AvisoRelacion relacion={relacion} nombre={config.nombre} avisoRef={avisoRef} />
          {pedirAcceso && puedePedirAcceso(relacion, true) ? pedirAcceso(slug) : null}
          <AgendaConConfig slug={slug} config={config} obtenerAgenda={obtenerAgenda} ahora={ahora} />
        </>
      ) : configuracion.enlaceNoValido ? (
        <Vacio titulo={MENSAJE_ENLACE_NO_VALIDO} />
      ) : configuracion.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudo cargar la agenda. ${configuracion.error?.mensaje ?? ''}`.trim()}
          onReintentar={configuracion.recargar}
        />
      ) : (
        <Cargando etiqueta="Cargando la agenda…" renglones={6} />
      )}
    </>
  );
}
