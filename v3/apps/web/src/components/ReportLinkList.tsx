// Aktive Arzt-Links mit Aufrufen und Ablauf; Widerrufen (Spec 07, EXP-24).
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { listReportLinks, revokeReportLink } from '@/sharing/report-link';
import type { ShareInfo } from '@stb/sync-protocol';

const t = de.exportPage.reportLink;

/** `refresh` zählt hoch, wenn ein Link erstellt wurde. */
export function ReportLinkList({ refresh }: { refresh: number }) {
  const [shares, setShares] = useState<ShareInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setShares(await listReportLinks());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    void reload();
  }, [refresh]);

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokeReportLink(id);
      setConfirm(null);
      await reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t.listTitle} data-testid="report-link-list" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t.listTitle}</h3>
      {failed ? <p role="alert" className="text-sm text-destructive">{t.listFailed}</p> : null}
      {shares?.length === 0 ? <p className="text-sm text-muted-foreground">{t.listEmpty}</p> : null}
      <ul className="flex flex-col gap-2">
        {(shares ?? []).map((s) => (
          <li key={s.id} data-testid="report-link-row" className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{t.status[s.status]}</Badge>
              <span className="text-sm">{t.listViews(s.views, s.maxViews)}</span>
              <span className="text-sm text-muted-foreground">{t.listExpires(new Date(s.expiresAt).toLocaleDateString('de-DE'))}</span>
            </div>
            {s.status === 'active' ? (
              confirm === s.id ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">{t.revokeConfirm}</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={busy} onClick={() => void revoke(s.id)}>{t.revokeYes}</Button>
                    <Button variant="outline" onClick={() => setConfirm(null)}>{t.revokeNo}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="self-start" onClick={() => setConfirm(s.id)}>{t.revoke}</Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
