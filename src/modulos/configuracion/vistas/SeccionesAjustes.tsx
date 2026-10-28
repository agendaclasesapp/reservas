// Secciones «Duración de clase», «Anticipación mínima» y «Huso horario» de Configuración (WEB-08, AGE-02..04, AGE-08,
// AGE-10, CA-12, CA-16, F-14). Cada sección tiene su campo, su botón y su resultado; las tres usan
// `guardarConfiguracion` (la base guarda los tres valores juntos), mandando lo guardado en los otros dos. Antes de
// cambiar el huso se pide confirmación con la advertencia de `advertenciaCambioHuso` (solo cambia su agenda). La
// validación de rangos es comodidad: la base repite los límites (SEC-09).
import { useMemo, useState, type ReactNode } from 'react';
import { Alerta, Boton, Campo, Dialogo } from '../../../ui';
import {
  advertenciaCambioHuso,
  ANTICIPACION_HORAS_MAXIMA,
  ANTICIPACION_HORAS_MINIMA,
  avisoSinEfectoEnClases,
  DURACION_MIN_MAXIMA,
  DURACION_MIN_MINIMA,
  MENSAJES_CONFIGURACION,
  validarConfiguracion,
  zonasHorarias,
  type CampoConfiguracion,
  type ConfiguracionAgenda,
  type EntradaConfiguracion,
  type FalloConfiguracion,
  type ResultadoConfiguracion,
} from '../logica';
import estilos from './Agenda.module.css';

export type SeccionesAjustesProps = {
  /** Configuración guardada (`useConfiguracionAgenda().lectura.datos.config`). */
  config: ConfiguracionAgenda;
  /** Duración que se está editando, como texto (la vista previa de la grilla la usa). */
  duracionTexto: string;
  onDuracionTexto: (texto: string) => void;
  /** `useConfiguracionAgenda().guardarConfiguracion`: devuelve un resultado, no lanza. */
  onGuardar: (entrada: EntradaConfiguracion) => Promise<ResultadoConfiguracion>;
};

type Seccion = 'duracion' | 'anticipacion' | 'huso';

type Estado =
  | { tipo: 'ninguno' }
  | { tipo: 'enviando' }
  | { tipo: 'exito' }
  | { tipo: 'error'; fallo: FalloConfiguracion };

const CAMPO_DE: Record<Seccion, CampoConfiguracion> = {
  duracion: 'p_duracion_min',
  anticipacion: 'p_anticipacion_horas',
  huso: 'p_zona_horaria',
};

const NINGUNO: Record<Seccion, Estado> = {
  duracion: { tipo: 'ninguno' },
  anticipacion: { tipo: 'ninguno' },
  huso: { tipo: 'ninguno' },
};

