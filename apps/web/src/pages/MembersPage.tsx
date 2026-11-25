// Tagebuch → Mitglieder & Einladungen (Spec 09): Mitglieder mit Rolle und Sicherheitsnummer, Einladung erzeugen
// (Link mit Geheimnis im Fragment), offene Einladungen widerrufen, Rolle ändern, entfernen, austreten.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InviteQrDialog } from '@/components/InviteQrDialog';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { Progress } from '@/components/ui/progress';
import { useSync } from '@/data/SyncContext';
import { useMembers, type MemberView } from '@/data/useSharing';
import { deMembers } from '@/i18n/lazy/members';

const t = deMembers;

export function MembersPage() {
  const { id = '' } = useParams();
  const m = useMembers(id);
  const rotation = useSync().rotation;
  const q = m.query;
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [link, setLink] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [removing, setRemoving] = useState<MemberView | null>(null);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  async function run(fn: () => Promise<unknown>) {
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    }
  }

  return (
    <>
      <PageHeader title={t.title} back />
      {q.status === 'error' ? <ErrorState onRetry={q.retry} /> : null}
      {q.status === 'ok' && !q.data.cloud ? <p className="text-sm text-muted-foreground">{t.needsAccount}</p> : null}
      {q.status === 'ok' && q.data.cloud ? (
        <>
          <p className="text-sm text-muted-foreground">{q.data.diaryName}</p>
          {rotation && rotation.diaryId === id ? (
            <Card data-testid="rotation-status" data-status={rotation.status}>
              <CardHeader>
                <CardTitle className="text-base">{t.rotation.title}</CardTitle>
                <CardDescription>{rotation.status === 'running' ? t.rotation.running : rotation.status === 'done' ? t.rotation.done : t.rotation.failed}</CardDescription>
              </CardHeader>
              {rotation.status === 'running' ? (
                <CardContent className="flex flex-col gap-2">
                  <Progress value={rotation.done} max={Math.max(rotation.total, 1)} aria-label={t.rotation.title} />
                  <span data-testid="rotation-progress" className="text-xs text-muted-foreground">{t.rotation.progress(rotation.done, rotation.total)}</span>
                </CardContent>
              ) : null}
            </Card>
          ) : null}
          <Card data-testid="members-card" className="gap-0 py-0">
            {q.data.members.map((mem) => (
              <div key={mem.principalId} data-testid="member" className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{mem.username}{mem.me ? ` (${t.you})` : ''}</span>
                  <span className="text-sm text-muted-foreground">{t.roles[mem.role]}{mem.role === 'editor' && mem.canEditTemplates ? ` · ${t.canEditTemplates}` : ''}</span>
                </div>
                {mem.safety ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t.safety}</span>
                    <code data-testid="safety-number" className="text-xs tracking-wider">{mem.safety.join(' ')}</code>
                  </div>
                ) : null}
                {q.data.myRole === 'owner' && !mem.me ? (
                  <div className="flex flex-wrap gap-2">
                    {mem.role !== 'editor' ? <Button size="sm" variant="outline" onClick={() => void run(() => m.changeRole(mem.principalId, 'editor'))}>{t.makeEditor}</Button> : null}
                    {mem.role !== 'viewer' ? <Button size="sm" variant="outline" onClick={() => void run(() => m.changeRole(mem.principalId, 'viewer'))}>{t.makeViewer}</Button> : null}
                    {mem.role === 'editor' ? (
                      <Button size="sm" variant="outline" onClick={() => void run(() => m.setTemplateRight(mem.principalId, !mem.canEditTemplates))}>
                        {mem.canEditTemplates ? t.revokeTemplates : t.allowTemplates}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="destructive" onClick={() => setRemoving(mem)}>{t.remove}</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>

          {q.data.myRole === 'owner' ? (
            <Card data-testid="invite-card">
              <CardHeader>
                <CardTitle className="text-base">{t.inviteTitle}</CardTitle>
                <CardDescription>{t.inviteHint}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ToggleGroup aria-label={t.role}>
                  {(['editor', 'viewer'] as const).map((r) => (
                    <ToggleGroupItem key={r} pressed={role === r} onClick={() => setRole(r)}>{t.roles[r]}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button onClick={() => void run(async () => setLink(await m.invite(role)))}>{t.createInvite}</Button>
                <Button variant="outline" data-testid="invite-qr-open" onClick={() => setQrOpen(true)}>
                  <QrCode aria-hidden />
                  {t.showQr}
                </Button>
                {link ? (
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    <span className="text-sm">{t.linkHint}</span>
                    <code data-testid="invite-link" className="break-all text-xs">{link}</code>
                    <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(link).catch(() => undefined)}>{t.copyLink}</Button>
                  </div>
                ) : null}
                {q.data.invitations.length ? (
                  <ul className="flex flex-col gap-2 text-sm" data-testid="open-invitations">
                    {q.data.invitations.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between gap-2">
                        <span>{t.openInvitation(t.roles[inv.role], new Date(inv.createdAt).toLocaleDateString('de-DE'))}</span>
                        <Button size="sm" variant="outline" onClick={() => void run(() => m.revokeInvitation(inv.id))}>{t.revoke}</Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Button variant="destructive" onClick={() => void run(async () => (await m.leave(), navigate('/more/diaries')))}>{t.leave}</Button>
          )}
          {error ? <p role="alert" className="text-sm text-destructive">{t.error}</p> : null}
        </>
      ) : null}
      {qrOpen ? (
        <InviteQrDialog
          role={role}
          create={m.inviteQr}
          poll={m.pollQrInvitation}
          revoke={m.revokeInvitation}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
      <Dialog open={removing !== null} onClose={() => setRemoving(null)} aria-labelledby="remove-member-title">
        <DialogTitle id="remove-member-title">{t.removeTitle(removing?.username ?? '')}</DialogTitle>
        <DialogDescription>{t.removeText}</DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoving(null)}>{t.cancel}</Button>
          <Button variant="destructive" onClick={() => void run(async () => (await m.remove(removing!.principalId), setRemoving(null)))}>{t.remove}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
