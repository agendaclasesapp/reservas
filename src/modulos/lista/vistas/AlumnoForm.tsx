// Alta y edición de un alumno por el profesor (WEB-07, ALU-07, ALU-08, ALU-09, CA-06; componentes-profesor.md C-68).
// react-hook-form + zod (esquema de `logica/`, límites de SEC-09); el servidor repite toda la validación.
// - Con mail: cuenta aprobada. Sin mail: alumno sin cuenta, que no ingresa ni recibe mails (aviso visible).
// - En una cuenta que ya ingresó el mail es su identidad y no se edita.
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import type { Dia } from '../../../lib/fechas';
import { Alerta, Boton, Campo, CampoFecha, Dialogo } from '../../../ui';
import { crearEsquemaAlumno, valoresInicialesAlumno, type AlumnoEntrada, type AlumnoLista } from '../logica';
import type { ResultadoGuardado } from './formato';
import estilos from './AlumnoForm.module.css';

type CampoForm = 'nombre' | 'telefono' | 'fecha_nacimiento' | 'mail';
const CAMPOS: readonly CampoForm[] = ['nombre', 'telefono', 'fecha_nacimiento', 'mail'];

export const AVISO_SIN_MAIL = 'No podrá ingresar ni recibirá mails.';
export const AVISO_CON_MAIL = 'Se crea una cuenta aprobada: la persona ingresa con Google o con código usando este mail.';

export type AlumnoFormProps = {
  /** `null`: alta. Con un alumno: edición de su ficha. */
  alumno: AlumnoLista | null;
  /** Hoy en el huso del profesor: la fecha de nacimiento no puede ser posterior. */
  hoy: Dia;
  /** `alta_alumno` o `editar_alumno`. Con `ok` el padre cierra el diálogo. */
  onGuardar: (datos: AlumnoEntrada) => Promise<ResultadoGuardado>;
};

export function AlumnoForm({ alumno, hoy, onGuardar }: AlumnoFormProps) {
  const idBase = useId();
  const idDe = (campo: CampoForm) => `${idBase}-${campo}`;
  const esquema = useMemo(() => crearEsquemaAlumno(hoy), [hoy]);
  const [errorGeneral, setErrorGeneral] = useState('');
  const mailFijo = alumno !== null && alumno.con_usuario;
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AlumnoEntrada>({ resolver: zodResolver(esquema), defaultValues: valoresInicialesAlumno(alumno) });
  const mailEscrito = useWatch({ control, name: 'mail' });

  const enfocar = (campo: CampoForm) => document.getElementById(idDe(campo))?.focus();

  const alEnviar = async (datos: AlumnoEntrada) => {
    setErrorGeneral('');
    const resultado = await onGuardar(datos);
    if (resultado.ok) return;
    if (resultado.campo !== null && resultado.campo !== 'motivo') {
      setError(resultado.campo, { type: 'servidor', message: resultado.mensaje });
      enfocar(resultado.campo);
    } else if (resultado.codigo === 'MAIL_YA_REGISTRADO') {
      setError('mail', { type: 'servidor', message: resultado.mensaje });
      enfocar('mail');
    } else {
      setErrorGeneral(resultado.mensaje);
    }
  };

  // A11Y-21: con errores, el foco va al primer campo con error (en el orden del formulario).
  const alInvalido = (invalidos: FieldErrors<AlumnoEntrada>) => {
    setErrorGeneral('');
    const primero = CAMPOS.find((campo) => invalidos[campo] !== undefined);
    if (primero) enfocar(primero);
  };

  const mensajeDe = (campo: CampoForm) => errors[campo]?.message ?? '';
  const sinMail = (mailEscrito ?? '').trim() === '';

  return (
    <form className={estilos.form} onSubmit={(e) => void handleSubmit(alEnviar, alInvalido)(e)} noValidate>
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}
      <Controller
        name="nombre"
        control={control}
        render={({ field }) => (
          <Campo
            id={idDe('nombre')}
            name="nombre"
            etiqueta="Nombre y apellido"
            requerido
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('nombre')}
          />
        )}
      />
      <Controller
        name="telefono"
        control={control}
        render={({ field }) => (
          <Campo
            id={idDe('telefono')}
            name="telefono"
            etiqueta="Teléfono o WhatsApp"
            tipo="tel"
            requerido
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
            etiqueta="Fecha de nacimiento"
            requerido
            max={hoy}
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('fecha_nacimiento')}
          />
        )}
      />
      <Controller
        name="mail"
        control={control}
        render={({ field }) => (
          <Campo
            id={idDe('mail')}
            name="mail"
            etiqueta="Mail (opcional)"
            tipo="email"
            inputMode="email"
            deshabilitado={mailFijo}
            ayuda={mailFijo ? 'Es el mail con el que ingresa; no se puede cambiar.' : 'Dejalo vacío si no tiene mail.'}
            valor={field.value}
            onCambio={field.onChange}
            error={mensajeDe('mail')}
          />
        )}
      />
      {mailFijo ? null : (
        <Alerta tipo={sinMail ? 'aviso' : 'info'}>{sinMail ? AVISO_SIN_MAIL : AVISO_CON_MAIL}</Alerta>
      )}
      <Boton type="submit" cargando={isSubmitting} textoCargando="Guardando…">
        {alumno === null ? 'Agregar alumno' : 'Guardar cambios'}
      </Boton>
    </form>
  );
}

export type AlumnoDialogoProps = AlumnoFormProps & { onCerrar: () => void };

/** Diálogo con el formulario; «Cancelar» cierra sin guardar. El padre lo monta solo mientras está abierto. */
export function AlumnoDialogo({ alumno, hoy, onGuardar, onCerrar }: AlumnoDialogoProps) {
  return (
    <Dialogo
      abierto
      titulo={alumno === null ? 'Agregar alumno' : 'Editar alumno'}
      onCerrar={onCerrar}
      textoCerrar="Cancelar"
    >
      <AlumnoForm alumno={alumno} hoy={hoy} onGuardar={onGuardar} />
    </Dialogo>
  );
}
