// Página `#/p/<slug>` (WEB-01, AGE-07, AGE-09, AGE-11, ALU-14): agenda pública por día de un profesor, para
// todos, con su nombre. Compone los hooks de logica/ con la presentación de AgendaDia, el estado del vínculo
// de quien mira con ESE profesor y «Pedir acceso», que la ruta compone (agenda no importa de ficha). El día
// vive en la dirección (`?d=AAAA-MM-DD`) y se acota con `diaEnLimites` (SEC-09).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  puedePedirAcceso,
  relacionConProfesor,
  RUTA_INGRESO,
  useSesion,
  type RelacionConProfesor,
} from '../../../estado';
import { useLocation, useSearchParams } from 'react-router';
import { Alerta, Cargando, ErrorCarga, Vacio } from '../../../ui';
import { esDia, type Dia } from '../../../lib/fechas';
import {
  diaEnLimites,
  limitesAgenda,
  MENSAJE_ENLACE_NO_VALIDO,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublicaActiva,
  type Hueco,
  type ObtenerAgenda,
  type ObtenerConfig,
} from '../logica';
import { accionDeHueco } from './accionHueco';
import { AgendaDia } from './AgendaDia';
import { AvisoRelacion } from './AvisoRelacion';
import { InvitacionIngreso } from './InvitacionIngreso';
import estilos from './PaginaAgenda.module.css';

const PARAMETRO_DIA = 'd';

/**
 * Lo que la agenda le da al formulario de solicitud que compone la ruta (WEB-04): el profesor del vínculo
 * aprobado, su huso, el hueco libre tocado y cómo avisar.
 */
export type ContextoSolicitud = {
  profesorId: string;
  /** Nombre público del profesor (texto, SEC-16). */
  profesorNombre: string;
  /** Huso IANA del profesor (AGE-08). */
  zona: string;
  hueco: Hueco;
  /** Cierra el formulario; el foco vuelve al hueco o, si ya no está, al título de la página. */
  onCerrar: () => void;
  /** El hueco cambió (pedido enviado o ya no estaba libre): la agenda vuelve a leer el día. */
  onCambioAgenda: () => void;
};

/** El formulario de solicitud (`solicitud` lo compone la ruta; agenda no importa de otro módulo). */
export type RenderSolicitud = (contexto: ContextoSolicitud) => ReactNode;

/** Monta lo que la ruta compone con el contexto del hueco tocado. */
function Compuesto({ componer, contexto }: { componer: RenderSolicitud; contexto: ContextoSolicitud }) {
  return componer(contexto);
}

type Abierto = { tipo: 'invitacion' } | { tipo: 'formulario'; hueco: Hueco };

