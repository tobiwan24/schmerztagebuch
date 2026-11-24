// Einladung scannen (RDM-032, Spec 09): Kamera in der installierten App, erkannter Code → `/invite#<id>.<secret>`
// (bestehende Einladungsseite übernimmt). Ersatzweg ohne Kamera: Code oder Link einfügen. Der Kamera-Stream wird nach
// einem Treffer, beim Schließen und wenn die App in den Hintergrund geht sofort beendet.
import { useEffect, useRef, useState } from 'react';
import { CameraOff, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { loadQrDecoder } from '@/lib/qr';
import { parseInviteCode } from '@/sharing/flow';
import { deInvite } from '@/i18n/lazy/invite';

const t = deInvite.scan;
const SCAN_INTERVAL_MS = 250;
const MAX_FRAME_WIDTH = 640;

interface InviteQrScannerProps {
  /** Gültiger Code `<id>.<secret>` erkannt oder eingegeben. */
  onCode: (code: string) => void;
  onClose: () => void;
}

export function InviteQrScanner({ onCode, onClose }: InviteQrScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'denied' | 'unavailable'>('starting');
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const handlers = useRef({ onCode, onClose });
  useEffect(() => {
    handlers.current = { onCode, onClose };
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
    };
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setCamera('unavailable');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        if (!stopped) setCamera(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable');
        return;
      }
      const el = video.current;
      if (stopped || !el) return stop();
      el.srcObject = stream;
      await el.play().catch(() => undefined);
      setCamera('on');
      const decode = await loadQrDecoder();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (stopped || !ctx) return;
      timer = setInterval(() => {
        if (!el.videoWidth) return;
        const scale = Math.min(1, MAX_FRAME_WIDTH / el.videoWidth);
        canvas.width = Math.round(el.videoWidth * scale);
        canvas.height = Math.round(el.videoHeight * scale);
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        const found = decode(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const parsed = found ? parseInviteCode(found) : null;
        if (parsed) {
          stop();
          handlers.current.onCode(`${parsed.id}.${parsed.secret}`);
        }
      }, SCAN_INTERVAL_MS);
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handlers.current.onClose();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  function submit(value: string) {
    const parsed = parseInviteCode(value);
    if (!parsed) return setInvalid(true);
    setInvalid(false);
    onCode(`${parsed.id}.${parsed.secret}`);
  }

  async function paste() {
    const value = await navigator.clipboard?.readText().catch(() => '');
    if (!value) return;
    setText(value);
    submit(value);
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby="invite-scan-title" data-testid="invite-scan-dialog">
      <DialogTitle id="invite-scan-title">{t.title}</DialogTitle>
      <DialogDescription>{t.hint}</DialogDescription>
      <div className="mt-4 flex flex-col gap-4">
        {camera === 'starting' || camera === 'on' ? (
          <video ref={video} data-testid="invite-scan-video" muted playsInline aria-label={t.videoLabel} className="aspect-square w-full rounded-md bg-muted object-cover" />
        ) : (
          <p data-testid="invite-scan-no-camera" className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
            <CameraOff aria-hidden className="mt-0.5 size-4 shrink-0" />
            {camera === 'denied' ? t.denied : t.unavailable}
          </p>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor="invite-code">{t.codeLabel}</FieldLabel>
            <Input id="invite-code" data-testid="invite-code-input" value={text} aria-invalid={invalid || undefined} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            {invalid ? <FieldError>{t.invalid}</FieldError> : null}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void paste()}>
              <ClipboardPaste aria-hidden />
              {t.paste}
            </Button>
            <Button type="submit" data-testid="invite-code-submit">{t.redeem}</Button>
          </div>
        </form>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t.close}</Button>
      </DialogFooter>
    </Dialog>
  );
}
