import { useState, useEffect } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar as CalendarIcon, CalendarRange } from 'lucide-react';

interface DatePickerValue {
  mode: 'single' | 'range';
  startDate: string;
  endDate?: string;
  time?: string;      // HH:MM — nur für single mode; undefined = Legacy-Eintrag ohne Uhrzeit
  startTime?: string; // HH:MM — für range mode Startzeit
  endTime?: string;   // HH:MM — für range mode Endzeit
}

function currentLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentLocalTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Parst 'YYYY-MM-DD' sicher als lokales Datum (kein UTC-Offset-Bug)
function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

interface DatePickerBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function DatePickerBlock({ block, onChange, readOnly = false, hideLabel = false }: DatePickerBlockProps) {
  const isNew = !block.value;

  const parseValue = (): DatePickerValue => {
    if (typeof block.value === 'string' && block.value) {
      try {
        const parsed = JSON.parse(block.value);
        if (parsed.mode && parsed.startDate) {
          return parsed;
        }
      } catch {
        // Legacy: nur ein Datum
        return {
          mode: 'single',
          startDate: block.value,
        };
      }
    }
    // Neuer Block: heute + aktuelle Uhrzeit
    return {
      mode: 'single',
      startDate: currentLocalDate(),
      time: currentLocalTime(),
    };
  };

  const [value, setValue] = useState<DatePickerValue>(parseValue());
  const [open, setOpen] = useState(false);

  // Neuer Block: initiale Uhrzeit beim ersten Render automatisch speichern
  useEffect(() => {
    if (isNew) {
      onChange(JSON.stringify(value));
    }
    // Nur beim Mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, time: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, startTime: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, endTime: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const toggleMode = () => {
    const newMode = value.mode === 'single' ? 'range' : 'single';
    const newValue: DatePickerValue = {
      mode: newMode,
      startDate: value.startDate,
      ...(newMode === 'range'
        ? {
            endDate: value.startDate,
            startTime: value.time ?? currentLocalTime(),
            endTime: value.time ?? currentLocalTime(),
          }
        : { time: value.startTime ?? currentLocalTime() }
      ),
    };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
    setOpen(false);
  };

  const formattedStartDate = format(parseLocalDate(value.startDate), 'dd. MMM yyyy', { locale: de });
  const formattedEndDate = value.endDate
    ? format(parseLocalDate(value.endDate), 'dd. MMM yyyy', { locale: de })
    : null;

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{block.label}</Label>}

      <div className="inline-flex gap-1 p-1 bg-muted rounded-lg">
        <Button
          onClick={toggleMode}
          disabled={readOnly}
          variant={value.mode === 'single' ? 'default' : 'ghost'}
          size="sm"
          type="button"
          className="h-8 px-3"
        >
          <CalendarIcon size={14} className="mr-1" />
          Datum
        </Button>
        <Button
          onClick={toggleMode}
          disabled={readOnly}
          variant={value.mode === 'range' ? 'default' : 'ghost'}
          size="sm"
          type="button"
          className="h-8 px-3"
        >
          <CalendarRange size={14} className="mr-1" />
          Dauer
        </Button>
      </div>

      {value.mode === 'single' ? (
        <div className="flex flex-wrap gap-2 items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={readOnly}
                type="button"
                className="justify-start font-normal"
              >
                <CalendarIcon size={14} className="mr-2" />
                {formattedStartDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <Calendar
                mode="single"
                selected={parseLocalDate(value.startDate)}
                captionLayout="dropdown"
                onSelect={(date) => {
                  if (!date) return;
                  const newValue = { ...value, startDate: format(date, 'yyyy-MM-dd') };
                  setValue(newValue);
                  onChange(JSON.stringify(newValue));
                  setOpen(false);
                }}
                disabled={(date) => date > new Date()}
                locale={de}
              />
            </PopoverContent>
          </Popover>

          <Input
            type="time"
            value={value.time ?? ''}
            onChange={handleTimeChange}
            readOnly={readOnly}
            disabled={readOnly}
            className="w-auto appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={readOnly}
                type="button"
                className="justify-start font-normal"
              >
                <CalendarIcon size={14} className="mr-2" />
                {formattedEndDate
                  ? `${format(parseLocalDate(value.startDate), 'dd. MMM', { locale: de })} – ${formattedEndDate}`
                  : formattedStartDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={parseLocalDate(value.startDate)}
                selected={{
                  from: parseLocalDate(value.startDate),
                  to: value.endDate ? parseLocalDate(value.endDate) : undefined,
                }}
                onSelect={(range: DateRange | undefined) => {
                  if (!range?.from) return;
                  const newValue = {
                    ...value,
                    startDate: format(range.from, 'yyyy-MM-dd'),
                    endDate: range.to ? format(range.to, 'yyyy-MM-dd') : undefined,
                  };
                  setValue(newValue);
                  onChange(JSON.stringify(newValue));
                  if (range.to) setOpen(false);
                }}
                disabled={(date) => date > new Date()}
                locale={de}
              />
            </PopoverContent>
          </Popover>

          <div className="flex gap-2 items-center">
            <Input
              type="time"
              value={value.startTime ?? ''}
              onChange={handleStartTimeChange}
              readOnly={readOnly}
              disabled={readOnly}
              className="w-auto appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
            <span className="text-muted-foreground text-sm">bis</span>
            <Input
              type="time"
              value={value.endTime ?? ''}
              onChange={handleEndTimeChange}
              readOnly={readOnly}
              disabled={readOnly}
              className="w-auto appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
