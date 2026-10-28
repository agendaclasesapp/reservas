// Página `#/ficha` (WEB-03, ALU-02, ALU-03, ALU-06, ALU-13, ALU-14, CA-02, CA-43, CA-45): compone `useSesion()` y
// las funciones de `logica/` con las vistas. Un titular con la ficha incompleta ve solo el formulario, que
// pregunta «cómo llegaste» únicamente si entró por el enlace de un profesor activo; con la ficha completa ve sus
// datos, el estado con cada profesor (con el motivo del que rechazó, si lo escribió) y las personas a cargo.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { refrescarSesion, useSesion, type EstadoSesion, type SesionActual } from '../../../estado';
import { hoyEn } from '../../../lib/fechas';
import { Alerta, Cargando, ErrorCarga, SinPermisos } from '../../../ui';
import {
  completarFicha,
  guardarPersonaACargo,
  useProfesorDeOrigen,
  usePersonasACargo,
  vinculosDeFicha,
  type FichaEntrada,
} from '../logica';
import { DatosTitular } from './DatosTitular';
import { FichaForm } from './FichaForm';
import { PersonasACargo } from './PersonasACargo';
import { VinculosFicha } from './VinculosFicha';
import { useMiFicha } from './useMiFicha';
import estilos from './PaginaFicha.module.css';

type AlumnoConFicha = SesionActual & { rol: 'alumno'; estado: 'completa'; alumno_id: string };

/** El huso del navegador sirve para acotar la fecha de nacimiento; el servidor valida de nuevo. */
function hoyLocal() {
  return hoyEn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Lo que la persona acaba de guardar: el profesor al que se le pidió acceso con la ficha, si lo hubo. */
type Guardada = { profesorNombre: string | null };

type FichaCompletaProps = { sesion: AlumnoConFicha; recienGuardada: Guardada | null };

function FichaCompleta({ sesion, recienGuardada }: FichaCompletaProps) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [hoy] = useState(hoyLocal);
  const ficha = useMiFicha(sesion.alumno_id);
  const personas = usePersonasACargo(sesion.alumno_id);
  const vinculos = vinculosDeFicha(sesion);

  // Al completar la ficha el formulario desaparece: el foco pasa al título para no perderse.
  useEffect(() => {
    if (recienGuardada !== null) titulo.current?.focus();
  }, [recienGuardada]);

  return (
    <div className={estilos.pagina}>
      <h1 ref={titulo} tabIndex={-1}>
        Ficha
      </h1>
      {recienGuardada !== null ? (
        <Alerta tipo="exito" titulo="Ficha guardada">
          {recienGuardada.profesorNombre !== null
            ? `Le pediste acceso a ${recienGuardada.profesorNombre}: queda pendiente de aprobación.`
            : 'Para pedir clases, entrá desde el enlace de tu profesor y pedile acceso.'}
        </Alerta>
      ) : null}
      <VinculosFicha vinculos={vinculos} />
      {ficha.estado.tipo === 'cargando' ? <Cargando etiqueta="Cargando tus datos…" renglones={3} /> : null}
      {ficha.estado.tipo === 'error' ? (
        <ErrorCarga mensaje={`No se pudieron cargar tus datos. ${ficha.estado.mensaje}`} onReintentar={ficha.recargar} />
      ) : null}
      {ficha.estado.tipo === 'ok' ? <DatosTitular ficha={ficha.estado.ficha} /> : null}
      <PersonasACargo
        estado={personas.estado}
        hoy={hoy}
        onGuardar={guardarPersonaACargo}
        onGuardada={personas.recargar}
        onReintentar={personas.recargar}
      />
    </div>
  );
}

type FichaIncompletaProps = { sesion: SesionActual; alGuardar: (guardada: Guardada) => void };

function FichaIncompleta({ sesion, alGuardar }: FichaIncompletaProps) {
  const [hoy] = useState(hoyLocal);
  const origen = useProfesorDeOrigen();
  const guardar = async (datos: FichaEntrada) => {
    const nombreOrigen = origen.estado === 'listo' ? origen.nombre : null;
    const resultado = await completarFicha(datos, origen.estado === 'listo' ? origen.slug : null);
    if (resultado.ok) alGuardar({ profesorNombre: resultado.inscripcion ? nombreOrigen : null });
    return resultado;
  };
  return (
    <div className={estilos.pagina}>
      <h1>Ficha</h1>
      {origen.estado === 'cargando' ? <Cargando etiqueta="Cargando tu ficha…" renglones={4} /> : null}
      {origen.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudo cargar el profesor del enlace. ${origen.error.mensaje}`.trim()}
          onReintentar={origen.recargar}
        />
      ) : null}
      {origen.estado === 'sin_origen' || origen.estado === 'listo' ? (
        <>
          <FichaForm
            precargado={{ nombre: sesion.nombre, mail: sesion.mail }}
            hoy={hoy}
            profesorOrigen={origen.estado === 'listo' ? { nombre: origen.nombre } : null}
            onGuardar={guardar}
          />
          <p className={estilos.nota}>Vas a poder cargar personas a cargo cuando termines tu ficha.</p>
        </>
      ) : null}
    </div>
  );
}

function conTitulo(contenido: ReactNode) {
  return (
    <div className={estilos.pagina}>
      <h1>Ficha</h1>
      {contenido}
    </div>
  );
}

export type VistaFichaProps = {
  estado: EstadoSesion;
  onReintentarSesion: () => void;
};

/** Qué ve el titular según el estado de la sesión (sin acceder al almacén: se prueba con estados fijos). */
export function VistaFicha({ estado, onReintentarSesion }: VistaFichaProps) {
  const [recienGuardada, setRecienGuardada] = useState<Guardada | null>(null);

  if (estado.tipo === 'cargando') return conTitulo(<Cargando etiqueta="Cargando tu ficha…" renglones={4} />);
  if (estado.tipo === 'error') {
    return conTitulo(<ErrorCarga mensaje={estado.mensaje} onReintentar={onReintentarSesion} />);
  }
  if (estado.tipo === 'visitante') {
    return (
      <SinPermisos
        motivo="Para ver tu ficha tenés que ingresar."
        destino={{ texto: 'Ingresar', href: '#/ingreso' }}
      />
    );
  }

  const s = estado.sesion;
  if (s.rol !== 'alumno') {
    return (
      <SinPermisos
        motivo="La ficha es para las cuentas de alumnos."
        destino={{ texto: 'Ir al panel', href: '#/panel' }}
      />
    );
  }
  if (s.estado === 'ficha_incompleta') {
    return <FichaIncompleta sesion={s} alGuardar={setRecienGuardada} />;
  }
  if (s.estado === 'completa' && s.alumno_id !== null) {
    return (
      <FichaCompleta
        sesion={{ ...s, rol: 'alumno', estado: 'completa', alumno_id: s.alumno_id }}
        recienGuardada={recienGuardada}
      />
    );
  }
  return (
    <SinPermisos
      motivo="Tu cuenta no tiene una ficha para mostrar. Consultale al profesor."
      destino={{ texto: 'Ir a la agenda', href: '#/' }}
    />
  );
}

export function PaginaFicha() {
  const estado = useSesion();
  return <VistaFicha estado={estado} onReintentarSesion={() => void refrescarSesion()} />;
}
