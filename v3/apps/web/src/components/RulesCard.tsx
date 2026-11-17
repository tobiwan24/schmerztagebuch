// Einstellungen → Hinweise (ANA-30, A-089): Schwellwert-Regeln anlegen und löschen. Nur beschreibende Texte, keine Empfehlungen.
import { useState } from 'react';
import { ruleText } from '@stb/analysis';
import { DEFAULT_COOLDOWN_HOURS, type NotificationRule } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deAnalysis } from '@/i18n/lazy/analysis';

const t = de.hints;

interface Field {
  blockId: string;
  diaryId: string;
  label: string;
  templateName: string;
}

export function RulesCard() {
  const { diary, stamper, newId } = useData();
  const rules = useQuery(async () => {
    const diaries = await diary.listDiaries();
    const list = (await Promise.all(diaries.map((d) => diary.listNotificationRules(d.id)))).flat();
    const templates = await diary.listAllTemplates();
    const states = await Promise.all(templates.filter((x) => !x.archived).map((x) => diary.getTemplate(x.id)));
    const fields: Field[] = states.flatMap((s) =>
      s ? s.version.blocks.filter((b) => b.type === 'slider').map((b) => ({ blockId: b.id, diaryId: s.template.diaryId, label: b.label, templateName: s.template.name })) : [],
    );
    return { list, fields };
  }, [diary]);
  const [blockId, setBlockId] = useState('');
  const [op, setOp] = useState<NotificationRule['op']>('>=');
  const [value, setValue] = useState('7');
  const [days, setDays] = useState('3');
  const [cooldown, setCooldown] = useState(String(DEFAULT_COOLDOWN_HOURS));
  const [invalid, setInvalid] = useState(false);
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  if (rules.status !== 'ok') return null;
  const { list, fields } = rules.data;
  const labelOf = (id: string) => fields.find((f) => f.blockId === id)?.label ?? id;
  const dup = (l: string) => fields.filter((f) => f.label === l).length > 1;

  async function add() {
    const field = fields.find((f) => f.blockId === (blockId || fields[0]?.blockId));
    const v = Number(value.replace(',', '.'));
    const n = Number(days);
    const c = Number(cooldown);
    if (!field || value.trim() === '' || !Number.isFinite(v) || !Number.isInteger(n) || n < 1 || n > 30 || !Number.isInteger(c) || c < 1) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const s = await stamper.stamp();
    await diary.saveNotificationRule({ id: newId(), diaryId: field.diaryId, blockId: field.blockId, op, value: v, consecutiveDays: n, cooldownHours: c, hlc: s.hlc, updatedAt: s.at });
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
    rules.retry();
  }
  async function remove(r: NotificationRule) {
    const s = await stamper.stamp();
    await diary.deleteNotificationRule(r.id, { hlc: s.hlc, updatedAt: s.at });
    rules.retry();
  }

  return (
    <Card data-testid="rules-card">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {list.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : null}
        {list.map((r) => {
          const text = ruleText(labelOf(r.blockId), r);
          return (
            <div key={r.id} data-testid="rule-row" className="flex items-center justify-between gap-2 text-sm">
              <span>
                {text}
                <span className="block text-xs text-muted-foreground">{t.cooldownText(r.cooldownHours)}</span>
              </span>
              <Button size="sm" variant="outline" aria-label={t.removeNamed(text)} onClick={() => void remove(r)}>
                {t.remove}
              </Button>
            </div>
          );
        })}
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noBlocks}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-field">{t.field}</Label>
              <Select id="rule-field" value={blockId || fields[0]!.blockId} onChange={(e) => setBlockId(e.target.value)}>
                {fields.map((f) => (
                  <option key={f.blockId} value={f.blockId}>
                    {dup(f.label) ? deAnalysis.blockOf(f.label, f.templateName) : f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-op">{t.op}</Label>
              <Select id="rule-op" value={op} onChange={(e) => setOp(e.target.value as NotificationRule['op'])}>
                <option value=">=">{t.opGe}</option>
                <option value="<=">{t.opLe}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-value">{t.value}</Label>
              <Input id="rule-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-days">{t.days}</Label>
              <Input id="rule-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-cooldown">{t.cooldown}</Label>
              <Input id="rule-cooldown" type="number" min={1} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
            </div>
            {invalid ? <p role="alert" className="text-sm text-destructive">{t.invalid}</p> : null}
            <Button onClick={() => void add()}>{t.add}</Button>
          </div>
        )}
        {list.length > 0 && permission === 'denied' ? <p className="text-sm text-destructive">{t.denied}</p> : null}
      </CardContent>
    </Card>
  );
}
