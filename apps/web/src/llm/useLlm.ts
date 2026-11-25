// Hook für KI-Knöpfe und die Einstellungen: Serverstatus (einmal je Seitenladung), Opt-in, Online-Zustand.
import { useCallback, useEffect, useState } from 'react';
import type { LlmStatus } from '@stb/sync-protocol';
import { useAuth } from '@/auth/AuthContext';
import { fetchLlmStatus, llmAvailability, readLlmOptIn, writeLlmOptIn, type LlmAvailability } from './client';

let cached: Promise<LlmStatus | null> | null = null;

function loadStatus(): Promise<LlmStatus | null> {
  cached ??= fetchLlmStatus().catch((e: unknown) => {
    cached = null; // Fehler nicht merken: nächster Versuch fragt erneut
    throw e;
  });
  return cached;
}

/** Nur für Tests/Abmeldung: verwirft den gemerkten Status. */
export function resetLlmStatusCache(): void {
  cached = null;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export interface LlmApi {
  availability: LlmAvailability;
  /** `undefined`: lädt oder nicht abrufbar; `null`: auf dem Server aus. */
  status: LlmStatus | null | undefined;
  loading: boolean;
  optIn: boolean;
  setOptIn: (on: boolean) => void;
  syncAttached: boolean;
  online: boolean;
}

export function useLlm(): LlmApi {
  const { syncAttached } = useAuth();
  const online = useOnline();
  const [optIn, setOptInState] = useState(() => readLlmOptIn());
  const [status, setStatus] = useState<LlmStatus | null | undefined>(undefined);
  const [loading, setLoading] = useState(syncAttached);

  useEffect(() => {
    if (!syncAttached || !online) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    loadStatus().then(
      (s) => live && (setStatus(s), setLoading(false)),
      () => live && (setStatus(undefined), setLoading(false)),
    );
    return () => {
      live = false;
    };
  }, [syncAttached, online]);

  const setOptIn = useCallback((on: boolean) => {
    writeLlmOptIn(on);
    setOptInState(on);
  }, []);

  return { availability: llmAvailability({ syncAttached, status, optIn, online }), status, loading, optIn, setOptIn, syncAttached, online };
}
