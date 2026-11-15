// Auswahl von Icon und Farbe einer Vorlage (Spec 05 „Vorlagen-Editor"; v2 `TemplateStylePicker`).
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';
import { TEMPLATE_COLORS, TEMPLATE_ICONS } from './TemplateIcon';

export function TemplateStylePicker({
  icon, color, onIcon, onColor,
}: { icon: string; color: string; onIcon: (icon: string) => void; onColor: (color: string) => void }) {
  const tone = TEMPLATE_COLORS[color]?.text ?? '';
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{de.templates.editor.icon}</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATE_ICONS).map(([name, Icon]) => (
            <Button
              key={name}
              type="button"
              size="icon"
              variant={name === icon ? 'default' : 'outline'}
              aria-pressed={name === icon}
              aria-label={de.templates.editor.iconLabel(name)}
              onClick={() => onIcon(name)}
            >
              <Icon aria-hidden className={cn(name !== icon && tone)} />
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{de.templates.editor.color}</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATE_COLORS).map(([token, c]) => (
            <Button
              key={token}
              type="button"
              size="icon"
              variant="outline"
              aria-pressed={token === color}
              aria-label={de.templates.editor.colorNames[token as keyof typeof de.templates.editor.colorNames]}
              onClick={() => onColor(token)}
            >
              <span className={cn('flex size-6 items-center justify-center rounded-full text-white', c.bg)}>
                {token === color ? <Check aria-hidden className="size-4" /> : null}
              </span>
            </Button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
