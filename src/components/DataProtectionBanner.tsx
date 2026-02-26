// src/components/DataProtectionBanner.tsx
// Zeigt Safari-Warnung für iOS-Nutzer die nicht Safari verwenden.
// Hinweis zur App-Installation erfolgt im SetupWizard (erster Step).

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isIOSNonSafari } from '@/utils/persistentStorage';

export function DataProtectionBanner() {
  const showSafariWarning = isIOSNonSafari();

  const [safariDismissed, setSafariDismissed] = useState(() =>
    localStorage.getItem('safari_warning_dismissed') === 'true'
  );

  if (!showSafariWarning || safariDismissed) return null;

  return (
    <div className="px-4 pt-3">
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-900">
                Für die beste Erfahrung und um Datenverlust zu vermeiden, bitte{' '}
                <strong>Safari</strong> verwenden.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.setItem('safari_warning_dismissed', 'true');
                setSafariDismissed(true);
              }}
              className="h-7 w-7 p-0 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
