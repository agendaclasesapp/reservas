// Formulario de la ficha del primer ingreso (WEB-03, ALU-02, ALU-13, CA-02, CA-43; flujos.md F-03).
// react-hook-form + zod (esquema de `logica/`, límites de SEC-09); el servidor repite toda la validación.
// - Con Google, nombre y mail vienen cargados; el mail no se edita.
// - Errores por campo asociados al campo; al enviar con errores el foco va al primero.
// - «Cómo llegaste» solo se pregunta con un profesor de origen (el del enlace por el que llegó, ALU-14,
//   DEC-33): se pide a ese profesor y va en su vínculo. Sin enlace, la ficha no lo pregunta ni crea vínculo.
// - Si el tope de fichas por hora (ALU-13) está superado, se muestra el mensaje de «intentá más tarde» y la
//   cuenta sigue con la ficha incompleta.
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { Alerta, Boton, Campo, CampoFecha } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import { CAMPOS_FICHA, crearEsquemaFicha, type CampoFicha, type FichaEntrada, type ResultadoFicha } from '../logica';
import estilos from './FichaForm.module.css';

export type FichaFormProps = {
  /** Nombre que ya se conoce (el de Google) y mail de la cuenta; el mail no se edita. */
  precargado: { nombre: string | null; mail: string | null };
  /** Hoy en el huso del profesor: la fecha de nacimiento no puede ser posterior. */
  hoy: Dia;
  /** Profesor del enlace por el que llegó (activo): se le pregunta «cómo llegaste». `null`: no se pregunta. */
  profesorOrigen?: { nombre: string } | null;
  /** `completar_ficha` (logica/). Con `ok`, la guarda suelta la ficha y la vista cambia sola. */
  onGuardar: (datos: FichaEntrada) => Promise<ResultadoFicha>;
};

const ETIQUETAS = {
  nombre: 'Nombre y apellido',
  telefono: 'Teléfono o WhatsApp',
  fecha_nacimiento: 'Fecha de nacimiento',
} as const;

/** Texto como pregunta del campo; el nombre del profesor es texto (SEC-16). */
export const etiquetaComoLlegaste = (nombre: string) => `Cómo llegaste a ${nombre}`;

export function FichaForm({ precargado, hoy, profesorOrigen = null, onGuardar }: FichaFormProps) {
  const idBase = useId();
  const idDe = (campo: CampoFicha | 'mail') => `${idBase}-${campo}`;
  const conComoLlego = profesorOrigen !== null;
  const esquema = useMemo(() => crearEsquemaFicha(hoy, conComoLlego), [hoy, conComoLlego]);
  const [errorGeneral, setErrorGeneral] = useState('');
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FichaEntrada>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: precargado.nombre ?? '', telefono: '', fecha_nacimiento: '', como_llego: '' },
  });

  const enfocarCampo = (campo: CampoFicha) => document.getElementById(idDe(campo))?.focus();

  const alEnviar = async (datos: FichaEntrada) => {
    setErrorGeneral('');
    const resultado = await onGuardar(datos);
    if (resultado.ok) return;
    if (resultado.campo !== null) {
      setError(resultado.campo, { type: 'servidor', message: resultado.mensaje });
      enfocarCampo(resultado.campo);
    } else {
      setErrorGeneral(resultado.mensaje);
    }
  };

  // A11Y-21: con errores, el foco va al primer campo con error (en el orden del formulario).
  const alInvalido = (invalidos: FieldErrors<FichaEntrada>) => {
    setErrorGeneral('');
    const primero = CAMPOS_FICHA.find((campo) => invalidos[campo] !== undefined);
    if (primero) enfocarCampo(primero);
  };

  const mensajeDe = (campo: CampoFicha) => errors[campo]?.message ?? '';

  return (
    <form className={estilos.ficha} onSubmit={(e) => void handleSubmit(alEnviar, alInvalido)(e)} noValidate>
      <p className={estilos.intro}>
        Completá tus datos para pedir clases. Mientras no termines la ficha solo podés ver esta pantalla.
      </p>
      {profesorOrigen ? (
        <p className={estilos.intro}>Al guardarla le pedimos acceso a {profesorOrigen.nombre}.</p>
      ) : null}
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}
      <Controller
        name="nombre"
        control={control}
        render={({ field }) => (
          <Campo
            id={idDe('nombre')}
            name="nombre"
            etiqueta={ETIQUETAS.nombre}
            requerido
            autoComplete="name"
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('nombre')}
          />
        )}
      />
      {precargado.mail ? (
        <Campo
          id={idDe('mail')}
          name="mail"
          etiqueta="Mail"
          tipo="email"
          deshabilitado
          valor={precargado.mail}
          onCambio={() => undefined}
          ayuda="Es el mail con el que ingresaste; no se puede cambiar."
        />
      ) : null}
      <Controller
        name="telefono"
        control={control}
        render={({ field }) => (
          <Campo
            id={idDe('telefono')}
            name="telefono"
            etiqueta={ETIQUETAS.telefono}
            tipo="tel"
            requerido
            autoComplete="tel"
            inputMode="tel"
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('telefono')}
          />
        )}
      />
      <Controller
        name="fecha_nacimiento"
        control={control}
        render={({ field }) => (
          <CampoFecha
            id={idDe('fecha_nacimiento')}
            name="fecha_nacimiento"
            etiqueta={ETIQUETAS.fecha_nacimiento}
            requerido
            autoComplete="bday"
            max={hoy}
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('fecha_nacimiento')}
          />
        )}
      />
      {profesorOrigen ? (
        <Controller
          name="como_llego"
          control={control}
          render={({ field }) => (
            <Campo
              id={idDe('como_llego')}
              name="como_llego"
              etiqueta={etiquetaComoLlegaste(profesorOrigen.nombre)}
              requerido
              ayuda="Por ejemplo: «me recomendó una amiga» o «te vi en Instagram». Se lo mostramos a ese profesor."
              valor={field.value}
              onCambio={field.onChange}
              error={mensajeDe('como_llego')}
            />
          )}
        />
      ) : null}
      <Boton type="submit" cargando={isSubmitting} textoCargando="Guardando…">
        Guardar ficha
      </Boton>
    </form>
  );
}
