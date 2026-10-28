// Mis clases de la persona (WEB-05, RES-06, ALU-03, SOL-08, SEC-16; flujos.md F-06): el estado del vínculo con cada
// profesor (con el motivo de rechazo, como texto) y las clases de todos sus profesores en Próximas y Pasadas,
// cada una con su profesor y en el huso de ese profesor (CA-53). Las pendientes se destacan arriba de Próximas.
// Estados: cargando, error con reintentar, vacío y sin permisos. B08 (SOL-02, SOL-03, SOL-10, AGE-11): cada clase
// confirmada futura ofrece Mover y Avisar que no voy, que abren `CambiarClase` (alcance, hueco destino, errores).
// Recibe sesión y datos por props: la página los conecta con `useSesion()`, `useMisClases()` y `useCambioDeClase()`.
import { useMemo, useState, type ReactNode } from 'react';
import { rutaDeProfesor, type EstadoSesion, type SesionActual } from '../../../estado';
import { Cargando, EnlaceAccion, ErrorCarga, SinPermisos, Vacio } from '../../../ui';
import {
  agruparMisClases,
  hayVariosHusos,
  profesoresDeMisClases,
  type CambioDeClase,
  type ClaseMia,
  type EstadoMisClases,
  type ProfesorDeMisClases,
} from '../logica';
import type { ObtenerAgenda, ObtenerConfig } from '../../agenda/logica';
import { CambiarClase, type CambioHecho, type ModoCambio } from './CambiarClase';
import { EstadoVinculos } from './EstadoVinculos';
import { PestanasClases } from './PestanasClases';
import { TarjetaClase } from './TarjetaClase';
import estilos from './VistaMisClases.module.css';

export type VistaMisClasesProps = {
  estado: EstadoSesion;
  datos: EstadoMisClases;
  /** Vuelve a leer `v_mis_clases` (botón «Reintentar»). */
  onRecargar: () => void;
  onReintentarSesion: () => void;
  /** Pedir mover o avisar que no voy (useCambioDeClase). Sin él la vista es de solo lectura. */
  cambio?: CambioDeClase;
  /** Solo para pruebas: la configuración y los huecos del profesor al elegir el destino de un movimiento. */
  obtenerConfig?: ObtenerConfig;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
};

type OpcionesCambio = Pick<VistaMisClasesProps, 'cambio' | 'obtenerConfig' | 'obtenerAgenda' | 'ahora'>;

type IdPestana = 'proximas' | 'pasadas';

export const MENSAJES_VISTA = {
  sinProximas: 'Todavía no tenés clases próximas',
  sinPasadas: 'Todavía no tenés clases pasadas',
  verAgenda: 'Ver la agenda',
  errorCarga: 'No se pudieron cargar tus clases.',
} as const;

/** Enlace a la agenda: la del único profesor con vínculo, o el inicio (que los lista) si hay varios. */
function destinoAgenda(profesores: readonly ProfesorDeMisClases[]): string {
  const con = profesores.filter((p) => p.estado !== null && p.slug !== null);
  const unico = con.length === 1 ? con[0] : undefined;
  return unico?.slug ? `#${rutaDeProfesor(unico.slug)}` : '#/';
}

type AccionesGrupo = {
  onMover?: (clase: ClaseMia) => void;
  onAvisar?: (clase: ClaseMia) => void;
  hecho: CambioHecho | null;
};

type GrupoProps = {
  titulo: string;
  clases: readonly ClaseMia[];
  mostrarHuso: boolean;
  destacadas?: boolean;
  acciones: AccionesGrupo;
};

