// Sección «Grilla semanal» de Configuración (WEB-08, AGE-01..03, CA-11, CA-12, F-14): editor por día, vista previa de
// huecos que se actualiza al editar la grilla o la duración y aviso de que el cambio no mueve clases ni pedidos
// (AGE-03). Un botón guarda toda la grilla (`guardarGrilla` de `configuracion/logica`). Los errores por tramo se
// marcan en el campo; si la base rechaza, el mensaje queda en la sección. La validación del servidor es la que manda.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alerta, Boton } from '../../../ui';
import {
  avisoSinEfectoEnClases,
  MENSAJES_CONFIGURACION,
  validarGrilla,
  DIAS_SEMANA,
  type ResultadoGrilla,
  type TramoGrilla,
} from '../logica';
import estilos from './Agenda.module.css';
import { EditorGrilla, type TramoEditable } from './EditorGrilla';
import { huecosPorDia, textoHuecos } from './huecos';

export type SeccionGrillaProps = {
  /** Grilla guardada (`useConfiguracionAgenda().lectura.datos.grilla`). */
  grilla: readonly TramoGrilla[];
  /** Duración en minutos para la vista previa: la que se está editando si es válida, si no la guardada. */
  duracionMin: number;
  /** Huso del profesor: la grilla se lee en él (AGE-08). */
  zona: string;
  /** `useConfiguracionAgenda().guardarGrilla`: devuelve un resultado, no lanza. */
  onGuardar: (tramos: readonly TramoGrilla[]) => Promise<ResultadoGrilla>;
};

type Estado =
  | { tipo: 'ninguno' }
  | { tipo: 'enviando' }
  | { tipo: 'exito' }
  | { tipo: 'error'; mensaje: string };

function aEditables(tramos: readonly TramoGrilla[], primeraClave: number): TramoEditable[] {
  return tramos.map((t, i) => ({ clave: primeraClave + i, dia_semana: t.dia_semana, desde: t.desde, hasta: t.hasta }));
}

function aTramos(tramos: readonly TramoEditable[]): TramoGrilla[] {
  return tramos.map((t) => ({ dia_semana: t.dia_semana, desde: t.desde.trim(), hasta: t.hasta.trim() }));
}

export function SeccionGrilla({ grilla, duracionMin, zona, onGuardar }: SeccionGrillaProps) {
  const idBase = useId();
  const siguienteClave = useRef(grilla.length);
  const [tramos, setTramos] = useState<TramoEditable[]>(() => aEditables(grilla, 0));
  const [intentado, setIntentado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'ninguno' });
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const formulario = useRef<HTMLFormElement>(null);

  const lista = useMemo(() => aTramos(tramos), [tramos]);
  const validacion = useMemo(() => validarGrilla(lista), [lista]);
  const previa = useMemo(() => huecosPorDia(lista, duracionMin), [lista, duracionMin]);

  // Tras un intento fallido el foco va al primer campo con error: quien usa teclado o lector de pantalla llega a él.
  useEffect(() => {
    if (pedidoFoco > 0) formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [pedidoFoco]);

  const cambiar = (clave: number, campo: 'desde' | 'hasta', valor: string) => {
    setEstado({ tipo: 'ninguno' });
    setTramos((previos) => previos.map((t) => (t.clave === clave ? { ...t, [campo]: valor } : t)));
  };
  const agregar = (dia: TramoEditable['dia_semana']) => {
    setEstado({ tipo: 'ninguno' });
    setTramos((previos) => [...previos, { clave: siguienteClave.current++, dia_semana: dia, desde: '', hasta: '' }]);
  };
  const quitar = (clave: number) => {
    setEstado({ tipo: 'ninguno' });
    setTramos((previos) => previos.filter((t) => t.clave !== clave));
  };

  const guardar = async () => {
    setIntentado(true);
    if (!validacion.valida) {
      setEstado({ tipo: 'error', mensaje: validacion.general ?? MENSAJES_CONFIGURACION.grillaInvalida });
      setPedidoFoco((n) => n + 1);
      return;
    }
    setEstado({ tipo: 'enviando' });
    const r = await onGuardar(lista);
    if (r.ok) {
      setTramos(aEditables(r.grilla, siguienteClave.current));
      siguienteClave.current += r.grilla.length;
      setIntentado(false);
      setEstado({ tipo: 'exito' });
      return;
    }
    if (r.validacion) setIntentado(true);
    setEstado({ tipo: 'error', mensaje: r.mensaje });
    if (r.validacion) setPedidoFoco((n) => n + 1);
  };

  const errores = intentado ? validacion.porTramo : tramos.map(() => null);
  const idTitulo = `${idBase}-titulo`;
  const idAviso = `${idBase}-aviso`;

  return (
    <section aria-labelledby={idTitulo} className={estilos.seccion}>
      <h2 id={idTitulo}>Grilla semanal</h2>
      <p className={estilos.ayuda}>
        Elegí en qué horarios das clase cada día. Podés poner más de un tramo por día. Las horas son de tu huso
        horario ({zona}).
      </p>
      <p id={idAviso} className={estilos.nota}>
        {avisoSinEfectoEnClases(false, true)}
      </p>
      <form
        ref={formulario}
        noValidate
        className={estilos.formularioAncho}
        aria-describedby={idAviso}
        onSubmit={(e) => {
          e.preventDefault();
          if (estado.tipo !== 'enviando') void guardar();
        }}
      >
        <EditorGrilla
          tramos={tramos}
          errores={errores}
          deshabilitado={estado.tipo === 'enviando'}
          onCambiar={cambiar}
          onAgregar={agregar}
          onQuitar={quitar}
        />

        <div className={estilos.previa}>
          <h3 id={`${idBase}-previa`}>Huecos por día</h3>
          <div aria-live="polite">
            <ul className={estilos.previaLista} aria-labelledby={`${idBase}-previa`}>
              {DIAS_SEMANA.map((dia) => (
                <li key={dia}>{textoHuecos(dia, previa[dia])}</li>
              ))}
            </ul>
          </div>
          <p className={estilos.nota}>
            Los huecos salen seguidos desde el inicio de cada tramo; un resto menor que la duración no genera hueco.
          </p>
        </div>

        {estado.tipo === 'error' ? (
          <Alerta tipo="error" titulo="No se pudo guardar la grilla">
            {estado.mensaje}
          </Alerta>
        ) : null}
        <p role="status" className={estilos.resultado}>
          {estado.tipo === 'exito' ? MENSAJES_CONFIGURACION.grillaGuardada : ''}
        </p>
        <Boton type="submit" cargando={estado.tipo === 'enviando'} textoCargando="Guardando…">
          Guardar grilla
        </Boton>
      </form>
    </section>
  );
}
