// Mehr → Tagebücher (Spec 10): Liste der Tagebücher mit Kurzbefehl (08) und Mitgliedern (09).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Plus, ScanQrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InviteQrScanner } from '@/components/InviteQrScanner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deDiaries } from '@/i18n/lazy/diaries';
import { deInvite } from '@/i18n/lazy/invite';

const t = deDiaries;

export function DiariesPage() {
  const { diary } = useData();
  const list = useQuery(() => diary.listDiaries(), [diary]);
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={de.more.diaries} back />
      {list.status === 'error' ? <ErrorState onRetry={list.retry} /> : null}
      {list.status === 'ok'
        ? list.data.map((d) => (
            <Card key={d.id} data-testid="diary-card" className="gap-0 py-0">
              <p className="border-b px-4 py-3 font-medium">{d.name}</p>
              <Link to={`/more/diaries/${d.id}/settings`} className="flex min-h-11 items-center justify-between border-b px-4 py-3 text-sm">
                {t.settings}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
              <Link to={`/more/diaries/${d.id}/members`} className="flex min-h-11 items-center justify-between border-b px-4 py-3 text-sm">
                {t.members}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
              <Link to={`/more/diaries/${d.id}/shortcut`} className="flex min-h-11 items-center justify-between px-4 py-3 text-sm">
                {t.shortcut}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Card>
          ))
        : null}
      <Button asChild variant="outline">
        <Link to="/more/diaries/new">
          <Plus aria-hidden />
          {t.create}
        </Link>
      </Button>
      <Button variant="outline" data-testid="invite-scan-open" onClick={() => setScanning(true)}>
        <ScanQrCode aria-hidden />
        {deInvite.scan.open}
      </Button>
      {scanning ? <InviteQrScanner onClose={() => setScanning(false)} onCode={(code) => (setScanning(false), navigate(`/invite#${code}`))} /> : null}
    </>
  );
}
