// Blockliste des Vorlagen-Editors (Spec 05 „Vorlagen-Editor"): Palette, Bezeichnung, Beschreibung, Pflicht, Rolle und
// typabhängige Konfiguration. Typwechsel wird nicht angeboten (DM-07); Umsortieren/Entfernen folgen (M14.5).
import { Plus } from 'lucide-react';
import { ROLES, newBlock, type BlockDef, type BlockType, type Role } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { de } from '@/i18n/de';
import { BlockConfigFields } from './BlockConfigFields';

const t = de.templates.editor;
/** Block-Typen der Palette. */
const PALETTE: readonly BlockType[] = ['slider', 'checkbox', 'multiselect', 'text', 'textarea', 'date', 'bodymap'];

export function BlockEditor({
  blocks, issues, newId, onChange,
}: {
  /** Nach `order` sortiert. */
  blocks: BlockDef[];
  /** Fehlermeldungen je Block-ID (nach dem ersten Speicherversuch). */
  issues: Map<string, string[]>;
  newId: () => string;
  onChange: (blocks: BlockDef[]) => void;
}) {
  const replace = (next: BlockDef) => onChange(blocks.map((b) => (b.id === next.id ? next : b)));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="blocks-heading">
      <h2 id="blocks-heading" className="text-sm font-medium">
        {t.blocks}
      </h2>
      <p className="text-xs text-muted-foreground">{t.blocksHint}</p>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">{t.noBlocks}</p> : null}
      {blocks.map((b, i) => (
        <BlockCard key={b.id} def={b} index={i + 1} messages={issues.get(b.id) ?? []} newId={newId} onChange={replace} />
      ))}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.addBlock}>
        {PALETTE.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...blocks, newBlock(type, { newId }, blocks.at(-1)?.order ?? null)])}
          >
            <Plus aria-hidden />
            {t.types[type]}
          </Button>
        ))}
      </div>
    </section>
  );
}

function BlockCard({
  def, index, messages, newId, onChange,
}: { def: BlockDef; index: number; messages: string[]; newId: () => string; onChange: (def: BlockDef) => void }) {
  const id = (k: string) => `block-${def.id}-${k}`;
  const invalid = messages.length > 0;
  return (
    <Card className="gap-3 p-4" role="region" aria-label={t.blockTitle(index, t.types[def.type])} data-testid="block-editor-card" data-block-type={def.type}>
      <p className="text-xs font-medium text-muted-foreground">{t.types[def.type]}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('label')}>{t.blockLabel}</Label>
        <Input
          id={id('label')}
          value={def.label}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...def, label: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('description')}>{t.blockDescription}</Label>
        <Input
          id={id('description')}
          value={def.description ?? ''}
          onChange={(e) => {
            const { description: _drop, ...rest } = def;
            void _drop;
            onChange((e.target.value === '' ? rest : { ...rest, description: e.target.value }) as BlockDef);
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id={id('required')} checked={def.required} onChange={(e) => onChange({ ...def, required: e.target.checked })} />
        <Label htmlFor={id('required')} className="font-normal">
          {t.required}
        </Label>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('role')}>{t.role}</Label>
        <Select
          id={id('role')}
          value={def.role ?? ''}
          onChange={(e) => {
            const { role: _drop, ...rest } = def;
            void _drop;
            onChange((e.target.value === '' ? rest : { ...rest, role: e.target.value as Role }) as BlockDef);
          }}
        >
          <option value="">{t.noRole}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </Select>
      </div>
      <BlockConfigFields def={def} newId={newId} onChange={onChange} />
      {messages.map((m) => (
        <p key={m} role="alert" className="text-sm text-destructive">
          {m}
        </p>
      ))}
    </Card>
  );
}