/** Entero sin signo escrito por la persona; cualquier otra cosa es NaN y la validación la marca. */
function aEntero(texto: string): number {
  const t = texto.trim();
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

type SeccionAjusteProps = {
  seccion: Seccion;
  titulo: string;
  ayuda: string;
  boton: string;
  estado: Estado;
  onGuardar: () => void;
  children: (error: string | undefined) => ReactNode;
};

/** Cáscara común: título, formulario, campo, resultado y botón de guardar. */
function SeccionAjuste({ seccion, titulo, ayuda, boton, estado, onGuardar, children }: SeccionAjusteProps) {
  const idTitulo = `config-${seccion}-titulo`;
  const errorDelCampo =
    estado.tipo === 'error' && estado.fallo.campo === CAMPO_DE[seccion] ? estado.fallo.mensaje : undefined;
  const errorGeneral = estado.tipo === 'error' && errorDelCampo === undefined ? estado.fallo.mensaje : null;
  return (
    <section aria-labelledby={idTitulo} className={estilos.seccion}>
      <h2 id={idTitulo}>{titulo}</h2>
      <p className={estilos.ayuda}>{ayuda}</p>
      <form
        noValidate
        className={estilos.formulario}
        onSubmit={(e) => {
          e.preventDefault();
          if (estado.tipo !== 'enviando') onGuardar();
        }}
      >
        {children(errorDelCampo)}
        {errorGeneral !== null ? (
          <Alerta tipo="error" titulo="No se pudo guardar">
            {errorGeneral}
          </Alerta>
        ) : null}
        <p role="status" className={estilos.resultado}>
          {estado.tipo === 'exito' ? MENSAJES_CONFIGURACION.guardada : ''}
        </p>
        <Boton type="submit" cargando={estado.tipo === 'enviando'} textoCargando="Guardando…">
          {boton}
        </Boton>
      </form>
    </section>
  );
}

export function SeccionesAjustes({ config, duracionTexto, onDuracionTexto, onGuardar }: SeccionesAjustesProps) {
  const [anticipacionTexto, setAnticipacionTexto] = useState(String(config.anticipacion_horas));
  const [huso, setHuso] = useState(config.zona_horaria);
  const [estados, setEstados] = useState<Record<Seccion, Estado>>(NINGUNO);
  const [confirmando, setConfirmando] = useState(false);
  const zonas = useMemo(() => zonasHorarias(config.zona_horaria), [config.zona_horaria]);

  const poner = (seccion: Seccion, estado: Estado) => setEstados((previos) => ({ ...previos, [seccion]: estado }));

  const enviar = async (seccion: Seccion, entrada: EntradaConfiguracion) => {
    poner(seccion, { tipo: 'enviando' });
    const r = await onGuardar(entrada);
    if (r.ok) {
      poner(seccion, { tipo: 'exito' });
      setConfirmando(false);
      return;
    }
    poner(seccion, { tipo: 'error', fallo: r });
  };

  const guardar = (seccion: Seccion) => {
    const entrada: EntradaConfiguracion = {
      duracionMin: seccion === 'duracion' ? aEntero(duracionTexto) : config.duracion_min,
      anticipacionHoras: seccion === 'anticipacion' ? aEntero(anticipacionTexto) : config.anticipacion_horas,
      zonaHoraria: seccion === 'huso' ? huso : config.zona_horaria,
    };
    const invalido = validarConfiguracion(entrada);
    if (invalido) {
      poner(seccion, { tipo: 'error', fallo: invalido });
      return;
    }
    if (seccion === 'huso' && advertenciaCambioHuso(config.zona_horaria, huso) !== null) {
      poner(seccion, { tipo: 'ninguno' });
      setConfirmando(true);
      return;
    }
    void enviar(seccion, entrada);
  };

  const cancelarCambioHuso = () => {
    setConfirmando(false);
    poner('huso', { tipo: 'ninguno' });
  };

  const advertencia = advertenciaCambioHuso(config.zona_horaria, huso);
  const estadoHuso = estados.huso;
  const errorEnDialogo = confirmando && estadoHuso.tipo === 'error' ? estadoHuso.fallo.mensaje : null;

  return (
    <>
      <SeccionAjuste
        seccion="duracion"
        titulo="Duración de clase"
        ayuda="Todas tus clases duran lo mismo. Los huecos se generan seguidos desde el inicio de cada tramo de la grilla."
        boton="Guardar duración"
        estado={estados.duracion}
        onGuardar={() => guardar('duracion')}
      >
        {(error) => (
          <>
            <Campo
              etiqueta="Duración de la clase (minutos)"
              ayuda={`Un número entero entre ${DURACION_MIN_MINIMA} y ${DURACION_MIN_MAXIMA}.`}
              valor={duracionTexto}
              onCambio={(v) => {
                onDuracionTexto(v);
                poner('duracion', { tipo: 'ninguno' });
              }}
              inputMode="numeric"
              error={error}
              requerido
            />
            <p className={estilos.nota}>{avisoSinEfectoEnClases(true)}</p>
          </>
        )}
      </SeccionAjuste>

      <SeccionAjuste
        seccion="anticipacion"
        titulo="Anticipación mínima"
        ayuda="Un alumno no puede pedir una clase que empieza antes de este plazo. Vos sí podés crearla."
        boton="Guardar anticipación"
        estado={estados.anticipacion}
        onGuardar={() => guardar('anticipacion')}
      >
        {(error) => (
          <Campo
            etiqueta="Anticipación mínima (horas)"
            ayuda={`Un número entero entre ${ANTICIPACION_HORAS_MINIMA} y ${ANTICIPACION_HORAS_MAXIMA} (hasta 366 días). Con 0 no hay plazo mínimo.`}
            valor={anticipacionTexto}
            onCambio={(v) => {
              setAnticipacionTexto(v);
              poner('anticipacion', { tipo: 'ninguno' });
            }}
            inputMode="numeric"
            error={error}
            requerido
          />
        )}
      </SeccionAjuste>

      <SeccionAjuste
        seccion="huso"
        titulo="Huso horario"
        ayuda="Todas las horas de tu agenda se guardan y se muestran en este huso. Cambiarlo solo cambia tu agenda, no la de otros profesores."
        boton="Guardar huso horario"
        estado={confirmando ? { tipo: 'ninguno' } : estadoHuso}
        onGuardar={() => guardar('huso')}
      >
        {(error) => (
          <div className={estilos.campo}>
            <label htmlFor="config-huso" className={estilos.etiqueta}>
              Huso horario
            </label>
            <select
              id="config-huso"
              className={`${estilos.entrada} ${error ? estilos.conError : ''}`}
              value={huso}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'config-huso-error' : undefined}
              onChange={(e) => {
                setHuso(e.target.value);
                poner('huso', { tipo: 'ninguno' });
              }}
            >
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            {error ? (
              <p id="config-huso-error" role="alert" className={estilos.error}>
                {error}
              </p>
            ) : null}
          </div>
        )}
      </SeccionAjuste>

      <Dialogo
        abierto={confirmando}
        titulo="Cambiar el huso horario"
        onCerrar={cancelarCambioHuso}
        textoCerrar="Cancelar"
        acciones={
          <Boton
            cargando={estadoHuso.tipo === 'enviando'}
            textoCargando="Cambiando…"
            onClick={() =>
              void enviar('huso', {
                duracionMin: config.duracion_min,
                anticipacionHoras: config.anticipacion_horas,
                zonaHoraria: huso,
              })
            }
          >
            Cambiar huso
          </Boton>
        }
      >
        <p>{advertencia}</p>
        <p className={estilos.nota}>
          De {config.zona_horaria} a {huso}.
        </p>
        {errorEnDialogo !== null ? (
          <Alerta tipo="error" titulo="No se pudo cambiar el huso">
            {errorEnDialogo}
          </Alerta>
        ) : null}
      </Dialogo>
    </>
  );
}
