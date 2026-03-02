import { useState, useEffect } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarRange } from 'lucide-react';

interface DatePickerValue {
  mode: 'single' | 'range';
  startDate: string;
  endDate?: string;
  time?: string; // HH:MM — nur für single mode; undefined = Legacy-Eintrag ohne Uhrzeit
}

function currentLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentLocalTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  // Neuer Block: initiale Uhrzeit beim ersten Render automatisch speichern
  useEffect(() => {
    if (isNew) {
      onChange(JSON.stringify(value));
    }
    // Nur beim Mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heutiges Datum als Maximum (keine Zukunft)
  const today = currentLocalDate();

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, startDate: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, endDate: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value, time: e.target.value };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

  const toggleMode = () => {
    const newMode = value.mode === 'single' ? 'range' : 'single';
    const newValue: DatePickerValue = {
      mode: newMode,
      startDate: value.startDate,
      ...(newMode === 'range'
        ? { endDate: value.startDate }
        : { time: value.time ?? currentLocalTime() }
      ),
    };
    setValue(newValue);
    onChange(JSON.stringify(newValue));
  };

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
          <Calendar size={14} className="mr-1" />
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
          <Input
            type="date"
            value={value.startDate}
            onChange={handleStartDateChange}
            readOnly={readOnly}
            disabled={readOnly}
            max={today}
            className="max-w-[180px]"
          />
          <Input
            type="time"
            value={value.time ?? ''}
            onChange={handleTimeChange}
            readOnly={readOnly}
            disabled={readOnly}
            className="max-w-[120px]"
          />
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <Input
            type="date"
            value={value.startDate}
            onChange={handleStartDateChange}
            readOnly={readOnly}
            disabled={readOnly}
            max={today}
            className="max-w-[180px]"
          />
          <span className="text-muted-foreground text-sm">bis</span>
          <Input
            type="date"
            value={value.endDate || value.startDate}
            onChange={handleEndDateChange}
            readOnly={readOnly}
            disabled={readOnly}
            min={value.startDate}
            max={today}
            className="max-w-[180px]"
          />
        </div>
      )}
    </div>
  );
}
