// Página de la agenda pública de un profesor, `#/p/<slug>` (B02, T02.2; B14). rutas.tsx importa este archivo
// (default export), le pasa el slug de la ruta y le compone «Pedir acceso» de `ficha` (ADR-020).
import type { ReactNode } from 'react';
import { PaginaAgenda } from './PaginaAgenda';

export type PaginaAgendaRutaProps = {
  slug: string;
  /** «Pedir acceso» (ALU-14) compuesto por la ruta; la agenda no importa de `ficha` (componentes.md §5). */
  pedirAcceso?: (slug: string) => ReactNode;
};

export default function Pagina({ slug, pedirAcceso }: PaginaAgendaRutaProps) {
  return <PaginaAgenda slug={slug} pedirAcceso={pedirAcceso} />;
}
