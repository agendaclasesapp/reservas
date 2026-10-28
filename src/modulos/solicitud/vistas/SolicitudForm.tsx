// C-40 SolicitudForm (WEB-04, SOL-01, RES-02..05, SOL-10, AGE-11): formulario para pedir la clase de un hueco libre.
// Quién la toma (el titular o una persona a cargo, RES-03), clase suelta o serie semanal o quincenal (RES-02),
// observación (RES-04) y, para una serie, las fechas que se saltean antes de enviar (RES-05, CA-19). Presentación
// pura: recibe los datos ya resueltos y avisa con `onEnviar`; quien lo monta (SolicitudDeHueco) conecta los hooks.
// Los nombres de personas y la observación se muestran como texto (SEC-16).
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alerta, Boton, Cargando, ErrorCarga, GrupoOpciones, type OpcionGrupo } from '../../../ui';
import {
  LARGO_MAX_OBSERVACION,
  MENSAJES_SOLICITUD,
  type FalloSolicitud,
  type Frecuencia,
  type TipoReserva,
} from '../logica';
import { CampoObservacion } from './CampoObservacion';
import { FechasSalteadas, primeraFechaNoLibre, type VistaFechas } from './FechasSalteadas';
import { textoHorario } from './formato';
import estilos from './SolicitudForm.module.css';

/** C-42: lo que elige el alumno; `suelta` es una clase y las otras dos, una serie (RES-02). */
export type TipoClase = 'suelta' | 'semanal' | 'quincenal';

export function frecuenciaDeTipo(tipo: TipoClase): Frecuencia | null {
  return tipo === 'semanal' ? 1 : tipo === 'quincenal' ? 2 : null;
}

export function tipoReservaDe(tipo: TipoClase): TipoReserva {
  return tipo === 'suelta' ? 'suelta' : 'serie';
}

export type PersonaOpcion = { id: string; nombre: string };

/** Estado de la lista de personas a cargo (RES-03) como unión discriminada. */
export type VistaPersonas =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string; onReintentar: () => void }
  | { estado: 'listo'; personas: readonly PersonaOpcion[] };

/** Lo que el alumno completó; quien monta el formulario le suma el profesor y el hueco. */
export type DatosFormulario = {
  tipo: TipoReserva;
  frecuencia: Frecuencia | null;
  /** `null`: la toma el titular (RES-03). */
  personaACargoId: string | null;
  observacion: string;
};

export type SolicitudFormProps = {
  /** Nombre público del profesor (texto, SEC-16). */
  profesorNombre: string;
  /** Huso IANA del profesor: las horas se muestran siempre en él (AGE-08). */
  zona: string;
  hueco: { inicio: string; fin: string };
  personas: VistaPersonas;
  tipo: TipoClase;
  onCambioTipo: (tipo: TipoClase) => void;
  fechas: VistaFechas;
  enviando: boolean;
  /** Fallo del último envío, ya traducido (SEC-17). */
  error: FalloSolicitud | null;
  onEnviar: (datos: DatosFormulario) => void;
  /** «Volver a la agenda» cuando el fallo no se arregla reintentando. */
  onVolver: () => void;
};

type ValoresFormulario = { quien: string; observacion: string };

const TITULAR = 'titular';

const OPCIONES_TIPO: readonly OpcionGrupo[] = [
  { valor: 'suelta', etiqueta: 'Clase suelta', ayuda: 'Solo este día.' },
  { valor: 'semanal', etiqueta: 'Serie semanal', ayuda: 'Se repite todas las semanas hasta que se cancele.' },
  { valor: 'quincenal', etiqueta: 'Serie quincenal', ayuda: 'Se repite cada dos semanas hasta que se cancele.' },
];

function esTipoClase(valor: string): valor is TipoClase {
  return valor === 'suelta' || valor === 'semanal' || valor === 'quincenal';
}

/** Errores que se arreglan corrigiendo un campo o probando de nuevo; el resto se resuelve fuera del formulario. */
function sePuedeReintentar(error: FalloSolicitud): boolean {
  if (error.codigo === 'SIN_CONEXION' || error.codigo === 'DESCONOCIDO') return true;
  return error.codigo === 'DATOS_INVALIDOS' && error.campo !== null && error.campo !== 'inicio';
}

type ErrorEnvioProps = { error: FalloSolicitud; nombre: string; onVolver: () => void };

/** Mensaje del último envío: SOL-10 dice el límite, AGE-11 que el profesor no toma reservas (textos de `errores.ts`). */
function ErrorEnvio({ error, nombre, onVolver }: ErrorEnvioProps) {
  const reintentable = sePuedeReintentar(error);
  const titulo =
    error.codigo === 'PROFESOR_INACTIVO' ? `${nombre} no toma reservas por ahora` : 'No se pudo enviar el pedido';
  return (
    <Alerta
      tipo="error"
      titulo={titulo}
      accion={
        reintentable ? undefined : (
          <div className={estilos.acciones}>
            <Boton variante="secundario" onClick={onVolver}>
              Volver a la agenda
            </Boton>
            {error.codigo === 'FICHA_INCOMPLETA' ? (
              <a href="#/ficha" className={estilos.enlaceAccion}>
                Completar la ficha
              </a>
            ) : null}
            {error.codigo === 'NO_AUTENTICADO' ? (
              <a href="#/ingreso" className={estilos.enlaceAccion}>
                Ingresar
              </a>
            ) : null}
          </div>
        )
      }
    >
      {error.mensaje}
    </Alerta>
  );
}

