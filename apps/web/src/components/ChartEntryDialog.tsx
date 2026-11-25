// „Diagramm als Eintrag speichern“ (ANA-21): Vorlage wählen, Beschriftung eingeben, PNG der Ansicht als Anhang speichern.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useData } from '@/data/DataContext';
import { listChartTargets, saveChartAsEntry, type ChartTarget } from '@/lib/chart-entry';
import { de } from '@/i18n/de';
import { deAnalysis } from '@/i18n/lazy/analysis';

export function ChartEntryDialog({
  open, diaryIds, defaultCaption, render, onClose,
}: { open: boolean; diaryIds: string[]; defaultCaption: string; render: () => Promise<Blob>; onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const [targets, setTargets] = useState<ChartTarget[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [caption, setCaption] = useState(defaultCaption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const key = diaryIds.join(',');
  const captionRef = useRef(defaultCaption);
  captionRef.current = defaultCaption;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCaption(captionRef.current);
    setError(false);
    void listChartTargets(data.diary, key ? key.split(',') : []).then((t) => {
      if (!alive) return;
      setTargets(t);
      setTemplateId((cur) => (t.some((x) => x.state.template.id === cur) ? cur : (t[0]?.state.template.id ?? '')));
    });
    return () => {
      alive = false;
    };
  }, [open, data.diary, key]);

  async function save() {
    const target = targets?.find((t) => t.state.template.id === templateId);
    if (!target) return;
    setBusy(true);
    setError(false);
    try {
      const id = await saveChartAsEntry(data, target, await render(), caption);
      onClose();
      void navigate(`/entry/${id}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const t = deAnalysis.chartEntry;
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="chart-entry-title">
      <DialogTitle id="chart-entry-title">{t.title}</DialogTitle>
      {targets === null ? (
        <p className="mt-4 text-sm text-muted-foreground">{de.app.loading}</p>
      ) : targets.length === 0 ? (
        <DialogDescription data-testid="chart-entry-none">{t.noTemplate}</DialogDescription>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chart-entry-template">{t.template}</Label>
            <Select id="chart-entry-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {targets.map((x) => (
                <option key={x.state.template.id} value={x.state.template.id}>{x.state.template.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chart-entry-caption">{t.caption}</Label>
            <Input id="chart-entry-caption" value={caption} maxLength={190} onChange={(e) => setCaption(e.target.value)} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{t.error}</p> : null}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{de.lock.cancel}</Button>
        {targets && targets.length ? (
          <Button type="button" disabled={busy || !templateId} onClick={() => void save()}>{busy ? de.entry.saving : t.save}</Button>
        ) : null}
      </DialogFooter>
    </Dialog>
  );
}
