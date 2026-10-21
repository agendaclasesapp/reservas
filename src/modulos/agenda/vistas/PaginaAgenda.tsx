// Página `#/` (WEB-01, AGE-07): agenda pública por día, para todos. Compone los hooks de logica/ con la
// presentación de AgendaDia. El día vive en la dirección (`?d=AAAA-MM-DD`) y se acota con `diaEnLimites` (SEC-09).
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Cargando, ErrorCarga } from '../../../ui';
import { esDia, type Dia } from '../../../lib/fechas';
import {
  diaEnLimites,
  limitesAgenda,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublica,
  type ObtenerAgenda,
  type ObtenerConfig,
} from '../logica';
import { AgendaDia } from './AgendaDia';

const PARAMETRO_DIA = 'd';

type AgendaConConfigProps = {
  config: ConfigPublica;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

function AgendaConConfig({ config, obtenerAgenda, ahora }: AgendaConConfigProps) {
  const [parametros, setParametros] = useSearchParams();
  const limites = useMemo(() => limitesAgenda(config, ahora), [config, ahora]);

  const pedido = parametros.get(PARAMETRO_DIA);
  const dia: Dia = pedido !== null && esDia(pedido) && diaEnLimites(pedido, limites) ? pedido : limites.hoy;

  const agenda = useAgendaDia(dia, obtenerAgenda);

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
  /** Solo para pruebas. */
  obtenerConfig?: ObtenerConfig;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

export function PaginaAgenda({ obtenerConfig, obtenerAgenda, ahora }: PaginaAgendaProps) {
  const configuracion = useConfigPublica(obtenerConfig);
  return (
    <>
      <h1>Agenda</h1>
      {configuracion.estado === 'listo' && configuracion.config ? (
        <AgendaConConfig config={configuracion.config} obtenerAgenda={obtenerAgenda} ahora={ahora} />
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
