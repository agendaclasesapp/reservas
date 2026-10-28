// «Pedir acceso» (ALU-14, DEC-33) en la agenda `#/p/<slug>`: una persona con la ficha completa y sin vínculo con
// ese profesor le cuenta cómo llegó y el vínculo nace pendiente (`pedir_inscripcion`). La ruta lo compone en la
// agenda (agenda no importa de ficha) y lo descarga diferido: default export con la prop `slug`. El nombre del
// profesor sale de `config_publica(slug)`, que la agenda ya cargó (caché por slug), y se muestra como texto.
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alerta, Boton, Campo } from '../../../ui';
import { useConfigPublica, type ObtenerConfig } from '../../agenda/logica';
import { crearEsquemaPedirAcceso, pedirInscripcion, type PedirAccesoEntrada, type ResultadoPedido } from '../logica';
import estilos from './PedirAcceso.module.css';

export type PedirAccesoProps = {
  slug: string;
  /** Solo para pruebas. */
  pedir?: (slug: string, entrada: PedirAccesoEntrada) => Promise<ResultadoPedido>;
  /** Solo para pruebas (referencia estable). */
  obtenerConfig?: ObtenerConfig;
};

export default function PedirAcceso({ slug, pedir = pedirInscripcion, obtenerConfig }: PedirAccesoProps) {
  const idBase = useId();
  const idCampo = `${idBase}-como-llego`;
  const configuracion = useConfigPublica(slug, obtenerConfig);
  const esquema = useMemo(() => crearEsquemaPedirAcceso(), []);
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviado, setEnviado] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PedirAccesoEntrada>({ resolver: zodResolver(esquema), defaultValues: { como_llego: '' } });

  const nombre = configuracion.config?.activo === true ? configuracion.config.nombre : null;
  if (nombre === null) return null;

  const enfocar = () => document.getElementById(idCampo)?.focus();

  const alEnviar = async (datos: PedirAccesoEntrada) => {
    setErrorGeneral('');
    const resultado = await pedir(slug, datos);
    if (resultado.ok) {
      setEnviado(true);
      return;
    }
    if (resultado.campo === 'como_llego') {
      setError('como_llego', { type: 'servidor', message: resultado.mensaje });
      enfocar();
    } else {
      setErrorGeneral(resultado.mensaje);
    }
  };

  if (enviado) {
    return (
      <Alerta tipo="exito" titulo="Pedido enviado">
        Pediste acceso a {nombre}. Cuando lo apruebe vas a poder pedirle clases.
      </Alerta>
    );
  }

  return (
    <section aria-labelledby={`${idBase}-titulo`} className={estilos.pedir}>
      <h2 id={`${idBase}-titulo`}>Pedir acceso a {nombre}</h2>
      <p className={estilos.texto}>
        Todavía no tenés acceso con {nombre}. Contale cómo llegaste y esperá a que lo apruebe para poder pedirle
        clases.
      </p>
      <form className={estilos.form} onSubmit={(e) => void handleSubmit(alEnviar, enfocar)(e)} noValidate>
        {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}
        <Controller
          name="como_llego"
          control={control}
          render={({ field }) => (
            <Campo
              id={idCampo}
              name="como_llego"
              etiqueta={`Cómo llegaste a ${nombre}`}
              requerido
              ayuda="Por ejemplo: «me recomendó una amiga» o «te vi en Instagram»."
              valor={field.value}
              onCambio={field.onChange}
              error={errors.como_llego?.message ?? ''}
            />
          )}
        />
        <Boton type="submit" cargando={isSubmitting} textoCargando="Enviando…">
          Pedir acceso
        </Boton>
      </form>
    </section>
  );
}
