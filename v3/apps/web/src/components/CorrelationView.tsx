// Auswertung → „Zusammenhänge“ (Spec 06, ANA-28, A-090/A-112): Rangkorrelation zweier Felder mit Zeitversatz und
// Auslöser-Liste mit Lift. Immer mit Fallzahl und Hinweis „Zusammenhang ist keine Ursache“; unter der Mindestzahl keine Zahl.
import { useState } from 'react';
import { MIN_CORRELATION_DAYS, MIN_LIFT_CASES, type FilterSpec } from '@stb/analysis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BlockPicker, useWorker } from '@/components/AnalysisShared';
import { useData } from '@/data/DataContext';
import { de } from '@/i18n/de';
import { deAnalysis } from '@/i18n/lazy/analysis';

const LAGS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const TRIGGER_TYPES = ['multiselect', 'checkbox', 'medication'];
const num = (n: number, digits: number) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (r: number) => `${Math.round(r * 100)} %`;

export function CorrelationView({ spec }: { spec: FilterSpec }) {
  const blocks = useWorker((c) => c.blocks(), []);
  const numeric = (blocks ?? []).filter((b) => b.type === 'slider');
  if (!blocks) return <p className="text-muted-foreground">{de.app.loading}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="corr-caveat" className="text-sm text-muted-foreground">{deAnalysis.corr.caveat}</p>
      {numeric.length < 2 ? <p className="text-sm text-muted-foreground">{deAnalysis.corr.needTwo}</p> : <PairCard spec={spec} numeric={numeric} />}
      <TriggerCard spec={spec} numeric={numeric} options={blocks.filter((b) => TRIGGER_TYPES.includes(b.type))} />
    </div>
  );
}

type Field = { blockId: string; label: string; templateName: string; role?: string };

function PairCard({ spec, numeric }: { spec: FilterSpec; numeric: Field[] }) {
  const { now } = useData();
  const t = deAnalysis.corr;
  const [pickA, setA] = useState<string>();
  const [pickB, setB] = useState<string>();
  const [lag, setLag] = useState<number>(0);
  const a = pickA ?? numeric.find((b) => b.role === 'outcome')?.blockId ?? numeric[0]!.blockId;
  const b = pickB ?? numeric.find((x) => x.blockId !== a)?.blockId ?? numeric[0]!.blockId;
  const result = useWorker((c) => c.correlation({ blockId: a }, { blockId: b }, lag, { spec, now: now() }), [JSON.stringify(spec), a, b, lag]);
  const label = (id: string) => numeric.find((x) => x.blockId === id)?.label ?? '';
  return (
    <Card data-testid="corr-pair">
      <CardHeader>
        <CardTitle className="text-base">{t.pairTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={numeric} value={a} onChange={setA} label={t.fieldA} />
        <BlockPicker blocks={numeric} value={b} onChange={setB} label={t.fieldB} />
        <ToggleGroup aria-label={t.lag}>
          {LAGS.map((l) => (
            <ToggleGroupItem key={l} pressed={lag === l} onClick={() => setLag(l)}>{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{t.lagHint(label(a), label(b), lag)}</p>
        <div data-testid="corr-result" className="text-sm">
          {!result ? t.loading
            : !result.enough ? t.tooFew(result.n, MIN_CORRELATION_DAYS)
            : result.rho === null || result.strength === null ? t.constant(result.n)
            : t.result(num(result.rho, 2), t.strength[result.strength], result.rho >= 0 ? t.direction.positive : t.direction.negative, result.n)}
        </div>
      </CardContent>
    </Card>
  );
}

function TriggerCard({ spec, numeric, options }: { spec: FilterSpec; numeric: Field[]; options: Field[] }) {
  const { now } = useData();
  const t = deAnalysis.corr;
  const [pickOutcome, setOutcome] = useState<string>();
  const [pickTrigger, setTrigger] = useState<string>();
  const [threshold, setThreshold] = useState('7');
  const [lag, setLag] = useState<0 | 1>(0);
  const outcome = pickOutcome ?? numeric.find((b) => b.role === 'outcome')?.blockId ?? numeric[0]?.blockId;
  const trigger = pickTrigger ?? options.find((b) => b.role === 'trigger')?.blockId ?? options[0]?.blockId;
  const th = Number(threshold);
  const valid = threshold.trim() !== '' && Number.isFinite(th);
  const rows = useWorker(
    (c) => (outcome && trigger && valid ? c.triggers({ outcome: { blockId: outcome }, threshold: th, lag, trigger: { blockId: trigger }, spec, now: now() }) : Promise.resolve(null)),
    [JSON.stringify(spec), outcome, trigger, th, valid, lag],
  );
  return (
    <Card data-testid="corr-triggers">
      <CardHeader>
        <CardTitle className="text-base">{t.triggersTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!outcome || options.length === 0 ? <p className="text-sm text-muted-foreground">{options.length === 0 ? t.noTriggerFields : t.needTwo}</p> : (
          <>
            <BlockPicker blocks={numeric} value={outcome} onChange={setOutcome} label={t.outcome} />
            <div className="flex flex-col gap-1">
              <Label htmlFor="corr-threshold">{t.threshold}</Label>
              <Input id="corr-threshold" type="number" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-24" />
            </div>
            <BlockPicker blocks={options} value={trigger} onChange={setTrigger} label={t.triggerBlock} />
            <ToggleGroup aria-label={t.triggerLag}>
              {([0, 1] as const).map((l) => (
                <ToggleGroupItem key={l} pressed={lag === l} onClick={() => setLag(l)}>{t.triggerLags[l]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            {!rows ? <p className="text-sm text-muted-foreground">{t.loading}</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">{t.noEvents}</p> : (
              <ul data-testid="corr-trigger-list" className="flex flex-col gap-1 text-sm">
                {rows.map((r) => (
                  <li key={r.key} data-testid="corr-trigger-row" data-enough={r.enough}>
                    {!r.enough ? t.tooFewCases(r.label, r.cases, MIN_LIFT_CASES)
                      : r.lift === null || r.rateWithEvent === null || r.rateOverall === null ? t.rowNoLift(r.label, r.cases)
                      : t.row(r.label, r.cases, pct(r.rateWithEvent), pct(r.rateOverall), num(r.lift, 1))}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t.liftHint}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
