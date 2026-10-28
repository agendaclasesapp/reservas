// «Crear clase» (PRF-01, PRF-04, AVI-04, WEB-06, F-08): alumno del buscador (con o sin cuenta), quién toma la clase si
// tiene personas a cargo, clase suelta o serie (semanal o quincenal) y observación. La clase queda confirmada sin
// solicitud y sin anticipación mínima. El aviso «Se enviará un mail al titular» solo sale si puede recibirlo. Con el
// profesor inactivo (PRF-08) no hay formulario: aviso y botón deshabilitado. Errores con motivo; las fechas salteadas de
// una serie se listan en el resultado (RES-05). Los nombres son texto (SEC-16).
import { useEffect, useMemo, useState } from 'react';
import { Alerta, Boton, Campo, Cargando, ErrorCarga, GrupoOpciones, Vacio } from '../../../ui';
import type { PersonaACargo } from '../../ficha/logica';
import type { AlumnoLista, EstadoAlumnos } from '../../lista/logica';
import {
  LARGO_MAX_OBSERVACION,
  MENSAJES_PANEL,
  type EntradaCrearClase,
  type FalloPanel,
  type FilaAgendaProfesor,
  type Frecuencia,
  type TipoClase,
} from '../logica';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { fechaCorta, normalizarBusqueda, TEXTOS_PANEL } from './formato';
import estilos from './Acciones.module.css';

export type CrearClaseFormProps = {
  /** El hueco libre tocado. */
  fila: FilaAgendaProfesor;
  zona: string;
  /** Alumnos del profesor (`useAlumnos` de `lista/logica`); acá se eligen los aprobados y los sin cuenta. */
  alumnos: EstadoAlumnos;
  onReintentarAlumnos: () => void;
  /** `permisosPanel(activo).crear`: con la agenda inactiva no hay formulario (PRF-08). */
  habilitado: boolean;
  acciones: Pick<AccionesPanel, 'crear' | 'leerPersonasACargo'>;
  onHecho: (resultado: ResultadoPanel) => void;
  /** La agenda quedó desactualizada (p. ej. el hueco ya no estaba libre): hay que volver a leerla. */
  onDesactualizada: () => void;
};

const TITULAR = 'titular';

type CampoForm = 'alumno' | 'tipo' | 'frecuencia' | 'observacion';

/** Qué campo marca un fallo de `crearClase`; null = error general. */
function campoDelFallo(fallo: FalloPanel): CampoForm | null {
  if (fallo.campo === 'p_tipo') return 'tipo';
  if (fallo.campo === 'p_frecuencia') return 'frecuencia';
  if (fallo.campo === 'p_observacion') return 'observacion';
  if (fallo.mensaje === MENSAJES_PANEL.alumnoRequerido) return 'alumno';
  return null;
}

const OPCIONES_TIPO = [
  { valor: 'suelta', etiqueta: 'Clase suelta' },
  { valor: 'serie', etiqueta: 'Serie' },
] as const;

const OPCIONES_FRECUENCIA = [
  { valor: '1', etiqueta: MENSAJES_PANEL.frecuencia[1] },
  { valor: '2', etiqueta: MENSAJES_PANEL.frecuencia[2] },
] as const;

type PersonasLeidas = { alumnoId: string; lista: readonly PersonaACargo[]; error: boolean };

function esAlumnoElegible(a: AlumnoLista): boolean {
  return a.estado === 'aprobado' || a.estado === 'sin_cuenta';
}

function nombreAlumno(a: AlumnoLista): string {
  return a.nombre?.trim() ? a.nombre : TEXTOS_PANEL.alumnoSinNombre;
}

function etiquetaAlumno(a: AlumnoLista): string {
  return a.estado === 'sin_cuenta' ? `${nombreAlumno(a)} (sin cuenta)` : nombreAlumno(a);
}

/** AVI-04: el mail le llega al titular con cuenta aprobada que tiene mail; un alumno sin cuenta no recibe mails. */
export function recibeMail(alumno: AlumnoLista | undefined): boolean {
  return alumno !== undefined && alumno.estado === 'aprobado' && Boolean(alumno.mail?.trim());
}

