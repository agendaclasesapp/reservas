// Página `#/ficha` (WEB-03, ALU-02, ALU-03, ALU-06, ALU-13, CA-02, CA-43, CA-45): compone `useSesion()` y las
// funciones de `logica/` con las vistas. Un titular con la ficha incompleta ve solo el formulario; con la ficha
// completa ve sus datos, el estado de aprobación (con el motivo si fue rechazada) y las personas a cargo.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { refrescarSesion, useSesion, type EstadoSesion, type SesionActual } from '../../../estado';
import { hoyEn } from '../../../lib/fechas';
import { Alerta, Cargando, ErrorCarga, SinPermisos } from '../../../ui';
import { completarFicha, guardarPersonaACargo, usePersonasACargo, type FichaEntrada } from '../logica';
import { DatosTitular } from './DatosTitular';
import { EstadoAprobacion } from './EstadoAprobacion';
import { FichaForm } from './FichaForm';
import { PersonasACargo } from './PersonasACargo';
import { useMiFicha } from './useMiFicha';
import estilos from './PaginaFicha.module.css';

type AlumnoConFicha = SesionActual & { rol: 'alumno'; estado: 'pendiente' | 'aprobado' | 'rechazado' };

/** El huso del navegador sirve para acotar la fecha de nacimiento; el servidor valida de nuevo. */
function hoyLocal() {
  return hoyEn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

type FichaCompletaProps = { sesion: AlumnoConFicha; recienGuardada: boolean };

function FichaCompleta({ sesion, recienGuardada }: FichaCompletaProps) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [hoy] = useState(hoyLocal);
  const ficha = useMiFicha(sesion.alumno_id);
  const personas = usePersonasACargo(sesion.alumno_id);

  // Al completar la ficha el formulario desaparece: el foco pasa al título para no perderse.
  useEffect(() => {
    if (recienGuardada) titulo.current?.focus();
  }, [recienGuardada]);

  return (
    <div className={estilos.pagina}>
      <h1 ref={titulo} tabIndex={-1}>
        Ficha
      </h1>
      {recienGuardada ? (
        <Alerta tipo="exito" titulo="Ficha guardada">
          Tu cuenta quedó pendiente de aprobación.
        </Alerta>
      ) : null}
      <EstadoAprobacion estado={sesion.estado} motivo={sesion.motivo_rechazo} />
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

type FichaIncompletaProps = { sesion: SesionActual; alGuardar: () => void };

function FichaIncompleta({ sesion, alGuardar }: FichaIncompletaProps) {
  const [hoy] = useState(hoyLocal);
  const guardar = async (datos: FichaEntrada) => {
    const resultado = await completarFicha(datos);
    if (resultado.ok) alGuardar();
    return resultado;
  };
  return (
    <div className={estilos.pagina}>
      <h1>Ficha</h1>
      <FichaForm precargado={{ nombre: sesion.nombre, mail: sesion.mail }} hoy={hoy} onGuardar={guardar} />
      <p className={estilos.nota}>Vas a poder cargar personas a cargo cuando termines tu ficha.</p>
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
  const [recienGuardada, setRecienGuardada] = useState(false);

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
  if (s.rol === 'profesor') {
    return (
      <SinPermisos
        motivo="La ficha es para las cuentas de alumnos."
        destino={{ texto: 'Ir al panel', href: '#/panel' }}
      />
    );
  }
  if (s.estado === 'ficha_incompleta') {
    return <FichaIncompleta sesion={s} alGuardar={() => setRecienGuardada(true)} />;
  }
  if (s.estado === 'pendiente' || s.estado === 'aprobado' || s.estado === 'rechazado') {
    return <FichaCompleta sesion={{ ...s, rol: 'alumno', estado: s.estado }} recienGuardada={recienGuardada} />;
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
