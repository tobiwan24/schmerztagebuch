// Auswahl von Icon und Farbe einer Vorlage (Spec 05 „Vorlagen-Editor"; v2 `TemplateStylePicker`).
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { deTemplates } from '@/i18n/lazy/templates';
import { TEMPLATE_COLORS, TEMPLATE_ICONS } from './TemplateIcon';

export function TemplateStylePicker({
  icon, color, onIcon, onColor,
}: { icon: string; color: string; onIcon: (icon: string) => void; onColor: (color: string) => void }) {
  const tone = (TEMPLATE_COLORS as Record<string, { text: string } | undefined>)[color]?.text ?? '';
  return (
    <>
      <FieldSet className="flex flex-col gap-2">
        <FieldLegend variant="label" className="mb-1">{deTemplates.editor.icon}</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATE_ICONS).map(([name, Icon]) => (
            <Button
              key={name}
              type="button"
              size="icon"
              variant={name === icon ? 'default' : 'outline'}
              aria-pressed={name === icon}
              aria-label={deTemplates.editor.iconLabel(name)}
              onClick={() => onIcon(name)}
            >
              <Icon aria-hidden className={cn(name !== icon && tone)} />
            </Button>
          ))}
        </div>
      </FieldSet>
      <FieldSet className="flex flex-col gap-2">
        <FieldLegend variant="label" className="mb-1">{deTemplates.editor.color}</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATE_COLORS).map(([token, c]) => (
            <Button
              key={token}
              type="button"
              size="icon"
              variant="outline"
              aria-pressed={token === color}
              aria-label={deTemplates.editor.colorNames[token as keyof typeof deTemplates.editor.colorNames]}
              onClick={() => onColor(token)}
            >
              <span className={cn('flex size-6 items-center justify-center rounded-full', c.bg, c.check)}>
                {token === color ? <Check aria-hidden className="size-4" /> : null}
              </span>
            </Button>
          ))}
        </div>
      </FieldSet>
    </>
  );
}
