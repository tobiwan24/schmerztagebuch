import { AlertTriangle } from 'lucide-react';
import { authErrorText, type AuthErrorCode } from '@/auth/errors';

/** Eindeutige, handlungsorientierte Meldung je Fehlercode (CRY-11). */
export function AuthErrorNotice({ code }: { code: AuthErrorCode }) {
  const t = authErrorText(code);
  return (
    <div role="alert" data-error-code={code} className="flex gap-2 rounded-md border border-destructive/50 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div>
        <p className="font-medium">{t.title}</p>
        <p className="text-muted-foreground">{t.action}</p>
      </div>
    </div>
  );
}
