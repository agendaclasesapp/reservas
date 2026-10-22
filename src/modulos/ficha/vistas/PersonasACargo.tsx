// Personas a cargo del titular (WEB-03, ALU-06, CA-05; flujos.md F-04): lista con nombre y fecha de
// nacimiento, alta y edición en un diálogo. Estados: cargando, error con «Reintentar», vacío y lista.
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { Alerta, Boton, Campo, CampoFecha, Cargando, Dialogo, ErrorCarga, Vacio } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import {
  crearEsquemaPersona,
  type EstadoPersonas,
  type PersonaACargo,
  type PersonaEntrada,
  type ResultadoPersona,
} from '../logica';
import { formatearNacimiento } from './formato';
import estilos from './PersonasACargo.module.css';

export type PersonasACargoProps = {
  estado: EstadoPersonas;
  /** Hoy en el huso del profesor: la fecha de nacimiento no puede ser posterior. */
  hoy: Dia;
  /** `guardar_persona_a_cargo` (logica/): `id: null` da de alta; con id, edita. */
  onGuardar: (persona: PersonaEntrada) => Promise<ResultadoPersona>;
  /** Se llama después de guardar, para volver a leer la lista. */
  onGuardada: () => void;
  onReintentar: () => void;
};

type FormularioPersona = { nombre: string; fecha_nacimiento: string };

type Edicion = { tipo: 'cerrado' } | { tipo: 'alta' } | { tipo: 'edicion'; persona: PersonaACargo };

type FormularioProps = {
  persona: PersonaACargo | null;
  hoy: Dia;
  onGuardar: PersonasACargoProps['onGuardar'];
  onGuardada: () => void;
};

function FormularioDePersona({ persona, hoy, onGuardar, onGuardada }: FormularioProps) {
  const idBase = useId();
  const idNombre = `${idBase}-nombre`;
  const idFecha = `${idBase}-fecha`;
  const esquema = useMemo(() => crearEsquemaPersona(hoy), [hoy]);
  const [errorGeneral, setErrorGeneral] = useState('');
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioPersona>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: persona?.nombre ?? '', fecha_nacimiento: persona?.fecha_nacimiento ?? '' },
  });

  const enfocar = (id: string) => document.getElementById(id)?.focus();

  const alEnviar = async (datos: FormularioPersona) => {
    setErrorGeneral('');
    const resultado = await onGuardar({ id: persona?.id ?? null, ...datos });
    if (resultado.ok) {
      onGuardada();
      return;
    }
    if (resultado.campo === 'nombre' || resultado.campo === 'fecha_nacimiento') {
      setError(resultado.campo, { type: 'servidor', message: resultado.mensaje });
      enfocar(resultado.campo === 'nombre' ? idNombre : idFecha);
    } else {
      setErrorGeneral(resultado.mensaje);
    }
  };

  const alInvalido = (invalidos: FieldErrors<FormularioPersona>) => {
    setErrorGeneral('');
    enfocar(invalidos.nombre ? idNombre : idFecha);
  };

  return (
    <form className={estilos.formulario} onSubmit={(e) => void handleSubmit(alEnviar, alInvalido)(e)} noValidate>
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}
      <Controller
        name="nombre"
        control={control}
        render={({ field }) => (
          <Campo
            id={idNombre}
            name="nombre"
            etiqueta="Nombre y apellido"
            requerido
            valor={field.value}
            onCambio={field.onChange}
            error={errors.nombre?.message ?? ''}
          />
        )}
      />
      <Controller
        name="fecha_nacimiento"
        control={control}
        render={({ field }) => (
          <CampoFecha
            id={idFecha}
            name="fecha_nacimiento"
            etiqueta="Fecha de nacimiento"
            requerido
            max={hoy}
            valor={field.value}
            onCambio={field.onChange}
            error={errors.fecha_nacimiento?.message ?? ''}
          />
        )}
      />
      <Boton type="submit" cargando={isSubmitting} textoCargando="Guardando…">
        Guardar
      </Boton>
    </form>
  );
}

export function PersonasACargo({ estado, hoy, onGuardar, onGuardada, onReintentar }: PersonasACargoProps) {
  const [edicion, setEdicion] = useState<Edicion>({ tipo: 'cerrado' });
  const [guardada, setGuardada] = useState(false);

  const cerrar = () => setEdicion({ tipo: 'cerrado' });
  const alGuardar = () => {
    cerrar();
    setGuardada(true);
    onGuardada();
  };
  const abrirAlta = () => {
    setGuardada(false);
    setEdicion({ tipo: 'alta' });
  };

  const dialogo = (
    <Dialogo
      abierto={edicion.tipo !== 'cerrado'}
      titulo={edicion.tipo === 'edicion' ? 'Editar persona a cargo' : 'Agregar persona a cargo'}
      onCerrar={cerrar}
      textoCerrar="Cancelar"
    >
      {edicion.tipo === 'cerrado' ? null : (
        <FormularioDePersona
          persona={edicion.tipo === 'edicion' ? edicion.persona : null}
          hoy={hoy}
          onGuardar={onGuardar}
          onGuardada={alGuardar}
        />
      )}
    </Dialogo>
  );

  return (
    <section className={estilos.personas} aria-labelledby="ficha-personas-titulo">
      <h2 id="ficha-personas-titulo">Personas a cargo</h2>
      {guardada ? <Alerta tipo="exito">Persona guardada.</Alerta> : null}
      {estado.tipo === 'cargando' ? <Cargando etiqueta="Cargando las personas a cargo…" renglones={2} /> : null}
      {estado.tipo === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudieron cargar las personas a cargo. ${estado.mensaje}`}
          onReintentar={onReintentar}
        />
      ) : null}
      {estado.tipo === 'ok' && estado.personas.length === 0 ? (
        <Vacio
          nivel={3}
          titulo="Todavía no cargaste personas a cargo"
          texto="Si tomás clases por alguien más, por ejemplo un hijo o una hija, cargalo acá."
          accion={<Boton onClick={abrirAlta}>Agregar persona</Boton>}
        />
      ) : null}
      {estado.tipo === 'ok' && estado.personas.length > 0 ? (
        <>
          <ul className={estilos.lista}>
            {estado.personas.map((persona) => (
              <li key={persona.id} className={estilos.persona}>
                <div>
                  <p className={estilos.nombre}>{persona.nombre}</p>
                  <p className={estilos.nacimiento}>Nació el {formatearNacimiento(persona.fecha_nacimiento)}</p>
                </div>
                <Boton
                  variante="secundario"
                  aria-label={`Editar a ${persona.nombre}`}
                  onClick={() => {
                    setGuardada(false);
                    setEdicion({ tipo: 'edicion', persona });
                  }}
                >
                  Editar
                </Boton>
              </li>
            ))}
          </ul>
          <div>
            <Boton variante="secundario" onClick={abrirAlta}>
              Agregar persona
            </Boton>
          </div>
        </>
      ) : null}
      {dialogo}
    </section>
  );
}
