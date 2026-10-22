// Página `#/ingreso` (WEB-02, ALU-01, CA-01, CA-44): compone la lógica de `logica/` con la presentación.
// Con sesión, la guarda (src/estado/) ya redirige fuera de esta ruta; tras verificar el código se navega al destino.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  destinoTrasIngreso,
  ingresarConGoogle,
  msParaReenviar,
  pedirCodigo,
  tomarErrorDeIngreso,
  verificarCodigo,
} from '../logica';
import { IngresoPagina } from './IngresoPagina';

export default function Pagina() {
  const { search } = useLocation();
  const navegar = useNavigate();
  // El error de la vuelta de Google se muestra una sola vez (SEC-17).
  const [errorGoogle] = useState(() => tomarErrorDeIngreso());

  return (
    <IngresoPagina
      sitekey={import.meta.env.VITE_TURNSTILE_SITEKEY}
      errorGoogle={errorGoogle}
      onGoogle={() => ingresarConGoogle({ busqueda: search })}
      onPedirCodigo={pedirCodigo}
      onVerificarCodigo={verificarCodigo}
      onIngreso={() => void navegar(destinoTrasIngreso(search), { replace: true })}
      msParaReenviar={msParaReenviar}
    />
  );
}
