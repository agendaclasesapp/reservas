// Vista `#/lista` del profesor, parte de cuentas y alumnos (WEB-07, ALU-03..05, ALU-07..09, SEC-16; F-11 y F-13).
// Recibe los datos y las acciones por props: la página los conecta con `logica/` y las pruebas con datos fijos.
// Los errores se muestran con el mensaje del módulo de la lista (`FalloLista.mensaje`), no con el genérico.
// B14 (ADR-020): con el profesor inactivo (PRF-08) aprobar y dar de alta quedan deshabilitados con el aviso;
// una ficha que no es editable (DEC-32) se ve sin «Editar»; un alta con el mail de una persona existente la
// asocia sin tocar su ficha y lo dice (DEC-29 b).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dia } from '../../../lib/fechas';
import { Alerta, Cargando, ErrorCarga } from '../../../ui';
import {
  CUENTA_NO_PENDIENTE,
  MENSAJES_LISTA,
  permisosLista,
  separarPendientes,
  UNION_NO_VALIDA,
  type AlumnoEntrada,
  type AlumnoLista,
  type EstadoAlumnos,
  type ResultadoAlta,
  type ResultadoCuenta,
  type ResultadoEdicion,
  type ResultadoSugerencias,
  type ResultadoUnion,
  type Sugerencia,
} from '../logica';
import { AlumnoDialogo } from './AlumnoForm';
import { CuentasPendientes } from './CuentasPendientes';
import { nombreVisible } from './formato';
import { ListaAlumnos } from './ListaAlumnos';
import { RechazoDialogo } from './RechazoDialogo';
import { SugerenciaUnion, type FichaComparada, type OcupadoUnion } from './SugerenciaUnion';
import type { AccionCuenta } from './TarjetaCuenta';
import estilos from './VistaLista.module.css';

/** Operaciones de `logica/` que usa la vista (cada una devuelve un resultado, no lanza). */
export type AccionesLista = {
  aprobar: (alumnoId: string, motivo?: string | null) => Promise<ResultadoCuenta>;
  rechazar: (alumnoId: string, motivo?: string | null) => Promise<ResultadoCuenta>;
  sugerencias: (alumnoId: string) => Promise<ResultadoSugerencias>;
  unir: (cuentaId: string, sinCuentaId: string) => Promise<ResultadoUnion>;
  descartar: (cuentaId: string, sinCuentaId: string) => Promise<ResultadoUnion>;
  alta: (datos: AlumnoEntrada) => Promise<ResultadoAlta>;
  editar: (alumnoId: string, datos: AlumnoEntrada) => Promise<ResultadoEdicion>;
};

export type VistaListaProps = {
  datos: EstadoAlumnos;
  /** Hoy en el huso del profesor (acota la fecha de nacimiento del formulario). */
  hoy: Dia;
  /** Vuelve a leer `v_alumnos`; se llama después de cada operación. */
  onRecargar: () => void;
  /** `sesion.profesor.activo`: inactivo, no aprueba accesos ni da de alta alumnos (PRF-08). Por defecto, activo. */
  profesorActivo?: boolean;
  acciones: AccionesLista;
};

type Aviso = { tipo: 'exito' | 'info' | 'error'; texto: string };
type EstadoUnion = {
  cuenta: AlumnoLista;
  sugerencias: Sugerencia[];
  ocupado: OcupadoUnion;
  error: string;
};
type FormAlumno = { alumno: AlumnoLista | null };

function ficha(alumno: AlumnoLista): FichaComparada {
  return {
    id: alumno.id,
    nombre: alumno.nombre,
    telefono: alumno.telefono,
    mail: alumno.mail,
    fecha_nacimiento: alumno.fecha_nacimiento,
    edad: alumno.edad,
  };
}