export function CrearClaseForm({
  fila,
  zona,
  alumnos,
  onReintentarAlumnos,
  habilitado,
  acciones,
  onHecho,
  onDesactualizada,
}: CrearClaseFormProps) {
  const [busqueda, setBusqueda] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [quien, setQuien] = useState(TITULAR);
  const [tipo, setTipo] = useState<TipoClase>('suelta');
  const [frecuencia, setFrecuencia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloPanel | null>(null);
  const [personas, setPersonas] = useState<PersonasLeidas | null>(null);
  const leerPersonas = acciones.leerPersonasACargo;

  const elegibles = useMemo(() => alumnos.alumnos.filter(esAlumnoElegible), [alumnos.alumnos]);
  const visibles = useMemo(() => {
    const q = normalizarBusqueda(busqueda);
    return elegibles.filter((a) => a.id === alumnoId || q === '' || normalizarBusqueda(a.nombre ?? '').includes(q));
  }, [elegibles, busqueda, alumnoId]);
  const alumno = elegibles.find((a) => a.id === alumnoId);

  // Las personas a cargo del alumno elegido (para «¿Quién toma la clase?»).
  useEffect(() => {
    if (alumnoId === '' || !leerPersonas) return;
    let vigente = true;
    leerPersonas(alumnoId).then(
      (lista) => {
        if (vigente) setPersonas({ alumnoId, lista, error: false });
      },
      () => {
        if (vigente) setPersonas({ alumnoId, lista: [], error: true });
      },
    );
    return () => {
      vigente = false;
    };
  }, [alumnoId, leerPersonas]);

  const personasDelAlumno = personas !== null && personas.alumnoId === alumnoId ? personas : null;
  const personasLista = personasDelAlumno?.lista ?? [];

  if (!habilitado) {
    return (
      <div className={estilos.formulario}>
        <Alerta tipo="aviso">{TEXTOS_PANEL.inactivoNoCrea}</Alerta>
        <div className={estilos.botones}>
          <Boton deshabilitado>Crear clase</Boton>
        </div>
      </div>
    );
  }

  const elegirAlumno = (id: string) => {
    setAlumnoId(id);
    setQuien(TITULAR);
    setFallo(null);
  };

  const enviar = async () => {
    setFallo(null);
    setEnviando(true);
    const entrada: EntradaCrearClase = {
      alumnoId,
      personaACargoId: quien === TITULAR ? null : quien,
      inicio: fila.inicio,
      tipo,
      frecuencia: tipo === 'serie' && frecuencia !== '' ? (Number(frecuencia) as Frecuencia) : null,
      observacion,
    };
    const r = await acciones.crear(entrada);
    setEnviando(false);
    if (!r.ok) {
      setFallo(r);
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onDesactualizada();
      return;
    }
    const quienTexto = alumno ? nombreAlumno(alumno) : '';
    const cuando = fechaCorta(fila.inicio, zona);
    onHecho({
      mensaje:
        tipo === 'serie'
          ? `Serie creada para ${quienTexto} desde el ${cuando}`
          : `Clase creada para ${quienTexto} el ${cuando}`,
      detalle: recibeMail(alumno) ? 'Le avisamos por mail al titular.' : undefined,
      salteadas: r.salteadas,
    });
  };

  const errorDe = (campo: CampoForm) => (fallo && campoDelFallo(fallo) === campo ? fallo.mensaje : undefined);
  const errorGeneral = fallo && campoDelFallo(fallo) === null ? fallo : null;

  const cuerpoAlumnos =
    alumnos.estado === 'error' && elegibles.length === 0 ? (
      <ErrorCarga mensaje={`No se pudo cargar tu lista de alumnos. ${alumnos.error ?? ''}`.trim()} onReintentar={onReintentarAlumnos} />
    ) : alumnos.estado === 'cargando' && elegibles.length === 0 ? (
      <Cargando etiqueta="Cargando tus alumnos…" renglones={3} />
    ) : elegibles.length === 0 ? (
      <Vacio nivel={3} titulo={TEXTOS_PANEL.sinAlumnos} texto={TEXTOS_PANEL.sinAlumnosAyuda} />
    ) : (
      <>
        <Campo etiqueta="Buscar alumno" tipo="search" valor={busqueda} onCambio={setBusqueda} autoComplete="off" />
        {visibles.length === 0 ? (
          <p role="status" className={estilos.nota}>
            {TEXTOS_PANEL.sinCoincidencias}
          </p>
        ) : (
          <div className={estilos.alumnos}>
            <GrupoOpciones
              legend="Alumno"
              requerido
              opciones={visibles.map((a) => ({ valor: a.id, etiqueta: etiquetaAlumno(a) }))}
              valor={alumnoId}
              onCambio={elegirAlumno}
              error={errorDe('alumno')}
            />
          </div>
        )}
      </>
    );

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!enviando) void enviar();
      }}
    >
      {cuerpoAlumnos}

      {personasLista.length > 0 ? (
        <GrupoOpciones
          legend="¿Quién toma la clase?"
          opciones={[
            { valor: TITULAR, etiqueta: `El titular (${alumno ? nombreAlumno(alumno) : ''})` },
            ...personasLista.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
          ]}
          valor={quien}
          onCambio={setQuien}
        />
      ) : null}
      {personasDelAlumno?.error ? <Alerta tipo="aviso">{TEXTOS_PANEL.errorPersonas}</Alerta> : null}

      <GrupoOpciones
        legend="Tipo de clase"
        opciones={OPCIONES_TIPO}
        valor={tipo}
        onCambio={(v) => setTipo(v === 'serie' ? 'serie' : 'suelta')}
        error={errorDe('tipo')}
      />
      {tipo === 'serie' ? (
        <GrupoOpciones
          legend="Frecuencia de la serie"
          requerido
          opciones={OPCIONES_FRECUENCIA}
          valor={frecuencia}
          onCambio={setFrecuencia}
          error={errorDe('frecuencia')}
        />
      ) : null}

      <Campo
        etiqueta="Observación"
        ayuda={`Opcional. Hasta ${LARGO_MAX_OBSERVACION} caracteres.`}
        valor={observacion}
        onCambio={setObservacion}
        error={errorDe('observacion')}
      />

      {recibeMail(alumno) ? <p className={estilos.nota}>{TEXTOS_PANEL.avisoMail}</p> : null}

      {errorGeneral ? (
        <Alerta tipo="error" titulo="No se pudo crear la clase">
          {errorGeneral.mensaje}
        </Alerta>
      ) : null}

      <div className={estilos.botones}>
        <Boton type="submit" cargando={enviando} textoCargando="Creando…">
          Crear clase
        </Boton>
      </div>
    </form>
  );
}
