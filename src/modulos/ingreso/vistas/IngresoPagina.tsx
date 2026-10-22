// Pantalla de ingreso (WEB-02, ALU-01, CA-01, CA-44, H-021; flujos.md F-02). Presentación pura: recibe las
// operaciones de `logica/` por props y no conoce supabase-js.
// - «Continuar con Google»: sin desafío CAPTCHA.
// - «Entrar con un código por mail»: mail, desafío de Turnstile (cargado recién al elegir esta opción), código de
//   6 dígitos. Sin desafío resuelto no se pide el código. El token es de un solo uso: se descarta y el widget se
//   reinicia después de cada pedido que lo usó y en el reenvío.
// - Errores del código: incorrecto, vencido y «esperá un minuto para pedir otro» (H-021), con el texto de `logica/`.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Alerta, Boton, Campo } from '../../../ui';
import { MENSAJES_PEDIDO, normalizarMail } from '../logica';
import type { ErrorGoogle, ErrorPedido, ErrorVerificacion, Resultado } from '../logica';
import { DesafioTurnstile, type CargadorTurnstile } from './DesafioTurnstile';
import estilos from './IngresoPagina.module.css';

export type IngresoPaginaProps = {
  /** Clave pública de Turnstile (`VITE_TURNSTILE_SITEKEY`); vacía o ausente: el ingreso por código no está disponible. */
  sitekey: string | null | undefined;
  /** Error de la vuelta de Google (SEC-17: texto fijo), si lo hubo. */
  errorGoogle?: string | null;
  /** Sale hacia Google; si vuelve `ok`, el navegador ya está cambiando de página. */
  onGoogle: () => Promise<Resultado<ErrorGoogle>>;
  onPedirCodigo: (entrada: { mail: string; captchaToken: string | null }) => Promise<Resultado<ErrorPedido>>;
  onVerificarCodigo: (entrada: { mail: string; codigo: string }) => Promise<Resultado<ErrorVerificacion>>;
  /** Tras verificar el código: la página navega a la ruta de destino. */
  onIngreso: () => void;
  /** Milisegundos que faltan para poder pedir otro código (0 = ya se puede). */
  msParaReenviar: () => number;
  /** Solo para pruebas. */
  cargadorTurnstile?: CargadorTurnstile;
};

type Paso = { tipo: 'elegir' } | { tipo: 'mail' } | { tipo: 'codigo'; mail: string };
type Enviando = 'google' | 'pedido' | 'reenvio' | 'verificacion' | null;

export const MENSAJE_SIN_CAPTCHA_CONFIGURADO =
  'El ingreso por código no está disponible en este momento. Ingresá con Google o probá más tarde.';

function enfocar(id: string) {
  document.getElementById(id)?.focus();
}