type AgendaConConfigProps = {
  slug: string;
  config: ConfigPublicaActiva;
  relacion: RelacionConProfesor;
  solicitud?: RenderSolicitud;
  hayPedirAcceso: boolean;
  enfocarAviso: () => void;
  enfocarTitulo: () => void;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

function AgendaConConfig({
  slug,
  config,
  relacion,
  solicitud,
  hayPedirAcceso,
  enfocarAviso,
  enfocarTitulo,
  obtenerAgenda,
  ahora,
}: AgendaConConfigProps) {
  const [parametros, setParametros] = useSearchParams();
  const { pathname, search } = useLocation();
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const cambioPendiente = useRef(false);
  const limites = useMemo(() => limitesAgenda(config, ahora), [config, ahora]);

  const pedido = parametros.get(PARAMETRO_DIA);
  const dia: Dia = pedido !== null && esDia(pedido) && diaEnLimites(pedido, limites) ? pedido : limites.hoy;

  const agenda = useAgendaDia(slug, dia, obtenerAgenda);

  const cambiarDia = (nuevo: Dia) => {
    if (!diaEnLimites(nuevo, limites)) return;
    setParametros({ [PARAMETRO_DIA]: nuevo });
  };

  const accion = accionDeHueco(relacion, { hayFormulario: solicitud !== undefined, hayPedirAcceso });
  const elegirHueco = (hueco: Hueco) => {
    if (accion === 'invitar_ingreso') setAbierto({ tipo: 'invitacion' });
    else if (accion === 'formulario') setAbierto({ tipo: 'formulario', hueco });
    else if (accion === 'ver_aviso') enfocarAviso();
  };

  const { recargar } = agenda;
  const cerrar = () => setAbierto(null);
  const avisarCambio = useCallback(() => {
    cambioPendiente.current = true;
    recargar();
  }, [recargar]);

  // El hueco pedido ya no es libre (ni un botón): al cerrar el formulario el foco pasa al título de la página.
  useEffect(() => {
    if (abierto === null && cambioPendiente.current) {
      cambioPendiente.current = false;
      enfocarTitulo();
    }
  }, [abierto, enfocarTitulo]);

  // CA-46: el visitante vuelve a esta misma agenda (y a este día) al terminar de ingresar (WEB-02).
  const hrefIngreso = `#${RUTA_INGRESO}?${new URLSearchParams({ volver: pathname + search }).toString()}`;

  return (
    <>
      <AgendaDia
        dia={dia}
        zona={config.zona_horaria}
        limites={limites}
        onCambiarDia={cambiarDia}
        onElegirHueco={accion === 'ninguna' ? undefined : elegirHueco}
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
      {abierto?.tipo === 'invitacion' ? (
        <InvitacionIngreso nombre={config.nombre} hrefIngreso={hrefIngreso} onCerrar={cerrar} />
      ) : null}
      {abierto?.tipo === 'formulario' && solicitud ? (
        <Compuesto
          componer={solicitud}
          contexto={{
            profesorId: config.profesor_id,
            profesorNombre: config.nombre,
            zona: config.zona_horaria,
            hueco: abierto.hueco,
            onCerrar: cerrar,
            onCambioAgenda: avisarCambio,
          }}
        />
      ) : null}
    </>
  );
}

export type PaginaAgendaProps = {
  slug: string;
  /** «Pedir acceso» (ALU-14) que la ruta compone: `agenda` no importa de `ficha` (componentes.md §5). */
  pedirAcceso?: (slug: string) => ReactNode;
  /**
   * Formulario de solicitud (WEB-04) que la ruta compone: lo abre tocar un hueco libre con el vínculo aprobado
   * con este profesor. Sin él, el alumno aprobado no puede tocar los huecos; el visitante igual ve la invitación
   * a ingresar (CA-46), que es de esta vista.
   */
  solicitud?: RenderSolicitud;
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

export function PaginaAgenda({ slug, pedirAcceso, solicitud, obtenerConfig, obtenerAgenda, ahora }: PaginaAgendaProps) {
  const configuracion = useConfigPublica(slug, obtenerConfig);
  const relacion = relacionConProfesor(useSesion(), slug);
  const config = configuracion.estado === 'listo' ? configuracion.config : null;

  // Tras «Pedir acceso» el formulario desaparece y aparece el estado pendiente: el foco pasa a ese aviso.
  const avisoRef = useRef<HTMLDivElement>(null);
  const pedirAccesoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const tipoPrevio = useRef(relacion.tipo);
  useEffect(() => {
    if (tipoPrevio.current === 'sin_vinculo' && relacion.tipo === 'vinculo') avisoRef.current?.focus();
    tipoPrevio.current = relacion.tipo;
  }, [relacion.tipo]);

  // WEB-01: tocar un hueco libre sin poder pedirlo lleva al aviso de estado (o a «Pedir acceso») que ya está arriba.
  const enfocarAviso = useCallback(() => {
    (relacion.tipo === 'sin_vinculo' ? pedirAccesoRef : avisoRef).current?.focus();
  }, [relacion.tipo]);
  const enfocarTitulo = useCallback(() => tituloRef.current?.focus(), []);
  const mostrarPedirAcceso = pedirAcceso !== undefined && puedePedirAcceso(relacion, true);

  return (
    <>
      <h1 ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
        {config ? `Agenda de ${config.nombre}` : 'Agenda'}
      </h1>
      {config && !config.activo ? (
        <ProfesorInactivo
          nombre={config.nombre}
          conClasesConfirmadas={relacion.tipo === 'vinculo' && relacion.inscripcion.estado === 'aprobado'}
        />
      ) : config ? (
        <>
          <AvisoRelacion relacion={relacion} nombre={config.nombre} avisoRef={avisoRef} />
          {mostrarPedirAcceso ? (
            <div ref={pedirAccesoRef} tabIndex={-1} className={estilos.aviso}>
              {pedirAcceso(slug)}
            </div>
          ) : null}
          <AgendaConConfig
            slug={slug}
            config={config}
            relacion={relacion}
            solicitud={solicitud}
            hayPedirAcceso={mostrarPedirAcceso}
            enfocarAviso={enfocarAviso}
            enfocarTitulo={enfocarTitulo}
            obtenerAgenda={obtenerAgenda}
            ahora={ahora}
          />
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