export function VistaLista({ datos, hoy, onRecargar, profesorActivo = true, acciones }: VistaListaProps) {
  const permisos = permisosLista(profesorActivo);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupada, setOcupada] = useState<{ id: string; accion: AccionCuenta } | null>(null);
  const [buscandoId, setBuscandoId] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [rechazo, setRechazo] = useState<AlumnoLista | null>(null);
  const [union, setUnion] = useState<EstadoUnion | null>(null);
  const [formAlumno, setFormAlumno] = useState<FormAlumno | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  // El aviso nuevo recibe el foco: la tarjeta o el diálogo que lo originó puede haber desaparecido.
  useEffect(() => {
    if (aviso !== null) avisoRef.current?.focus();
  }, [aviso]);

  const { pendientes } = useMemo(() => separarPendientes(datos.alumnos), [datos.alumnos]);

  const aprobar = async (cuenta: AlumnoLista) => {
    const nombre = nombreVisible(cuenta.nombre);
    setAviso(null);
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== cuenta.id)));
    setOcupada({ id: cuenta.id, accion: 'aprobando' });
    const r = await acciones.aprobar(cuenta.id, null);
    setOcupada(null);
    if (!r.ok) {
      if (r.codigo === CUENTA_NO_PENDIENTE) onRecargar();
      if (cuenta.estado === 'pendiente') setErrores((previos) => ({ ...previos, [cuenta.id]: r.mensaje }));
      else setAviso({ tipo: 'error', texto: r.mensaje });
      return;
    }
    onRecargar();
    setAviso({ tipo: 'exito', texto: `Aprobaste la cuenta de ${nombre}. Se le enviará un mail.` });
    if (r.sugerencias.length > 0) setUnion({ cuenta, sugerencias: r.sugerencias, ocupado: null, error: '' });
  };

  const rechazar = async (motivo: string) => {
    if (rechazo === null) return { ok: false as const, mensaje: '', campo: null, codigo: 'DESCONOCIDO' };
    const r = await acciones.rechazar(rechazo.id, motivo);
    if (!r.ok) {
      if (r.codigo === CUENTA_NO_PENDIENTE) onRecargar();
      return r;
    }
    onRecargar();
    setRechazo(null);
    setAviso({ tipo: 'exito', texto: `Rechazaste la cuenta de ${nombreVisible(rechazo.nombre)}. Se le enviará un mail.` });
    return r;
  };

  const revisarUnion = async (alumno: AlumnoLista) => {
    setAviso(null);
    setBuscandoId(alumno.id);
    const r = await acciones.sugerencias(alumno.id);
    setBuscandoId(null);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.mensaje });
    } else if (r.sugerencias.length === 0) {
      setAviso({
        tipo: 'info',
        texto: `No hay alumnos sin cuenta con el mismo teléfono que ${nombreVisible(alumno.nombre)}.`,
      });
    } else {
      setUnion({ cuenta: alumno, sugerencias: r.sugerencias, ocupado: null, error: '' });
    }
  };

  const unir = async (candidato: FichaComparada) => {
    if (union === null) return;
    const { cuenta } = union;
    setUnion({ ...union, ocupado: { id: candidato.id, accion: 'unir' }, error: '' });
    const r = await acciones.unir(cuenta.id, candidato.id);
    if (!r.ok) {
      if (r.codigo === UNION_NO_VALIDA) onRecargar();
      setUnion((actual) => (actual === null ? null : { ...actual, ocupado: null, error: r.mensaje }));
      return;
    }
    onRecargar();
    setUnion(null);
    setAviso({
      tipo: 'exito',
      texto: `Uniste a ${nombreVisible(candidato.nombre)} con la cuenta de ${nombreVisible(cuenta.nombre)}.`,
    });
  };

  const descartar = async (candidato: FichaComparada) => {
    if (union === null) return;
    const { cuenta } = union;
    setUnion({ ...union, ocupado: { id: candidato.id, accion: 'descartar' }, error: '' });
    const r = await acciones.descartar(cuenta.id, candidato.id);
    if (!r.ok) {
      setUnion((actual) => (actual === null ? null : { ...actual, ocupado: null, error: r.mensaje }));
      return;
    }
    const quedan = union.sugerencias.filter((s) => s.sin_cuenta_id !== candidato.id);
    setUnion(quedan.length === 0 ? null : { ...union, sugerencias: quedan, ocupado: null, error: '' });
    setAviso({ tipo: 'info', texto: `No se unió a ${nombreVisible(candidato.nombre)}. No se vuelve a sugerir.` });
  };

  const guardarAlumno = async (datos: AlumnoEntrada) => {
    if (formAlumno === null) return { ok: false as const, mensaje: '', campo: null, codigo: 'DESCONOCIDO' };
    const nombre = datos.nombre.trim();
    if (formAlumno.alumno === null) {
      const r = await acciones.alta(datos);
      if (!r.ok) return r;
      setAviso(
        r.asociado
          ? { tipo: 'info', texto: MENSAJES_LISTA.altaAsociada }
          : {
              tipo: 'exito',
              texto:
                r.estado === 'aprobado'
                  ? `Agregaste a ${nombre}: cuenta aprobada.`
                  : `Agregaste a ${nombre} como alumno sin cuenta: no podrá ingresar ni recibirá mails.`,
            },
      );
    } else {
      const r = await acciones.editar(formAlumno.alumno.id, datos);
      if (!r.ok) return r;
      setAviso({ tipo: 'exito', texto: `Guardaste los cambios de ${nombre}.` });
    }
    setFormAlumno(null);
    onRecargar();
    return { ok: true as const };
  };

  const candidatos: FichaComparada[] =
    union === null
      ? []
      : union.sugerencias.map((s) => {
          const completo = datos.alumnos.find((a) => a.id === s.sin_cuenta_id);
          return completo
            ? ficha(completo)
            : { id: s.sin_cuenta_id, nombre: s.nombre, telefono: s.telefono, mail: null, fecha_nacimiento: null, edad: null };
        });

  const cargandoPorPrimeraVez = datos.estado === 'cargando' && datos.alumnos.length === 0;
  const hayLista = datos.estado === 'listo' || datos.alumnos.length > 0;

  return (
    <div className={estilos.pagina}>
      <h1 className={estilos.titulo}>Lista</h1>
      {profesorActivo ? null : <Alerta tipo="aviso">{MENSAJES_LISTA.profesorInactivo}</Alerta>}
      {aviso ? (
        <div ref={avisoRef} tabIndex={-1} className={estilos.aviso}>
          <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta>
        </div>
      ) : null}
      {cargandoPorPrimeraVez ? <Cargando etiqueta="Cargando la lista de alumnos…" renglones={4} /> : null}
      {datos.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudo cargar la lista de alumnos. ${datos.error ?? ''}`.trim()}
          onReintentar={onRecargar}
        />
      ) : null}
      {hayLista ? (
        <>
          <CuentasPendientes
            cuentas={pendientes}
            ocupada={ocupada}
            errores={errores}
            puedeAprobar={permisos.aprobar}
            onAprobar={(cuenta) => void aprobar(cuenta)}
            onRechazar={setRechazo}
          />
          <ListaAlumnos
            alumnos={datos.alumnos}
            puedeAprobar={permisos.aprobar}
            puedeAgregar={permisos.alta}
            ocupadoId={ocupada?.id ?? buscandoId}
            onAgregar={() => setFormAlumno({ alumno: null })}
            onEditar={(alumno) => setFormAlumno({ alumno })}
            onAprobar={(alumno) => void aprobar(alumno)}
            onRevisarUnion={(alumno) => void revisarUnion(alumno)}
          />
        </>
      ) : null}
      {rechazo ? (
        <RechazoDialogo nombre={nombreVisible(rechazo.nombre)} onEnviar={rechazar} onCerrar={() => setRechazo(null)} />
      ) : null}
      {union && candidatos.length > 0 ? (
        <SugerenciaUnion
          cuenta={ficha(union.cuenta)}
          candidatos={candidatos}
          ocupado={union.ocupado}
          error={union.error}
          onUnir={(c) => void unir(c)}
          onDescartar={(c) => void descartar(c)}
          onCerrar={() => setUnion(null)}
        />
      ) : null}
      {formAlumno ? (
        <AlumnoDialogo
          alumno={formAlumno.alumno}
          hoy={hoy}
          onGuardar={guardarAlumno}
          onCerrar={() => setFormAlumno(null)}
        />
      ) : null}
    </div>
  );
}