function Grupo({ titulo, clases, mostrarHuso, destacadas = false, acciones }: GrupoProps) {
  if (clases.length === 0) return null;
  return (
    <div className={estilos.grupo}>
      <h3>{titulo}</h3>
      <ul className={estilos.lista}>
        {clases.map((c) => (
          <li key={c.id}>
            <TarjetaClase
              clase={c}
              mostrarHuso={mostrarHuso}
              destacada={destacadas}
              onMover={acciones.onMover}
              onAvisar={acciones.onAvisar}
              hecho={acciones.hecho?.claseId === c.id ? acciones.hecho : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

type ClasesProps = OpcionesCambio & {
  clases: readonly ClaseMia[];
  profesores: readonly ProfesorDeMisClases[];
  onRecargar: () => void;
};

type DialogoAbierto = { clase: ClaseMia; modo: ModoCambio };

function Clases({ clases, profesores, onRecargar, cambio, obtenerConfig, obtenerAgenda, ahora }: ClasesProps) {
  const [pestana, setPestana] = useState<IdPestana>('proximas');
  const [abierto, setAbierto] = useState<DialogoAbierto | null>(null);
  const [hecho, setHecho] = useState<CambioHecho | null>(null);
  // La clase abierta se busca de nuevo en cada lectura: si ya no es modificable, el diálogo se cierra solo.
  const claseAbierta = abierto === null ? null : (clases.find((c) => c.id === abierto.clase.id) ?? abierto.clase);
  const acciones: AccionesGrupo = {
    onMover: cambio ? (clase) => setAbierto({ clase, modo: 'mover' }) : undefined,
    onAvisar: cambio ? (clase) => setAbierto({ clase, modo: 'avisar' }) : undefined,
    hecho,
  };
  const grupos = useMemo(() => agruparMisClases(clases), [clases]);
  const mostrarHuso = hayVariosHusos(clases);
  // Las futuras rechazadas, canceladas o cambiadas de horario siguen visibles, mezcladas por fecha con las confirmadas.
  const proximas = useMemo(
    () => [...grupos.proximas, ...grupos.canceladas].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id)),
    [grupos],
  );
  const hayProximas = grupos.pendientes.length + proximas.length > 0;
  return (
    <section aria-labelledby="mis-clases-clases" className={estilos.clases}>
      <h2 id="mis-clases-clases" className={estilos.subtitulo}>
        Tus clases
      </h2>
      <PestanasClases
        etiqueta="Tus clases"
        activa={pestana}
        onCambio={(id) => setPestana(id === 'pasadas' ? 'pasadas' : 'proximas')}
        pestanas={[
          {
            id: 'proximas',
            etiqueta: 'Próximas',
            contenido: hayProximas ? (
              <>
                <Grupo
                  titulo="Solicitudes pendientes"
                  clases={grupos.pendientes}
                  mostrarHuso={mostrarHuso}
                  destacadas
                  acciones={acciones}
                />
                <Grupo titulo="Próximas clases" clases={proximas} mostrarHuso={mostrarHuso} acciones={acciones} />
              </>
            ) : (
              <Vacio
                nivel={3}
                titulo={MENSAJES_VISTA.sinProximas}
                accion={<EnlaceAccion href={destinoAgenda(profesores)}>{MENSAJES_VISTA.verAgenda}</EnlaceAccion>}
              />
            ),
          },
          {
            id: 'pasadas',
            etiqueta: 'Pasadas',
            contenido:
              grupos.pasadas.length > 0 ? (
                <Grupo titulo="Clases pasadas" clases={grupos.pasadas} mostrarHuso={mostrarHuso} acciones={{ hecho: null }} />
              ) : (
                <Vacio nivel={3} titulo={MENSAJES_VISTA.sinPasadas} />
              ),
          },
        ]}
      />
      {cambio && abierto !== null && claseAbierta !== null ? (
        <CambiarClase
          clase={claseAbierta}
          modo={abierto.modo}
          cambio={cambio}
          obtenerConfig={obtenerConfig}
          obtenerAgenda={obtenerAgenda}
          ahora={ahora}
          onCerrar={() => setAbierto(null)}
          onHecho={(h) => {
            setAbierto(null);
            setHecho(h);
            onRecargar();
          }}
        />
      ) : null}
    </section>
  );
}

function conTitulo(contenido: ReactNode) {
  return (
    <div className={estilos.pagina}>
      <h1 className={estilos.titulo}>Mis clases</h1>
      {contenido}
    </div>
  );
}

/** Quién puede ver Mis clases: la persona con sesión y la ficha completa (la guarda de ruta ya lo decide). */
function sinPermisos(sesion: SesionActual): ReactNode {
  if (sesion.rol !== 'alumno') {
    return (
      <SinPermisos motivo="Mis clases es para las cuentas de alumnos." destino={{ texto: 'Ir al panel', href: '#/panel' }} />
    );
  }
  if (sesion.estado !== 'completa') {
    return (
      <SinPermisos
        motivo="Antes de ver tus clases tenés que completar tu ficha."
        destino={{ texto: 'Ir a la ficha', href: '#/ficha' }}
      />
    );
  }
  return null;
}

export function VistaMisClases({
  estado,
  datos,
  onRecargar,
  onReintentarSesion,
  cambio,
  obtenerConfig,
  obtenerAgenda,
  ahora,
}: VistaMisClasesProps) {
  const sesion = estado.tipo === 'sesion' ? estado.sesion : null;
  const profesores = useMemo(() => profesoresDeMisClases(sesion, datos.clases), [sesion, datos.clases]);

  if (estado.tipo === 'cargando') return conTitulo(<Cargando etiqueta="Cargando tus clases…" renglones={4} />);
  if (estado.tipo === 'error') return conTitulo(<ErrorCarga mensaje={estado.mensaje} onReintentar={onReintentarSesion} />);
  if (estado.tipo === 'visitante') {
    return (
      <SinPermisos motivo="Para ver tus clases tenés que ingresar." destino={{ texto: 'Ingresar', href: '#/ingreso' }} />
    );
  }
  const bloqueo = sinPermisos(estado.sesion);
  if (bloqueo !== null) return bloqueo;

  const primeraCarga = datos.estado === 'cargando' && datos.clases.length === 0;
  // Al recargar (tras Mover o Avisar) el hook conserva las clases con estado «cargando»: la lista sigue montada para que
  // el aviso «Pedido enviado» y la pestaña elegida sobrevivan a la recarga (H-364).
  const recargando = datos.estado === 'cargando' && datos.clases.length > 0;
  return conTitulo(
    <>
      <EstadoVinculos profesores={profesores} />
      {primeraCarga ? <Cargando etiqueta="Cargando tus clases…" renglones={3} /> : null}
      {datos.estado === 'error' ? (
        <ErrorCarga mensaje={`${MENSAJES_VISTA.errorCarga} ${datos.error ?? ''}`.trim()} onReintentar={onRecargar} />
      ) : null}
      {datos.estado === 'listo' || recargando ? (
        <Clases
          clases={datos.clases}
          profesores={profesores}
          onRecargar={onRecargar}
          cambio={cambio}
          obtenerConfig={obtenerConfig}
          obtenerAgenda={obtenerAgenda}
          ahora={ahora}
        />
      ) : null}
    </>,
  );
}
