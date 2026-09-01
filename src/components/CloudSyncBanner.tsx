// src/components/CloudSyncBanner.tsx
// Migrations-Banner: "Jetzt zur Cloud-Synchronisierung wechseln" — erscheint, wenn lokale
// Bestandsdaten vorhanden sind und noch kein Cloud-Account auf diesem Gerät verknüpft ist
// (Spec-Abschnitt "Datenmigrationsablauf", Schritte 1–2).

import { useState, useEffect } from 'react';
import { Cloud, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import db from '../db';
import { isCloudSyncEnabled } from '../services/cloudAuthService';
import { useNavigation } from '../contexts/NavigationContext';

const DISMISSED_KEY = 'cloudSyncBannerDismissed';

export function CloudSyncBanner() {
  const { navigate } = useNavigation();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
      if (await isCloudSyncEnabled()) return;
      const [templateCount, entryCount] = await Promise.all([db.templates.count(), db.entries.count()]);
      if (!cancelled && (templateCount > 0 || entryCount > 0)) setShouldShow(true);
    })();
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShouldShow(false);
  }

  if (!shouldShow) return null;

  return (
    <div className="mx-4 mb-3">
      <Card className="border-blue-300 bg-blue-50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Cloud className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900">Cloud-Sync verfügbar</p>
                <p className="text-sm text-blue-800 mt-0.5">
                  Du kannst deine Daten jetzt geräteübergreifend synchronisieren — Ende-zu-Ende-verschlüsselt,
                  gesichert per Face ID.
                </p>
                <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => navigate('cloudSetup')}>
                  Jetzt zur Cloud-Synchronisierung wechseln
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={dismiss} className="h-7 w-7 p-0 flex-shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
