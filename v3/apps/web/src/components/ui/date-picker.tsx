// shadcn/ui Date Picker = Komposition aus Popover + Calendar (shadcn-Doku „Date Picker“, A-146). Werte bleiben Strings im
// bisherigen Format: Datum `YYYY-MM-DD`, Datum+Uhrzeit `YYYY-MM-DDTHH:mm`, Monat `YYYY-MM`; leer = `''`.
// Uhrzeit nach shadcn-Muster „Date and Time Picker“: Calendar für das Datum, daneben `Input type="time"`.
import * as React from 'react';
import { format } from 'date-fns';
import { de as deLocale } from 'react-day-picker/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { de } from '@/i18n/de';

/** `YYYY-MM-DD` → lokales Datum (ohne Zeitzonen-Verschiebung); ungültig/leer → undefined. */
export function parseYmd(s: string | undefined): Date | undefined {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}
export const toYmd = (d: Date) => format(d, 'yyyy-MM-dd');
const show = (d: Date) => format(d, 'dd.MM.yyyy');

/** Anzeige eines Zeitraums: „01.03. – 15.03.2026“ im selben Jahr, sonst beide Daten voll. */
export function formatRange(from: Date | undefined, to: Date | undefined): string {
  if (from && to) return from.getFullYear() === to.getFullYear() ? `${format(from, 'dd.MM.')} – ${show(to)}` : `${show(from)} – ${show(to)}`;
  if (from) return `${show(from)} – …`;
  if (to) return `… – ${show(to)}`;
  return '';
}

type TriggerAria = Pick<React.ComponentProps<'button'>, 'aria-label' | 'aria-invalid' | 'aria-describedby'>;

function TriggerButton({ id, text, placeholder, className, ...props }: React.ComponentProps<typeof Button> & { text: string; placeholder: string }) {
  return (
    <Button id={id} type="button" variant="outline" data-empty={!text} className={cn('w-full min-w-0 justify-start text-left font-normal data-[empty=true]:text-muted-foreground', className)} {...props}>
      <CalendarIcon aria-hidden />
      <span className="truncate">{text || placeholder}</span>
    </Button>
  );
}

/** Ein Datum (`YYYY-MM-DD`). */
function DatePicker({ id, value, onChange, placeholder = de.datePicker.placeholder, required, disabled, className, ...aria }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; disabled?: boolean; className?: string } & TriggerAria) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton id={id} text={selected ? show(selected) : ''} placeholder={placeholder} disabled={disabled} className={className} {...aria} />
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          required={required}
          // Auch ein Klick auf den schon gewählten Tag schließt das Popup (bei `required` ändert er nichts).
          onDayClick={() => setOpen(false)}
          onSelect={(d: Date | undefined) => {
            if (!d && required) return;
            onChange(d ? toYmd(d) : '');
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Datum + Uhrzeit (`YYYY-MM-DDTHH:mm`). `label` benennt das Uhrzeitfeld („Beginn: Uhrzeit“). */
function DateTimePicker({ id, value, onChange, label, defaultTime = '12:00', disabled, className, ...aria }: { id?: string; value: string; onChange: (v: string) => void; label: string; defaultTime?: string; disabled?: boolean; className?: string } & TriggerAria) {
  const date = value.slice(0, 10);
  // Uhrzeit, solange noch kein Datum gewählt ist (sonst stammt sie aus `value`).
  const [pending, setPending] = React.useState('');
  const time = value.length >= 16 ? value.slice(11, 16) : pending;
  return (
    <div className={cn('flex min-w-0 gap-2', className)}>
      <DatePicker id={id} value={date} required disabled={disabled} className="flex-1" onChange={(d) => onChange(d ? `${d}T${time || defaultTime}` : '')} {...aria} />
      <Input
        type="time"
        className="w-28 shrink-0"
        aria-label={de.datePicker.time(label)}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        value={time}
        onChange={(e) => {
          const t = e.target.value.slice(0, 5);
          if (!date) return setPending(t);
          if (t) onChange(`${date}T${t}`);
        }}
      />
    </div>
  );
}

export interface RangePreset {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

/** Zeitraum (`from`/`to` je `YYYY-MM-DD`, leer = offen) im Range-Calendar, optional mit Schnellauswahl im Popup. */
function DateRangePicker({ id, from, to, onChange, presets, text, placeholder = de.datePicker.rangePlaceholder, className, ...aria }: { id?: string; from: string; to: string; onChange: (from: string, to: string) => void; presets?: RangePreset[]; text?: string; placeholder?: string; className?: string } & TriggerAria) {
  const [open, setOpen] = React.useState(false);
  const current: DateRange | undefined = from || to ? { from: parseYmd(from), to: parseYmd(to) } : undefined;
  const [draft, setDraft] = React.useState<DateRange | undefined>(current);
  const openChange = (o: boolean) => {
    if (o) setDraft(current);
    setOpen(o);
  };
  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <TriggerButton id={id} text={text ?? formatRange(current?.from, current?.to)} placeholder={placeholder} className={className} {...aria} />
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        {presets?.length ? (
          <div role="group" aria-label={de.datePicker.quick} className="flex flex-wrap gap-2 border-b p-3">
            {presets.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={p.active ? 'default' : 'outline'}
                aria-pressed={p.active}
                onClick={() => {
                  p.onSelect();
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        ) : null}
        <Calendar
          mode="range"
          resetOnSelect
          selected={draft}
          defaultMonth={draft?.to ?? draft?.from}
          onSelect={(r: DateRange | undefined) => {
            setDraft(r);
            // Erst mit Ende übernehmen; der erste Klick setzt nur den Beginn.
            if (r?.from && r.to) {
              onChange(toYmd(r.from), toYmd(r.to));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Monat (`YYYY-MM`): Jahr blättern, Monat wählen. */
function MonthPicker({ id, value, onChange, placeholder = de.datePicker.monthPlaceholder, className, ...aria }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string } & TriggerAria) {
  const [open, setOpen] = React.useState(false);
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  const selYear = m ? Number(m[1]) : undefined;
  const selMonth = m ? Number(m[2]) : undefined;
  const [year, setYear] = React.useState(selYear ?? new Date().getFullYear());
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const name = (y: number, mo: number, f: string) => format(new Date(y, mo - 1, 1), f, { locale: deLocale });
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setYear(selYear ?? new Date().getFullYear());
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <TriggerButton id={id} text={selYear && selMonth ? name(selYear, selMonth, 'LLLL yyyy') : ''} placeholder={placeholder} className={className} {...aria} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={de.datePicker.prevYear} onClick={() => setYear(year - 1)}>
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span className="text-sm font-medium" aria-live="polite">
            {year}
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label={de.datePicker.nextYear} onClick={() => setYear(year + 1)}>
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {months.map((mo) => {
            const on = year === selYear && mo === selMonth;
            return (
              <Button
                key={mo}
                type="button"
                variant={on ? 'default' : 'ghost'}
                aria-pressed={on}
                aria-label={name(year, mo, 'LLLL yyyy')}
                onClick={() => {
                  onChange(`${year}-${String(mo).padStart(2, '0')}`);
                  setOpen(false);
                }}
              >
                {name(year, mo, 'LLL')}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, DateTimePicker, DateRangePicker, MonthPicker };