export function SolicitudForm({
  profesorNombre,
  zona,
  hueco,
  personas,
  tipo,
  onCambioTipo,
  fechas,
  enviando,
  error,
  onEnviar,
  onVolver,
}: SolicitudFormProps) {
  const { control, handleSubmit } = useForm<ValoresFormulario>({
    defaultValues: { quien: TITULAR, observacion: '' },
  });
  const tipoRef = useRef<HTMLDivElement>(null);
  const observacionRef = useRef<HTMLTextAreaElement | null>(null);

  // Un 422 con `campo` (SEC-09) lleva el foco al control que hay que corregir.
  useEffect(() => {
    if (error?.campo === 'observacion') observacionRef.current?.focus();
    else if (error?.campo === 'tipo' || error?.campo === 'frecuencia') tipoRef.current?.querySelector('input')?.focus();
  }, [error]);

  const hayPersonas = personas.estado === 'listo' && personas.personas.length > 0;
  const personasPendientes = personas.estado !== 'listo';
  const calculando = tipo !== 'suelta' && fechas.estado === 'cargando';
  const sinFechas = tipo !== 'suelta' && fechas.estado === 'error';
  const bloqueado = personasPendientes || calculando || sinFechas || primeraFechaNoLibre(fechas);
  const esperando = personas.estado === 'cargando' || calculando;
  const sinSalida = error !== null && !sePuedeReintentar(error);

  const alEnviar = (valores: ValoresFormulario) => {
    const elegida = valores.quien === TITULAR ? null : valores.quien;
    onEnviar({
      tipo: tipoReservaDe(tipo),
      frecuencia: frecuenciaDeTipo(tipo),
      personaACargoId: elegida,
      observacion: valores.observacion.trim(),
    });
  };

  const errorDeTipo =
    error?.campo === 'tipo'
      ? MENSAJES_SOLICITUD.tipoInvalido
      : error?.campo === 'frecuencia'
        ? MENSAJES_SOLICITUD.frecuenciaFaltante
        : '';

  return (
    <form className={estilos.form} noValidate onSubmit={(e) => void handleSubmit(alEnviar, () => observacionRef.current?.focus())(e)}>
      <p className={estilos.horario}>
        <strong>Horario:</strong> {textoHorario(hueco.inicio, hueco.fin, zona)}
      </p>

      {personas.estado === 'cargando' ? <Cargando etiqueta="Cargando tus personas a cargo…" /> : null}
      {personas.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No pudimos cargar tus personas a cargo. ${personas.mensaje}`.trim()}
          onReintentar={personas.onReintentar}
        />
      ) : null}
      {personas.estado === 'listo' ? (
        <div className={estilos.quien}>
          {hayPersonas ? (
            <Controller
              name="quien"
              control={control}
              render={({ field }) => (
                <GrupoOpciones
                  legend="¿Quién toma la clase?"
                  opciones={[
                    { valor: TITULAR, etiqueta: 'Yo' },
                    ...personas.personas.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
                  ]}
                  valor={field.value}
                  onCambio={field.onChange}
                  deshabilitado={enviando}
                />
              )}
            />
          ) : (
            <p className={estilos.texto}>
              <strong>La toma:</strong> vos.
            </p>
          )}
          <p className={estilos.ayuda}>
            Si la toma otra persona que no está en la lista, agregala antes en tu{' '}
            <a href="#/ficha" className={estilos.enlace}>
              ficha
            </a>
            .
          </p>
        </div>
      ) : null}

      <div ref={tipoRef}>
        <GrupoOpciones
          legend="¿Cómo querés pedirla?"
          opciones={OPCIONES_TIPO}
          valor={tipo}
          onCambio={(valor) => {
            if (esTipoClase(valor)) onCambioTipo(valor);
          }}
          error={errorDeTipo}
          deshabilitado={enviando}
        />
      </div>

      <FechasSalteadas vista={fechas} zona={zona} />

      <Controller
        name="observacion"
        control={control}
        rules={{
          validate: (v) => v.trim().length <= LARGO_MAX_OBSERVACION || MENSAJES_SOLICITUD.observacionLarga,
        }}
        render={({ field, fieldState }) => (
          <CampoObservacion
            ref={(elemento) => {
              field.ref(elemento);
              observacionRef.current = elemento;
            }}
            valor={field.value}
            onCambio={field.onChange}
            deshabilitado={enviando}
            error={fieldState.error?.message ?? (error?.campo === 'observacion' ? MENSAJES_SOLICITUD.observacionLarga : '')}
          />
        )}
      />

      {error !== null && (error.campo === null || error.campo === 'inicio' || error.codigo !== 'DATOS_INVALIDOS') ? (
        <ErrorEnvio error={error} nombre={profesorNombre} onVolver={onVolver} />
      ) : null}

      {sinSalida ? null : (
        <div className={estilos.envio}>
          {esperando ? (
            <p className={estilos.ayuda}>
              {personas.estado === 'cargando' ? 'Esperá a que carguen tus personas a cargo.' : 'Esperá a que se calculen las fechas.'}
            </p>
          ) : null}
          <Boton type="submit" cargando={enviando} textoCargando="Enviando…" deshabilitado={bloqueado}>
            Pedir clase
          </Boton>
        </div>
      )}
    </form>
  );
}
