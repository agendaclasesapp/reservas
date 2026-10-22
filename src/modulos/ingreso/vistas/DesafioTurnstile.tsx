// Widget de Cloudflare Turnstile para pedir el código por mail (WEB-02, CA-44, ADR-016).
// - El script se carga solo cuando este componente se monta, es decir, al elegir «Entrar con un código por
//   mail»; «Continuar con Google» nunca lo carga. Sin dependencia npm nueva: se inserta un <script> y se usa
//   `window.turnstile` (la CSP de index.html ya admite https://challenges.cloudflare.com en script-src y frame-src).
// - El token es de un solo uso: la vista cambia `reinicio` después de cada pedido (salga bien o mal) y el widget
//   se reinicia y avisa `onToken(null)`. También avisa `null` si el token vence o el desafío falla.
import { useEffect, useId, useRef, useState } from 'react';
import { Cargando, ErrorCarga } from '../../../ui';
import estilos from './DesafioTurnstile.module.css';

export const URL_SCRIPT_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface OpcionesTurnstile {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
  theme: 'light';
  language: 'es';
  size: 'flexible';
}

/** Lo que la pantalla usa de la API global de Turnstile. */
export interface ApiTurnstile {
  render(contenedor: HTMLElement, opciones: OpcionesTurnstile): string;
  reset(idWidget: string): void;
  remove(idWidget: string): void;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

export type CargadorTurnstile = () => Promise<ApiTurnstile>;

let carga: Promise<ApiTurnstile> | null = null;

/** Inserta el script de Turnstile una sola vez; si falla, el próximo intento vuelve a pedirlo. */
export const cargarTurnstile: CargadorTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carga ??= new Promise<ApiTurnstile>((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = URL_SCRIPT_TURNSTILE;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolver(window.turnstile);
      else rechazar(new Error('Turnstile no quedó disponible.'));
    };
    script.onerror = () => {
      script.remove();
      rechazar(new Error('No se pudo cargar Turnstile.'));
    };
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    carga = null;
    throw e;
  });
  return carga;
};

type Fase = 'cargando' | 'listo' | 'sin_script' | 'fallo';

export type DesafioTurnstileProps = {
  /** Clave pública del sitio (`VITE_TURNSTILE_SITEKEY`). */
  sitekey: string;
  /** Token resuelto; `null` cuando vence, se reinicia o el desafío falla. */
  onToken: (token: string | null) => void;
  /** Contador: al cambiar, el widget se reinicia (el token es de un solo uso). */
  reinicio: number;
  /** Solo para pruebas. */
  cargador?: CargadorTurnstile;
};

export const MENSAJE_SIN_SCRIPT =
  'No pudimos cargar el desafío de seguridad. Revisá tu conexión y probá de nuevo.';
export const MENSAJE_FALLO_DESAFIO = 'El desafío de seguridad falló. Probá de nuevo.';

/** Desafío de seguridad: contenedor del widget con estados cargando, listo y error con «Reintentar». */
export function DesafioTurnstile({ sitekey, onToken, reinicio, cargador = cargarTurnstile }: DesafioTurnstileProps) {
  const idTitulo = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: ApiTurnstile; id: string } | null>(null);
  const reinicioAplicado = useRef(reinicio);
  const alToken = useRef(onToken);
  const [fase, setFase] = useState<Fase>('cargando');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    alToken.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const destino = contenedor.current;
    if (!destino) return;
    let vigente = true;
    cargador().then(
      (api) => {
        if (!vigente) return;
        const id = api.render(destino, {
          sitekey,
          callback: (token) => alToken.current(token),
          'expired-callback': () => alToken.current(null),
          'error-callback': () => {
            alToken.current(null);
            setFase('fallo');
          },
          'timeout-callback': () => alToken.current(null),
          theme: 'light',
          language: 'es',
          size: 'flexible',
        });
        widget.current = { api, id };
        reinicioAplicado.current = reinicio;
        setFase('listo');
      },
      () => {
        if (vigente) setFase('sin_script');
      },
    );
    return () => {
      vigente = false;
      widget.current?.api.remove(widget.current.id);
      widget.current = null;
    };
    // `reinicio` solo se lee al crear el widget; los reinicios posteriores los atiende el otro efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitekey, cargador, intento]);

  useEffect(() => {
    if (!widget.current || reinicioAplicado.current === reinicio) return;
    reinicioAplicado.current = reinicio;
    widget.current.api.reset(widget.current.id);
  }, [reinicio]);

  const reintentar = () => {
    alToken.current(null);
    if (fase === 'fallo' && widget.current) {
      setFase('listo');
      widget.current.api.reset(widget.current.id);
      return;
    }
    setFase('cargando');
    setIntento((n) => n + 1);
  };

  return (
    <div className={estilos.desafio}>
      <p id={idTitulo} className={estilos.titulo}>
        Desafío de seguridad
      </p>
      <div ref={contenedor} role="group" aria-labelledby={idTitulo} className={estilos.widget} />
      {fase === 'cargando' ? <Cargando etiqueta="Cargando el desafío de seguridad…" /> : null}
      {fase === 'sin_script' || fase === 'fallo' ? (
        <ErrorCarga
          mensaje={fase === 'sin_script' ? MENSAJE_SIN_SCRIPT : MENSAJE_FALLO_DESAFIO}
          onReintentar={reintentar}
        />
      ) : null}
    </div>
  );
}
