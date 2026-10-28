// Pedir la clase de un hueco libre (WEB-01, WEB-04, SOL-01, SOL-10, RES-03, RES-05, AGE-11): diálogo con el
// formulario de solicitud conectado a los hooks de `logica/`. La ruta lo compone dentro de la agenda del profesor
// (agenda no importa de otro módulo, componentes.md §5) y lo descarga diferido: default export.
// Las personas a cargo salen de la API pública de `ficha/logica` (ALU-06).
import { useState } from 'react';
import { useSesion } from '../../../estado';
import { Dialogo } from '../../../ui';
import { usePersonasACargo } from '../../ficha/logica';
import {
  usePrevisualizacionSerie,
  useSolicitarReserva,
  type EstadoPrevisualizacion,
} from '../logica';
import type { VistaFechas } from './FechasSalteadas';
import { SolicitudEnviada } from './SolicitudEnviada';
import { frecuenciaDeTipo, SolicitudForm, type DatosFormulario, type TipoClase, type VistaPersonas } from './SolicitudForm';

export type SolicitudDeHuecoProps = {
  /** Profesor de la agenda: es el del vínculo aprobado (`inscripcion.profesor_id`). */
  profesorId: string;
  /** Texto, SEC-16. */
  profesorNombre: string;
  /** Huso IANA del profesor (AGE-08). */
  zona: string;
  /** El hueco libre tocado, tal como lo devolvió `agenda_publica`. */
  hueco: { inicio: string; fin: string };
  onCerrar: () => void;
  /** El hueco cambió de estado (pedido enviado o ya no estaba libre): la agenda tiene que releerse. */
  onCambioAgenda?: () => void;
};

function vistaDeFechas(estado: EstadoPrevisualizacion): VistaFechas {
  switch (estado.tipo) {
    case 'inactiva':
      return { estado: 'inactiva' };
    case 'cargando':
      return { estado: 'cargando' };
    case 'ok':
      return { estado: 'listo', fechas: estado.fechas };
    case 'error':
      return { estado: 'error', mensaje: estado.fallo.mensaje };
  }
}

export default function SolicitudDeHueco({
  profesorId,
  profesorNombre,
  zona,
  hueco,
  onCerrar,
  onCambioAgenda,
}: SolicitudDeHuecoProps) {
  const sesion = useSesion();
  const alumnoId = sesion.tipo === 'sesion' ? sesion.sesion.alumno_id : null;
  const personas = usePersonasACargo(alumnoId);
  const [tipo, setTipo] = useState<TipoClase>('suelta');
  const previa = usePrevisualizacionSerie(profesorId, hueco.inicio, frecuenciaDeTipo(tipo));
  const { estado, enviar } = useSolicitarReserva();

  const vistaPersonas: VistaPersonas =
    personas.estado.tipo === 'ok'
      ? { estado: 'listo', personas: personas.estado.personas.map((p) => ({ id: p.id, nombre: p.nombre })) }
      : personas.estado.tipo === 'error'
        ? { estado: 'error', mensaje: personas.estado.mensaje, onReintentar: personas.recargar }
        : { estado: 'cargando' };

  const alEnviar = (datos: DatosFormulario) => {
    void enviar({ profesorId, inicio: hueco.inicio, ...datos }).then((resultado) => {
      if (resultado !== null && (resultado.ok || resultado.codigo === 'HUECO_NO_LIBRE')) onCambioAgenda?.();
    });
  };

  const enviada = estado.tipo === 'hecho' && estado.resultado.ok ? estado.resultado : null;
  const fallo = estado.tipo === 'hecho' && !estado.resultado.ok ? estado.resultado : null;

  return (
    <Dialogo abierto titulo={enviada ? 'Pedido enviado' : `Pedir clase a ${profesorNombre}`} onCerrar={onCerrar}>
      {enviada ? (
        <SolicitudEnviada
          profesorNombre={profesorNombre}
          zona={zona}
          hueco={hueco}
          tipo={tipo}
          fechas={enviada.fechas}
          salteadas={enviada.salteadas}
        />
      ) : (
        <SolicitudForm
          profesorNombre={profesorNombre}
          zona={zona}
          hueco={hueco}
          personas={vistaPersonas}
          tipo={tipo}
          onCambioTipo={setTipo}
          fechas={vistaDeFechas(previa)}
          enviando={estado.tipo === 'enviando'}
          error={fallo}
          onEnviar={alEnviar}
          onVolver={onCerrar}
        />
      )}
    </Dialogo>
  );
}
