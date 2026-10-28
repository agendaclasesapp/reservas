// Alta de un profesor (WEB-10, ADM-02, DEC-31, DEC-34, SEC-09): mail, nombre y enlace, con el error de cada
// validación en su campo (formato, reservado, repetido, mail ya registrado) y el aviso de que el nombre es público
// y el mail lo ven sus alumnos. La validación del cliente es comodidad: la base valida igual (422 y 409).
import { useId, useState, type FormEvent } from 'react';
import { Alerta, Boton, Campo } from '../../../ui';
import {
  LARGO_MAX_SLUG,
  LARGO_MIN_SLUG,
  MENSAJES_ADMIN,
  normalizarSlug,
  validarAltaProfesor,
  type CampoAdmin,
  type ProfesorEntrada,
  type ResultadoAltaProfesor,
} from '../logica';
import estilos from './AltaProfesorForm.module.css';

export type AltaProfesorFormProps = {
  /** `useAltaProfesor().enviar`: devuelve un resultado, no lanza. */
  onAlta: (datos: ProfesorEntrada) => Promise<ResultadoAltaProfesor>;
  /** `useAltaProfesor().enviando`. */
  enviando: boolean;
  /** Se llama con el alta hecha, para que la página recargue la lista. */
  onAltaHecha: () => void;
};

type CamposDelForm = Extract<CampoAdmin, 'mail' | 'nombre' | 'slug'>;
type Errores = Partial<Record<CamposDelForm, string>>;
type Aviso = { tipo: 'exito' | 'error'; texto: string };

export const TEXTO_ALTA_HECHA = 'Profesor dado de alta. Ya puede entrar con ese mail y se le avisa por mail con su enlace.';

function esCampoDelForm(campo: CampoAdmin | null): campo is CamposDelForm {
  return campo === 'mail' || campo === 'nombre' || campo === 'slug';
}

export function AltaProfesorForm({ onAlta, enviando, onAltaHecha }: AltaProfesorFormProps) {
  const idBase = useId();
  const id = (campo: CamposDelForm) => `${idBase}-${campo}`;
  const [mail, setMail] = useState('');
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const marcar = (campo: CamposDelForm, mensaje: string) => {
    setErrores({ [campo]: mensaje });
    document.getElementById(id(campo))?.focus();
  };

  const enviar = async () => {
    if (enviando) return;
    setAviso(null);
    const datos: ProfesorEntrada = { mail: mail.trim(), nombre: nombre.trim(), slug: normalizarSlug(slug) };
    setSlug(datos.slug);
    const invalido = validarAltaProfesor(datos);
    if (invalido) {
      if (esCampoDelForm(invalido.campo)) marcar(invalido.campo, invalido.mensaje);
      return;
    }
    setErrores({});
    const resultado = await onAlta(datos);
    if (resultado.ok) {
      setMail('');
      setNombre('');
      setSlug('');
      setAviso({ tipo: 'exito', texto: resultado.adoptado ? MENSAJES_ADMIN.adoptado : TEXTO_ALTA_HECHA });
      onAltaHecha();
      return;
    }
    if (esCampoDelForm(resultado.campo)) marcar(resultado.campo, resultado.mensaje);
    else setAviso({ tipo: 'error', texto: resultado.mensaje });
  };

  const alEnviar = (evento: FormEvent) => {
    evento.preventDefault();
    void enviar();
  };

  return (
    <section aria-labelledby={`${idBase}-titulo`} className={estilos.seccion}>
      <h2 id={`${idBase}-titulo`} className={estilos.titulo}>
        Dar de alta a un profesor
      </h2>
      <Alerta tipo="info">{MENSAJES_ADMIN.avisoDatosPublicos}</Alerta>
      <form onSubmit={alEnviar} noValidate className={estilos.form}>
        <Campo
          id={id('mail')}
          name="mail"
          etiqueta="Mail del profesor"
          tipo="email"
          inputMode="email"
          autoComplete="off"
          requerido
          valor={mail}
          onCambio={setMail}
          error={errores.mail}
        />
        <Campo
          id={id('nombre')}
          name="nombre"
          etiqueta="Nombre del profesor"
          autoComplete="off"
          requerido
          valor={nombre}
          onCambio={setNombre}
          error={errores.nombre}
        />
        <Campo
          id={id('slug')}
          name="enlace"
          etiqueta="Enlace del profesor"
          ayuda={`Es el final de su dirección, después de #/p/. De ${LARGO_MIN_SLUG} a ${LARGO_MAX_SLUG} caracteres: minúsculas, números y guiones.`}
          autoComplete="off"
          requerido
          valor={slug}
          onCambio={setSlug}
          error={errores.slug}
        />
        <div className={estilos.acciones}>
          <Boton type="submit" cargando={enviando} textoCargando="Dando de alta…">
            Dar de alta
          </Boton>
        </div>
      </form>
      {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}
    </section>
  );
}
