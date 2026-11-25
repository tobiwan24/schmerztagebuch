// shadcn/ui Date Picker = Komposition aus Popover + Calendar (shadcn-Doku „Date Picker“, A-146). Werte bleiben Strings im
// bisherigen Format: Datum `YYYY-MM-DD`, Datum+Uhrzeit `YYYY-MM-DDTHH:mm`; leer = `''`.
// Uhrzeit nach shadcn-Muster „Date and Time Picker“: Calendar für das Datum, daneben `Input type="time"`.
import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock2Icon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
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

/** Anzeige eines Zeitraums mit Uhrzeit (`YYYY-MM-DDTHH:mm`): „10.03.2026, 18:00 – 22:15“ am selben Tag, sonst beide voll. */
export function formatDateTimeRange(start: string, end: string): string {
  const s = parseYmd(start);
  const e = parseYmd(end);
  if (!s || !e) return '';
  const st = start.slice(11, 16);
  const et = end.slice(11, 16);
  return toYmd(s) === toYmd(e) ? `${show(s)}, ${st} – ${et}` : `${show(s)}, ${st} – ${show(e)}, ${et}`;
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
      <PopoverContent className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0" align="start">
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
      <DatePicker id={id} value={date} required disabled={disabled} className="w-auto" onChange={(d) => onChange(d ? `${d}T${time || defaultTime}` : '')} {...aria} />
      <Input
        type="time"
        className="w-28 shrink-0 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
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
      <PopoverContent className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0" align="start">
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

/** Zeitraum mit Uhrzeit (`start`/`end` je `YYYY-MM-DDTHH:mm`) nach shadcn-Muster „Date and Time Picker“: Range-Calendar,
 *  darunter Uhrzeit für Beginn und Ende. Das Popup bleibt nach der Tageswahl offen, damit die Uhrzeiten anpassbar sind. */
function DateTimeRangePicker({ id, start, end, onChange, labelStart, labelEnd, placeholder = de.datePicker.rangePlaceholder, className, ...aria }: { id?: string; start: string; end: string; onChange: (start: string, end: string) => void; labelStart: string; labelEnd: string; placeholder?: string; className?: string } & TriggerAria) {
  const [open, setOpen] = React.useState(false);
  const uid = React.useId();
  const startTime = start.length >= 16 ? start.slice(11, 16) : '00:00';
  const endTime = end.length >= 16 ? end.slice(11, 16) : '23:59';
  const from = parseYmd(start);
  const to = parseYmd(end);
  const current: DateRange | undefined = from || to ? { from, to } : undefined;
  const [draft, setDraft] = React.useState<DateRange | undefined>(current);
  const openChange = (o: boolean) => {
    if (o) setDraft(current);
    setOpen(o);
  };
  const emit = (f: Date, t: Date, st: string, et: string) => onChange(`${toYmd(f)}T${st}`, `${toYmd(t)}T${et}`);
  const times = [
    { key: 'start', label: labelStart, value: startTime, set: (v: string) => from && to && emit(from, to, v, endTime) },
    { key: 'end', label: labelEnd, value: endTime, set: (v: string) => from && to && emit(from, to, startTime, v) },
  ];
  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <TriggerButton id={id} text={formatDateTimeRange(start, end)} placeholder={placeholder} className={className} {...aria} />
      </PopoverTrigger>
      <PopoverContent className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0" align="start">
        <Calendar
          mode="range"
          resetOnSelect
          selected={draft}
          defaultMonth={draft?.to ?? draft?.from}
          onSelect={(r: DateRange | undefined) => {
            setDraft(r);
            if (r?.from && r.to) emit(r.from, r.to, startTime, endTime);
          }}
        />
        <div className="border-t p-3">
          <FieldGroup>
            {times.map((t) => (
              <Field key={t.key}>
                <FieldLabel htmlFor={`${uid}-${t.key}`}>{de.datePicker.time(t.label)}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${uid}-${t.key}`}
                    type="time"
                    value={t.value}
                    aria-invalid={aria['aria-invalid']}
                    className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 5);
                      if (v) t.set(v);
                    }}
                  />
                  <InputGroupAddon>
                    <Clock2Icon className="text-muted-foreground" aria-hidden />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            ))}
          </FieldGroup>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, DateTimePicker, DateRangePicker, DateTimeRangePicker };
