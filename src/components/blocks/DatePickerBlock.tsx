import { useState } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarRange } from 'lucide-react';

interface DatePickerValue {
  mode: 'single' | 'range';
  startDate: string;
  endDate?: string;
}

interface DatePickerBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function DatePickerBlock({ block, onChange, readOnly = false, hideLabel = false }: DatePickerBlockProps) {
  // Parse value: kann String (Legacy) oder DatePickerValue sein
  const parseValue = (): DatePickerValue => {
    if (typeof block.value === 'string' && block.value) {
      try {
        // Versuche JSON zu parsen
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
    // Default: heute
    return {
      mode: 'single',
      startDate: new Date().toISOString().split('T')[0],
    };
  };

  const [value, setValue] = useState<DatePickerValue>(parseValue());

  // Heutiges Datum als Maximum (keine Zukunft)
  const today = new Date().toISOString().split('T')[0];

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

  const toggleMode = () => {
    const newMode = value.mode === 'single' ? 'range' : 'single';
    const newValue: DatePickerValue = {
      mode: newMode,
      startDate: value.startDate,
      ...(newMode === 'range' && { endDate: value.startDate })
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
          Zeitraum
        </Button>
      </div>

      {value.mode === 'single' ? (
        <Input
          type="date"
          value={value.startDate}
          onChange={handleStartDateChange}
          readOnly={readOnly}
          disabled={readOnly}
          max={today}
          className="max-w-[180px]"
        />
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
