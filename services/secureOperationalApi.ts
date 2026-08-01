/** Secure JSA operational callables (dual-run). */
const CALLABLE_BASE = 'https://us-central1-wellbuilt-sync.cloudfunctions.net';

async function callCallable<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${CALLABLE_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body?.error?.message || `Callable ${name} failed (${resp.status})`);
  }
  return body.result as T;
}

export async function secureSubmitJsa(
  jsa: Record<string, unknown>,
  opts?: {
    jsaId?: string;
    dayStatus?: Record<string, unknown>;
    dayStatusId?: string;
    driverHash?: string;
    idempotencyKey?: string;
  },
) {
  return callCallable<{ ok: boolean; jsaId: string }>('submitJsaRecord', {
    jsa,
    ...opts,
  });
}

export async function secureRequestJsaPdfPath(params: {
  companyId?: string;
  contentType?: string;
  byteSize?: number;
  driverHash?: string;
}) {
  return callCallable<{ path: string }>('requestStorageUploadPath', {
    kind: 'jsa_pdf',
    ...params,
  });
}
