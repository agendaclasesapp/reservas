import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Calendar, CalendarCell, CalendarGrid, Heading } from 'react-aria-components';
import { today, type DateValue } from '@internationalized/date';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { supabase } from '../supabase';

type Hueco = { inicio: string; fin: string; estado: 'libre' | 'ocupado' | 'bloqueado' };
const ZONA = 'America/Montevideo';
const hora = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

export default function Agenda() {
  const [dia, setDia] = useState<DateValue>(today(ZONA));
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  useEffect(() => {
    const p_dia = format(new TZDate(dia.year, dia.month - 1, dia.day, ZONA), 'yyyy-MM-dd');
    void supabase.rpc('agenda_publica', { p_dia }).then(({ data }) => setHuecos((data as Hueco[]) ?? []));
  }, [dia]);
  return (
    <main>
      <Calendar aria-label="Día" value={dia} onChange={setDia}>
        <header><Button slot="previous">‹</Button><Heading /><Button slot="next">›</Button></header>
        <CalendarGrid>{(d) => <CalendarCell date={d} />}</CalendarGrid>
      </Calendar>
      <ul>
        {huecos.map((h) => (
          <li key={h.inicio}>{hora.format(new Date(h.inicio))}–{hora.format(new Date(h.fin))} {h.estado}</li>
        ))}
      </ul>
      <Link to="/ingreso">Ingresar</Link>
    </main>
  );
}
