// Matriz rol x RPC de B03 (SEC-06; contratos.md §3). B03 no agrega funciones de `public` ejecutables por API:
// `privado.encolar_mail`, `privado.disparar_mail`, `privado.barrer_mails` y los triggers de `mail_salida` no son
// RPC (supabase/tests/lista_rpc/03.txt solo trae comentarios), así que no hay filas de RPC que agregar. La matriz
// rol x tabla/vista de mails (T-NFR-13, SEC-01, SEC-03) y la ausencia de `privado` en la API se prueban en
// tests/integracion/mails/seguridad.test.ts; la de roles de base de datos, en supabase/tests/03_mails.test.sql.
// El fragmento existe para que `matriz-roles.spec.ts` lo una sin cambios y para que un RPC futuro de mails tenga
// dónde declarar su fila (la prueba SEC-06 falla si una función de `lista_rpc` no tiene fila).
import type { FilaRpc } from '../../../soporte/matriz';

export const filas: FilaRpc[] = [];
