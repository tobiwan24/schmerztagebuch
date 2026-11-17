// HTTP-Client der DK-Rotation (Spec 09, A-119): Zustand, Start (Owner), Abschluss (Owner).
export interface RotationServerState {
  keyEpoch: number;
  rotating: boolean;
  fromEpoch: number | null;
  prevDkWrap: string | null;
  pendingRecords: number;
  pendingBlobs: number;
}

export interface RotateBody {
  fromEpoch: number;
  wraps: { principalId: string; wrappedDk: string }[];
  prevDkWrap: string;
}

export class RotationApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'RotationApiError';
  }
}

export interface RotationApi {
  state(diaryId: string): Promise<RotationServerState>;
  rotate(diaryId: string, body: RotateBody): Promise<{ keyEpoch: number }>;
  complete(diaryId: string): Promise<{ keyEpoch: number; rotating: false }>;
}

export function createRotationApi(baseUrl = '', fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): RotationApi {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method, credentials: 'include', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new RotationApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `http-${res.status}`);
    return (await res.json()) as T;
  }
  const base = (id: string) => `/api/v1/diaries/${encodeURIComponent(id)}`;
  return {
    state: (id) => call('GET', `${base(id)}/rotation`),
    rotate: (id, body) => call('POST', `${base(id)}/rotate`, body),
    complete: (id) => call('POST', `${base(id)}/rotate/complete`),
  };
}
