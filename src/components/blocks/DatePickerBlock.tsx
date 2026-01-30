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
      // Legacy: nur ein Datum
      return {
        mode: 'single',
        startDate: block.value,
      };
    }
    if (typeof block.value === 'object' && block.value !== null && 'mode' in block.value) {
      return block.value as DatePickerValue;
    }
    // Default: heute
    return {
      mode: 'single',
      startDate: new Date().toISOString().split('T')[0],
    };
  };

  const [value, setValue] = useState<DatePickerValue>(parseValue());

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
      
      <div className="flex gap-2">
        <Button
          onClick={toggleMode}
          disabled={readOnly}
          variant={value.mode === 'single' ? 'default' : 'outline'}
          size="sm"
          type="button"
        >
          <Calendar size={16} className="mr-2" />
          Einzeln
        </Button>
        <Button
          onClick={toggleMode}
          disabled={readOnly}
          variant={value.mode === 'range' ? 'default' : 'outline'}
          size="sm"
          type="button"
        >
          <CalendarRange size={16} className="mr-2" />
          Zeitraum
        </Button>
      </div>

      <div className="space-y-2">
        <Input
          type="date"
          value={value.startDate}
          onChange={handleStartDateChange}
          readOnly={readOnly}
          disabled={readOnly}
          placeholder={value.mode === 'range' ? 'Von' : 'Datum'}
        />
        
        {value.mode === 'range' && (
          <Input
            type="date"
            value={value.endDate || value.startDate}
            onChange={handleEndDateChange}
            readOnly={readOnly}
            disabled={readOnly}
            placeholder="Bis"
            min={value.startDate}
          />
        )}
      </div>
    </div>
  );
}