export function IngresoPagina({
  sitekey,
  errorGoogle = null,
  onGoogle,
  onPedirCodigo,
  onVerificarCodigo,
  onIngreso,
  msParaReenviar,
  cargadorTurnstile,
}: IngresoPaginaProps) {
  const idMail = useId();
  const idCodigo = useId();
  const idTituloCodigo = useId();
  const idTituloReenvio = useId();

  const [paso, setPaso] = useState<Paso>({ tipo: 'elegir' });
  const [mail, setMail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [enviando, setEnviando] = useState<Enviando>(null);
  const [errorGoogleVisible, setErrorGoogleVisible] = useState<string | null>(errorGoogle);
  const [errorMail, setErrorMail] = useState('');
  const [errorPedido, setErrorPedido] = useState('');
  const [errorCodigo, setErrorCodigo] = useState('');
  const [reenviado, setReenviado] = useState(false);
  const [restanteMs, setRestanteMs] = useState(0);
  const enCodigo = paso.tipo === 'codigo';
  const pasoTipo = paso.tipo;
  const primerRender = useRef(true);

  // Cada paso nuevo lleva el foco a su primer campo.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (pasoTipo === 'mail') enfocar(idMail);
    if (pasoTipo === 'codigo') enfocar(idCodigo);
  }, [pasoTipo, idMail, idCodigo]);

  useEffect(() => {
    if (errorCodigo !== '') enfocar(idCodigo);
  }, [errorCodigo, idCodigo]);

  // Cuenta regresiva visible del reenvío (no es una región viva: no se anuncia cada segundo).
  useEffect(() => {
    if (!enCodigo) return;
    const actualizar = () => setRestanteMs(msParaReenviar());
    const intervalo = window.setInterval(actualizar, 1000);
    return () => window.clearInterval(intervalo);
  }, [enCodigo, msParaReenviar]);

  const descartarToken = () => {
    setToken(null);
    setReinicio((n) => n + 1);
  };

  const continuarConGoogle = async () => {
    if (enviando !== null) return;
    setErrorGoogleVisible(null);
    setEnviando('google');
    const resultado = await onGoogle();
    if (!resultado.ok) {
      setErrorGoogleVisible(resultado.mensaje);
      setEnviando(null);
    }
  };

  /** Pide el código (primer pedido o reenvío). Devuelve true si el código salió. */
  const pedir = async (destino: string, esReenvio: boolean): Promise<boolean> => {
    setErrorMail('');
    setErrorPedido('');
    if (normalizarMail(destino) === null) {
      setErrorMail(MENSAJES_PEDIDO.mail_invalido);
      enfocar(idMail);
      return false;
    }
    if (esReenvio && msParaReenviar() > 0) {
      setErrorPedido(MENSAJES_PEDIDO.esperar_reenvio);
      return false;
    }
    if (token === null) {
      // Sin desafío resuelto no se pide (CA-44): no se llama a la lógica.
      setErrorPedido(MENSAJES_PEDIDO.captcha_pendiente);
      return false;
    }
    setEnviando(esReenvio ? 'reenvio' : 'pedido');
    const resultado = await onPedirCodigo({ mail: destino, captchaToken: token });
    setEnviando(null);
    // El token se usó (con éxito o no): no se puede reutilizar.
    descartarToken();
    if (!resultado.ok) {
      if (resultado.error === 'mail_invalido') {
        setErrorMail(resultado.mensaje);
        enfocar(idMail);
      } else {
        setErrorPedido(resultado.mensaje);
      }
      return false;
    }
    setRestanteMs(msParaReenviar());
    return true;
  };

  const enviarMail = async (evento: FormEvent) => {
    evento.preventDefault();
    if (enviando !== null) return;
    if (await pedir(mail, false)) {
      setCodigo('');
      setErrorCodigo('');
      setReenviado(false);
      setPaso({ tipo: 'codigo', mail: mail.trim() });
    }
  };

  const reenviar = async () => {
    if (paso.tipo !== 'codigo' || enviando !== null) return;
    setReenviado(false);
    if (await pedir(paso.mail, true)) {
      setReenviado(true);
      setErrorCodigo('');
      setCodigo('');
      enfocar(idCodigo);
    }
  };

  const verificar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (paso.tipo !== 'codigo' || enviando !== null) return;
    setErrorCodigo('');
    setEnviando('verificacion');
    const resultado = await onVerificarCodigo({ mail: paso.mail, codigo });
    if (resultado.ok) {
      onIngreso();
      return;
    }
    setEnviando(null);
    setErrorCodigo(resultado.mensaje);
  };

  const cambiarMail = () => {
    setErrorPedido('');
    setReenviado(false);
    setToken(null);
    setPaso({ tipo: 'mail' });
  };

  const segundos = Math.ceil(restanteMs / 1000);

  return (
    <div className={estilos.pagina}>
      <h1>Ingresar</h1>
      <p className={estilos.intro}>
        Entrá con tu cuenta de Google o con un código de 6 dígitos que te mandamos por mail. No hace falta una
        contraseña.
      </p>

      <section className={estilos.opcion} aria-label="Ingresar con Google">
        {errorGoogleVisible ? (
          <Alerta
            tipo="error"
            accion={
              <Boton variante="secundario" onClick={() => void continuarConGoogle()}>
                Probar de nuevo
              </Boton>
            }
          >
            {errorGoogleVisible}
          </Alerta>
        ) : null}
        <Boton cargando={enviando === 'google'} textoCargando="Abriendo Google…" onClick={() => void continuarConGoogle()}>
          Continuar con Google
        </Boton>
      </section>

      {paso.tipo === 'elegir' ? (
        <div className={estilos.opcion}>
          <Boton variante="secundario" onClick={() => setPaso({ tipo: 'mail' })}>
            Entrar con un código por mail
          </Boton>
        </div>
      ) : null}

      {paso.tipo === 'mail' ? (
        <section className={estilos.opcion} aria-labelledby={idTituloCodigo}>
          <h2 id={idTituloCodigo}>Entrar con un código por mail</h2>
          {sitekey ? (
            <form className={estilos.formulario} onSubmit={(e) => void enviarMail(e)} noValidate>
              <Campo
                id={idMail}
                name="email"
                etiqueta="Mail"
                tipo="email"
                autoComplete="email"
                inputMode="email"
                requerido
                valor={mail}
                onCambio={setMail}
                error={errorMail}
                ayuda="Te mandamos un código de 6 dígitos a este mail."
              />
              <DesafioTurnstile sitekey={sitekey} onToken={setToken} reinicio={reinicio} cargador={cargadorTurnstile} />
              {errorPedido ? <Alerta tipo="error">{errorPedido}</Alerta> : null}
              <Boton type="submit" cargando={enviando === 'pedido'} textoCargando="Enviando…">
                Pedir código
              </Boton>
            </form>
          ) : (
            <Alerta tipo="error">{MENSAJE_SIN_CAPTCHA_CONFIGURADO}</Alerta>
          )}
        </section>
      ) : null}

      {paso.tipo === 'codigo' ? (
        <section className={estilos.opcion} aria-labelledby={idTituloCodigo}>
          <h2 id={idTituloCodigo}>Ingresá el código</h2>
          <p className={estilos.intro}>
            Te mandamos un código de 6 dígitos a <strong>{paso.mail}</strong>. Si no lo ves, revisá la carpeta de spam.
          </p>
          {reenviado ? <Alerta tipo="exito">Te mandamos un código nuevo. El anterior ya no sirve.</Alerta> : null}
          <form className={estilos.formulario} onSubmit={(e) => void verificar(e)} noValidate>
            <Campo
              id={idCodigo}
              name="codigo"
              etiqueta="Código de 6 dígitos"
              requerido
              valor={codigo}
              onCambio={setCodigo}
              autoComplete="one-time-code"
              inputMode="numeric"
              error={errorCodigo}
            />
            <Boton type="submit" cargando={enviando === 'verificacion'} textoCargando="Verificando…">
              Entrar
            </Boton>
          </form>
          <Boton variante="secundario" onClick={cambiarMail}>
            Usar otro mail
          </Boton>

          <section className={estilos.reenvio} aria-labelledby={idTituloReenvio}>
            <h3 id={idTituloReenvio}>¿No te llegó el código?</h3>
            <p className={estilos.intro}>
              {segundos > 0
                ? `Podés pedir otro código en ${segundos} s.`
                : 'Resolvé el desafío para pedir un código nuevo.'}
            </p>
            {sitekey ? (
              <DesafioTurnstile sitekey={sitekey} onToken={setToken} reinicio={reinicio} cargador={cargadorTurnstile} />
            ) : null}
            {errorPedido ? <Alerta tipo="error">{errorPedido}</Alerta> : null}
            <Boton variante="secundario" cargando={enviando === 'reenvio'} textoCargando="Enviando…" onClick={() => void reenviar()}>
              Pedir un código nuevo
            </Boton>
          </section>
        </section>
      ) : null}
    </div>
  );
}
